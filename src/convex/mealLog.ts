import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { RATE_LIMITS, consumeRateLimit } from "./rateLimit";
import { mealTypeValidator } from "./schema";
import { assertDate, assertMaxItems, assertRange, assertText } from "./validation";

/** Санитарные лимиты на одну запись дневника (защита от мусора). */
const MAX_ENTRY_ITEMS = 50;
const MAX_NAME_LEN = 100;
const MAX_QUANTITY = 1000;
const MAX_CALORIES = 20000;
const MAX_MACRO_G = 2000;

/** Понятная ошибка сессии вместо «Server Error» без текста. */
function authError(): ConvexError<{ message: string }> {
  return new ConvexError({ message: "Сессия истекла — войдите заново." });
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();
    validateEntry(args);
    await consumeRateLimit(ctx, `${userId}:mealEntry`, RATE_LIMITS.mealEntry);
    return await ctx.db.insert("mealLog", {
      ...args,
      userId,
      createdAt: Date.now(),
    });
  },
});

export const addEntries = mutation({
  args: {
    entries: v.array(
      v.object({
        date: v.string(),
        mealType: mealTypeValidator,
        name: v.string(),
        quantity: v.number(),
        calories: v.number(),
        protein: v.number(),
        carbs: v.number(),
        fat: v.number(),
        foodId: v.optional(v.id("foods")),
      }),
    ),
  },
  handler: async (ctx, { entries }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();
    const entry = await ctx.db.get(args.id);
    if (!entry || entry.userId !== userId) {
      throw new ConvexError({ message: "Запись не найдена или уже удалена." });
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
    });
  },
});

export const deleteEntry = mutation({
  args: { id: v.id("mealLog") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();
    const entry = await ctx.db.get(id);
    if (!entry || entry.userId !== userId) {
      throw new ConvexError({ message: "Запись не найдена или уже удалена." });
    }
    await ctx.db.delete(id);
  },
});
