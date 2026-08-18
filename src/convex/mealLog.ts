import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { RATE_LIMITS, consumeRateLimit } from "./rateLimit";
import { mealTypeValidator, nutritionSourceValidator } from "./schema";
import { assertDate, assertMaxItems, assertRange, assertText } from "./validation";
import {
  duplicateError,
  markIdempotencyDone,
  releaseIdempotencyKey,
  tryConsumeIdempotencyKey,
} from "./idempotency";
import { ErrorCode, appError } from "./errors";

/** Санитарные лимиты на одну запись дневника (защита от мусора). */
const MAX_ENTRY_ITEMS = 50;
const MAX_NAME_LEN = 100;
const MAX_QUANTITY = 1000;
const MAX_CALORIES = 20000;
const MAX_MACRO_G = 2000;

/** Понятная ошибка сессии вместо «Server Error» без текста. */
function authError(): never {
  return appError(ErrorCode.AUTH_REQUIRED, "Сессия истекла — войдите заново.");
}

/** Проверяет общие поля записи дневника. */
function validateEntry(args: {
  date: string;
  name: string;
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}) {
  assertDate(args.date);
  assertText(args.name, MAX_NAME_LEN, "Название");
  assertRange(args.quantity, 0, MAX_QUANTITY, "Количество");
  assertRange(args.calories, 0, MAX_CALORIES, "Калории");
  assertRange(args.protein, 0, MAX_MACRO_G, "Белки (г)");
  assertRange(args.carbs, 0, MAX_MACRO_G, "Углеводы (г)");
  assertRange(args.fat, 0, MAX_MACRO_G, "Жиры (г)");
}

/** Общая схема аргумента записи (одна запись из addEntry/addEntries). */
const entryArgsValidator = v.object({
  date: v.string(),
  mealType: mealTypeValidator,
  name: v.string(),
  quantity: v.number(),
  calories: v.number(),
  protein: v.number(),
  carbs: v.number(),
  fat: v.number(),
  foodId: v.optional(v.id("foods")),
  // Откуда взяты КБЖУ: передаётся приложением (не клиентом произвольно).
  nutritionSource: v.optional(nutritionSourceValidator),
  sourceId: v.optional(v.string()),
});

export const getByDate = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("mealLog")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", date),
      )
      .order("desc")
      .collect();
  },
});

/** Entries within an inclusive date range, oldest first. */
export const getByRange = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("mealLog")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", from).lte("date", to),
      )
      .order("asc")
      .collect();
  },
});

/** Итог дня по дневнику: калории/БЖУ/число записей на дату в диапазоне.
 *
 * Агрегация на сервере вместо пересылки всех записей дня клиенту: графики
 * Прогресса тянули тысячи строк дневника целиком, чтобы сложить их в
 * браузере. Здесь клиент получает одну строку на дату (projection + sum),
 * а полные записи остаются доступны через getByDate/getByRange (для
 * дневника и экспорта). Сумма считается на сервере — чтение то же, но
 * сетевой payload и память клиента на порядок меньше.
 */
export const getDailyTotals = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const entries = await ctx.db
      .query("mealLog")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", from).lte("date", to),
      )
      .order("asc")
      .collect();

    const byDate = new Map<
      string,
      { calories: number; protein: number; carbs: number; fat: number; count: number }
    >();
    for (const e of entries) {
      const cur = byDate.get(e.date) ?? {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        count: 0,
      };
      cur.calories += e.calories;
      cur.protein += e.protein;
      cur.carbs += e.carbs;
      cur.fat += e.fat;
      cur.count += 1;
      byDate.set(e.date, cur);
    }
    return [...byDate.entries()].map(([date, totals]) => ({ date, ...totals }));
  },
});

export const addEntry = mutation({
  args: {
    date: v.string(),
    mealType: mealTypeValidator,
    name: v.string(),
    quantity: v.number(),
    calories: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
    foodId: v.optional(v.id("foods")),
    nutritionSource: v.optional(nutritionSourceValidator),
    sourceId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();
    const { idempotencyKey, ...entry } = args;

    const fresh = await tryConsumeIdempotencyKey(ctx, userId, idempotencyKey);
    if (!fresh) throw duplicateError();

    try {
      validateEntry(entry);
      await consumeRateLimit(ctx, `${userId}:mealEntry`, RATE_LIMITS.mealEntry);
      const id = await ctx.db.insert("mealLog", {
        ...entry,
        userId,
        createdAt: Date.now(),
      });
      await markIdempotencyDone(ctx, userId, idempotencyKey);
      return id;
    } catch (err) {
      await releaseIdempotencyKey(ctx, userId, idempotencyKey);
      throw err;
    }
  },
});

export const addEntries = mutation({
  args: {
    entries: v.array(entryArgsValidator),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, { entries, idempotencyKey }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();

    const fresh = await tryConsumeIdempotencyKey(ctx, userId, idempotencyKey);
    if (!fresh) throw duplicateError();

    try {
      assertMaxItems(entries, MAX_ENTRY_ITEMS, "Записи дневника");
      await consumeRateLimit(ctx, `${userId}:mealBulk`, RATE_LIMITS.mealBulk);
      for (const entry of entries) {
        validateEntry(entry);
      }
      for (const entry of entries) {
        await ctx.db.insert("mealLog", {
          ...entry,
          userId,
          createdAt: Date.now(),
        });
      }
      await markIdempotencyDone(ctx, userId, idempotencyKey);
    } catch (err) {
      await releaseIdempotencyKey(ctx, userId, idempotencyKey);
      throw err;
    }
  },
});

/** Редактирование существующей записи дневника (только своей). */
export const updateEntry = mutation({
  args: {
    id: v.id("mealLog"),
    mealType: mealTypeValidator,
    name: v.string(),
    quantity: v.number(),
    calories: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
    // Источник КБЖУ пересчитывается приложением при редактировании порции —
    // клиент не может «повысить» произвольную запись до verified.
    nutritionSource: v.optional(nutritionSourceValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();
    const entry = await ctx.db.get(args.id);
    if (!entry) {
      throw appError(
        ErrorCode.RESOURCE_NOT_FOUND,
        "Запись не найдена или уже удалена.",
      );
    }
    // Чужая запись отвечает так же, как несуществующая: не раскрываем
    // существование записи другого пользователя (защита от перебора id).
    if (entry.userId !== userId) {
      throw appError(
        ErrorCode.RESOURCE_NOT_FOUND,
        "Запись не найдена или уже удалена.",
      );
    }

    validateEntry({
      date: entry.date,
      name: args.name,
      quantity: args.quantity,
      calories: args.calories,
      protein: args.protein,
      carbs: args.carbs,
      fat: args.fat,
    });

    await ctx.db.patch(args.id, {
      mealType: args.mealType,
      name: args.name,
      quantity: args.quantity,
      calories: args.calories,
      protein: args.protein,
      carbs: args.carbs,
      fat: args.fat,
      ...(args.nutritionSource ? { nutritionSource: args.nutritionSource } : {}),
    });
  },
});

export const deleteEntry = mutation({
  args: { id: v.id("mealLog") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();
    const entry = await ctx.db.get(id);
    if (!entry) {
      throw appError(
        ErrorCode.RESOURCE_NOT_FOUND,
        "Запись не найдена или уже удалена.",
      );
    }
    if (entry.userId !== userId) {
      throw appError(
        ErrorCode.RESOURCE_NOT_FOUND,
        "Запись не найдена или уже удалена.",
      );
    }
    await ctx.db.delete(id);
  },
});
