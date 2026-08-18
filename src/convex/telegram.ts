/**
 * Telegram-интеграция (бот + Mini App) на Convex.
 *
 * Поток вебхука: Telegram шлёт POST на /telegram-webhook (http.ts) →
 * `handleUpdate` (httpAction) валидирует секрет → `processBotUpdate`
 * (мутация: у неё есть ctx.db) выполняет логику `src/lib/telegram/bot.ts`
 * и возвращает сериализуемый план операций → httpAction выполняет их
 * против Bot API (fetch доступен только в action-контексте).
 *
 * Вебхук работает без отдельного сервера: у Convex-деплоя есть публичный
 * HTTPS URL, на который Telegram может слать апдейты. Требуемые env:
 *   TELEGRAM_BOT_TOKEN      — токен от @BotFather;
 *   TELEGRAM_WEBHOOK_SECRET — произвольная строка, проверяется в заголовке
 *                             X-Telegram-Bot-Api-Secret-Token (ставится
 *                             тем же значением при регистрации вебхука).
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import { toDateKey } from "../lib/dates";
import { FOOD_LIBRARY } from "../lib/mealLibrary";
import { computeTargets, waterGoal } from "../lib/nutrition";
import { searchLocalLibrary } from "../lib/productSearch";
import { recommendLoad } from "../lib/workoutIntelligence";
import {
  DEFAULT_MINI_APP_URL,
  answerCallbackQuery,
  editMessageText,
  escapeHtml,
  sendMessage,
} from "../lib/telegram/api";
import { telegramStatus as buildTelegramStatus } from "../lib/telegram/status";
import {
  handleUpdate as dispatchBotUpdate,
  normalizeUpdate,
  type BotDeps,
  type BotOp,
  type ChatState,
  type DaySummary,
  type RecentFood,
  type SearchFood,
  type TgUser,
  type TodayWorkout,
} from "../lib/telegram/bot";
import {
  httpAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { api } from "./_generated/api";
import { RATE_LIMITS, consumeRateLimit } from "./rateLimit";
import { ROLES } from "./schema";
import { assertRange } from "./validation";

/** Контекст мутации (с типизированной схемой). */
type MutationCtx = GenericMutationCtx<DataModel>;

/** Приводит строковый userId из BotDeps к типизированному Id. */
function asUser(userId: string): Id<"users"> {
  return userId as Id<"users">;
}

/** Тип приёма пищи по часу: до 11 — завтрак, до 16 — обед, до 21 — ужин. */
function mealTypeForHour(
  hour: number,
): "breakfast" | "lunch" | "dinner" | "snack" {
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

/* ------------------------------------------------------------------ */
/* Коды привязки                                                      */
/* ------------------------------------------------------------------ */

/** Без неоднозначных символов: 0/O, 1/I/L. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_TTL_MS = 10 * 60_000;

function generateLinkCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function sessionError(): ConvexError<{ message: string }> {
  return new ConvexError({ message: "Сессия истекла — войдите заново." });
}

/** Человекочитаемый текст ошибки (ConvexError → data.message). */
function errorText(e: unknown): string {
  if (e instanceof ConvexError) {
    const data = e.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  }
  return e instanceof Error ? e.message : "Что-то пошло не так.";
}

/** Код привязки Telegram для текущего пользователя (живёт 10 минут). */
export const requestLinkCode = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw sessionError();
    await consumeRateLimit(ctx, `${userId}:telegramLink`, RATE_LIMITS.telegramLink);

    // Старые коды пользователя — протухшие или неиспользованные: перевыпускаем.
    const old = await ctx.db
      .query("linkCodes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const doc of old) await ctx.db.delete(doc._id);

    const code = generateLinkCode();
    const expiresAt = Date.now() + CODE_TTL_MS;
    await ctx.db.insert("linkCodes", {
      userId,
      code,
      expiresAt,
      createdAt: Date.now(),
    });
    return { code, expiresAt };
  },
});

/** Статус привязки Telegram текущего пользователя (для Профиля). */
export const myLink = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const doc = await ctx.db
      .query("telegramAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!doc) return null;
    return {
      username: doc.username ?? null,
      firstName: doc.firstName ?? null,
      linkedAt: doc.linkedAt,
      lastActiveAt: doc.lastActiveAt ?? null,
    };
  },
});

/** Internal: обновить lastActiveAt привязанного аккаунта (вызывается из
 *  провайдера входа через Telegram — «последняя активность» сессии). */
export const touchLastActive = internalMutation({
  args: { telegramUserId: v.number() },
  handler: async (ctx, { telegramUserId }) => {
    const doc = await ctx.db
      .query("telegramAccounts")
      .withIndex("by_telegram", (q) => q.eq("telegramUserId", telegramUserId))
      .first();
    if (doc) await ctx.db.patch(doc._id, { lastActiveAt: Date.now() });
  },
});

/** Отвязать Telegram-аккаунт от текущего пользователя. */
export const unlink = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw sessionError();
    const doc = await ctx.db
      .query("telegramAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (doc) await ctx.db.delete(doc._id);
  },
});

/** Привязка по коду: вызывается ботом (без пользовательской сессии). */
export const linkByCode = mutation({
  args: {
    code: v.string(),
    telegramUserId: v.number(),
    username: v.optional(v.string()),
    firstName: v.optional(v.string()),
    chatId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    const codeDoc = await ctx.db
      .query("linkCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!codeDoc) {
      throw new ConvexError({
        message: "Код не найден. Проверьте код и попробуйте ещё раз.",
      });
    }
    // Код одноразовый: удаляем при первом использовании независимо от исхода.
    await ctx.db.delete(codeDoc._id);
    if (codeDoc.expiresAt < Date.now()) {
      throw new ConvexError({
        message:
          "Код истёк. Запросите новый код в приложении (Профиль → Telegram).",
      });
    }

    const existing = await ctx.db
      .query("telegramAccounts")
      .withIndex("by_telegram", (q) =>
        q.eq("telegramUserId", args.telegramUserId),
      )
      .first();
    if (existing && existing.userId !== codeDoc.userId) {
      throw new ConvexError({
        message:
          "Этот Telegram уже привязан к другому аккаунту КИЛО. Сначала отвяжите его в приложении.",
      });
    }
    if (existing) {
      // Повторная привязка того же аккаунта — обновляем метаданные.
      await ctx.db.patch(existing._id, {
        username: args.username,
        firstName: args.firstName,
        chatId: args.chatId,
        lastActiveAt: Date.now(),
      });
      return { linked: true, username: args.username ?? null };
    }
    await ctx.db.insert("telegramAccounts", {
      telegramUserId: args.telegramUserId,
      userId: codeDoc.userId,
      username: args.username,
      firstName: args.firstName,
      chatId: args.chatId,
      linkedAt: Date.now(),
      lastActiveAt: Date.now(),
    });
    return { linked: true, username: args.username ?? null };
  },
});

/* ------------------------------------------------------------------ */
/* Вход через Telegram (используется провайдером auth/telegramLogin)  */
/* ------------------------------------------------------------------ */

/** Internal: поиск аккаунта по telegram id (для авторизации). */
export const findByTelegram = internalQuery({
  args: { telegramUserId: v.number() },
  handler: async (ctx, { telegramUserId }) => {
    const doc = await ctx.db
      .query("telegramAccounts")
      .withIndex("by_telegram", (q) => q.eq("telegramUserId", telegramUserId))
      .first();
    return doc ? { userId: doc.userId } : null;
  },
});

/**
 * Internal: создание аккаунта КИЛО по Telegram (первый вход). Подпись уже
 * проверена в authorize провайдера; здесь — только запись. Повторная проверка
 * by_telegram защищает от гонки двух одновременных входов одного telegram id.
 */
export const createAccountFromTelegram = internalMutation({
  args: {
    telegramUserId: v.number(),
    firstName: v.optional(v.string()),
    username: v.optional(v.string()),
  },
  handler: async (ctx, { telegramUserId, firstName, username }) => {
    const existing = await ctx.db
      .query("telegramAccounts")
      .withIndex("by_telegram", (q) => q.eq("telegramUserId", telegramUserId))
      .first();
    if (existing) return existing.userId;

    const userId = await ctx.db.insert("users", {
      name: firstName ?? undefined,
      role: ROLES.USER,
      isAnonymous: false,
    });
    await ctx.db.insert("telegramAccounts", {
      telegramUserId,
      userId,
      username,
      firstName,
      linkedAt: Date.now(),
      lastActiveAt: Date.now(),
    });
    return userId;
  },
});

/* ------------------------------------------------------------------ */
/* Обработка апдейта (мутация + httpAction)                           */
/* ------------------------------------------------------------------ */

/** Реализация BotDeps поверх ctx.db — единственное место с БД. */
function makeBotDeps(ctx: MutationCtx): BotDeps {
  return {
    // URL Mini App для кнопки «Открыть приложение» в меню бота. Задаётся в
    // Convex dashboard (TELEGRAM_MINI_APP_URL); фолбэк — канонический домен.
    webAppUrl: process.env.TELEGRAM_MINI_APP_URL ?? DEFAULT_MINI_APP_URL,

    async findUserByTelegram(telegramUserId) {
      const doc = await ctx.db
        .query("telegramAccounts")
        .withIndex("by_telegram", (q) => q.eq("telegramUserId", telegramUserId))
        .first();
      if (!doc) return null;
      // «Последняя активность» — каждое обращение к боту двигает метку.
      await ctx.db.patch(doc._id, { lastActiveAt: Date.now() });
      return { userId: doc.userId };
    },

    async getLinkCodeInfo(code) {
      const codeDoc = await ctx.db
        .query("linkCodes")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (!codeDoc || codeDoc.expiresAt < Date.now()) return null;
      const user = await ctx.db.get(codeDoc.userId);
      return { name: (user as { name?: string } | null)?.name ?? null };
    },

    async linkByCode(code, meta: TgUser & { chatId?: number }) {
      try {
        await ctx.runMutation(api.telegram.linkByCode, {
          code,
          telegramUserId: meta.id,
          username: meta.username,
          firstName: meta.first_name,
          chatId: meta.chatId,
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: errorText(e) };
      }
    },

    async getDaySummary(userId): Promise<DaySummary | null> {
      const uid = asUser(userId);
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", uid))
        .first();
      if (!profile) return null;
      const targets = computeTargets(profile);
      const date = toDateKey(new Date());

      const entries = await ctx.db
        .query("mealLog")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", uid).eq("date", date),
        )
        .collect();
      let calories = 0;
      let protein = 0;
      let carbs = 0;
      let fat = 0;
      for (const e of entries) {
        calories += e.calories;
        protein += e.protein;
        carbs += e.carbs;
        fat += e.fat;
      }
      const water = await ctx.db
        .query("waterEntries")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", uid).eq("date", date),
        )
        .first();

      return {
        calories: Math.round(calories),
        caloriesTarget: targets.calories,
        protein: Math.round(protein * 10) / 10,
        proteinTarget: targets.protein,
        carbs: Math.round(carbs * 10) / 10,
        carbsTarget: targets.carbs,
        fat: Math.round(fat * 10) / 10,
        fatTarget: targets.fat,
        waterMl: water?.amountMl ?? 0,
        waterTarget: waterGoal(profile.weightKg),
      };
    },

    async searchFoods(query, limit = 8): Promise<SearchFood[]> {
      return searchLocalLibrary(query, limit).map((f) => ({
        key: f.name,
        name: f.name,
        unit: f.unit,
        servingGrams: f.servingGrams,
        calories: f.calories,
        protein: f.protein,
        carbs: f.carbs,
        fat: f.fat,
      }));
    },

    async getRecentFoods(userId, limit = 8): Promise<RecentFood[]> {
      const uid = asUser(userId);
      const entries = await ctx.db
        .query("mealLog")
        .withIndex("by_user_date", (q) => q.eq("userId", uid))
        .order("desc")
        .take(60);
      const seen = new Set<string>();
      const out: RecentFood[] = [];
      for (const e of entries) {
        if (seen.has(e.name)) continue;
        seen.add(e.name);

        const lib = FOOD_LIBRARY.find((f) => f.name === e.name);
        let servingGrams = lib?.servingGrams ?? 100;
        if (!lib && e.foodId) {
          const food = await ctx.db.get(e.foodId);
          if (food) servingGrams = food.amount;
        }
        const grams = Math.max(1, Math.round(e.quantity * servingGrams));
        const ratio = grams > 0 ? 100 / grams : 0;
        out.push({
          key: e.name,
          name: e.name,
          unit: lib?.unit ?? "г",
          servingGrams,
          calories: lib ? lib.calories : Math.round(e.calories * ratio),
          protein: lib ? lib.protein : Math.round(e.protein * ratio * 10) / 10,
          carbs: lib ? lib.carbs : Math.round(e.carbs * ratio * 10) / 10,
          fat: lib ? lib.fat : Math.round(e.fat * ratio * 10) / 10,
          grams,
        });
        if (out.length >= limit) break;
      }
      return out;
    },

    async addMealEntry(userId, food, grams) {
      const uid = asUser(userId);
      await consumeRateLimit(ctx, `${userId}:mealEntry`, RATE_LIMITS.mealEntry);
      assertRange(grams, 1, 2000, "Количество");
      const ratio = grams / 100;
      const calories = Math.round(food.calories * ratio);
      const protein = Math.round(food.protein * ratio * 10) / 10;
      const carbs = Math.round(food.carbs * ratio * 10) / 10;
      const fat = Math.round(food.fat * ratio * 10) / 10;
      const quantity =
        food.unit === "г"
          ? Math.round((grams / food.servingGrams) * 100) / 100
          : Math.max(1, Math.round(grams / food.servingGrams));
      await ctx.db.insert("mealLog", {
        userId: uid,
        date: toDateKey(new Date()),
        mealType: mealTypeForHour(new Date().getHours()),
        name: food.name,
        quantity,
        calories,
        protein,
        carbs,
        fat,
        createdAt: Date.now(),
      });
      return { grams, calories, protein, carbs, fat };
    },

    async addWater(userId, amountMl) {
      const uid = asUser(userId);
      await consumeRateLimit(ctx, `${userId}:water`, RATE_LIMITS.water);
      assertRange(amountMl, -5000, 5000, "Объём воды (мл)");
      const date = toDateKey(new Date());
      const existing = await ctx.db
        .query("waterEntries")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", uid).eq("date", date),
        )
        .first();
      let total: number;
      if (existing) {
        total = Math.max(0, existing.amountMl + amountMl);
        if (total === 0) await ctx.db.delete(existing._id);
        else await ctx.db.patch(existing._id, { amountMl: total });
      } else if (amountMl <= 0) {
        total = 0;
      } else {
        total = amountMl;
        await ctx.db.insert("waterEntries", {
          userId: uid,
          date,
          amountMl,
          createdAt: Date.now(),
        });
      }
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", uid))
        .first();
      return {
        totalMl: total,
        goalMl: profile ? waterGoal(profile.weightKg) : 1500,
      };
    },

    async getTodayWorkout(userId): Promise<TodayWorkout | null> {
      const uid = asUser(userId);
      const plan = await ctx.db
        .query("workoutPlans")
        .withIndex("by_user", (q) => q.eq("userId", uid))
        .first();
      if (!plan) return null;
      const weekday = (new Date().getDay() + 6) % 7;
      const day = plan.days.find((d) => d.day === weekday);
      if (!day) return null;

      const logs = await ctx.db
        .query("workoutLogs")
        .withIndex("by_user_date", (q) => q.eq("userId", uid))
        .order("desc")
        .take(60);
      const lastByExercise = new Map<
        string,
        { weightKg: number; reps: number; rpe?: number }
      >();
      for (const log of logs) {
        for (const ex of log.exercises) {
          if (!lastByExercise.has(ex.name)) {
            lastByExercise.set(ex.name, {
              weightKg: ex.weightKg,
              reps: ex.reps,
              rpe: ex.rpe,
            });
          }
        }
      }

      const exercises = day.exercises.map((ex) => {
        const last = lastByExercise.get(ex.name);
        const rec = last
          ? recommendLoad({
              name: ex.name,
              planReps: ex.reps,
              planWeightKg: ex.weightKg,
              last,
            })
          : null;
        let advice: string | undefined;
        if (rec && rec.kind !== "new") {
          advice =
            rec.weightKg !== undefined
              ? `${rec.weightKg} кг × ${rec.repsMin ?? "—"}–${rec.repsMax ?? "—"}`
              : `${rec.repsMin ?? "—"}–${rec.repsMax ?? "—"} повторов`;
        }
        return {
          name: ex.name,
          sets: ex.sets,
          reps: ex.reps,
          last: last ? `${last.weightKg}×${last.reps}` : undefined,
          advice,
        };
      });
      return {
        focus: day.focus,
        approxMinutes: day.approxMinutes,
        exercises,
      };
    },

    async getChatState(chatId): Promise<ChatState | null> {
      const doc = await ctx.db
        .query("telegramStates")
        .withIndex("by_chat", (q) => q.eq("chatId", chatId))
        .first();
      return (doc?.state as ChatState | undefined) ?? null;
    },

    async setChatState(chatId, state) {
      const doc = await ctx.db
        .query("telegramStates")
        .withIndex("by_chat", (q) => q.eq("chatId", chatId))
        .first();
      if (doc) {
        await ctx.db.patch(doc._id, { state, updatedAt: Date.now() });
      } else {
        await ctx.db.insert("telegramStates", {
          chatId,
          state,
          updatedAt: Date.now(),
        });
      }
    },

    async clearChatState(chatId) {
      const doc = await ctx.db
        .query("telegramStates")
        .withIndex("by_chat", (q) => q.eq("chatId", chatId))
        .first();
      if (doc) await ctx.db.delete(doc._id);
    },
  };
}

/**
 * Обработка одного апдейта с доступом к БД: httpAction не имеет ctx.db,
 * поэтому вся логика (чтения/записи + диспетчер бота) выполняется внутри
 * мутации, а наружу возвращается сериализуемый план операций Bot API.
 */
/** Суточное окно, в течение которого Telegram может повторить апдейт. */
const SEEN_UPDATE_TTL_MS = 24 * 60 * 60 * 1000;

export const processBotUpdate = mutation({
  args: { update: v.any() },
  handler: async (ctx, { update }) => {
    const normalized = normalizeUpdate(update);
    if (!normalized) return [];

    // Replay protection: Telegram гарантирует доставку, но не «ровно один раз»
    // (при сетевых сбоях он может переслать тот же апдейт). Проверяем
    // update_id по индексу ДО обработки и, если уже встречали, пропускаем —
    // мутация не выполнится дважды (mealLog/water/привязка не задвоятся).
    const seen = await ctx.db
      .query("telegramSeenUpdates")
      .withIndex("by_updateId", (q) => q.eq("updateId", normalized.updateId))
      .first();
    if (seen) return [];
    await ctx.db.insert("telegramSeenUpdates", {
      updateId: normalized.updateId,
      processedAt: Date.now(),
    });
    // Изредка подчищаем старые метки (окно повторов уже закрыто).
    if (normalized.updateId % 64 === 0) {
      const cutoff = Date.now() - SEEN_UPDATE_TTL_MS;
      const old = await ctx.db
        .query("telegramSeenUpdates")
        .withIndex("by_processedAt", (q) => q.lt("processedAt", cutoff))
        .collect();
      for (const doc of old) await ctx.db.delete(doc._id);
    }

    const deps = makeBotDeps(ctx);
    return dispatchBotUpdate(normalized, deps);
  },
});

/** Выполняет одну операцию бота против Bot API. */
async function executeOp(op: BotOp, token: string): Promise<void> {
  switch (op.op) {
    case "sendMessage":
      await sendMessage(token, op.chatId, op.text, {
        parseMode: "HTML",
        replyMarkup: op.buttons
          ? { inline_keyboard: op.buttons }
          : undefined,
      });
      break;
    case "editMessage":
      await editMessageText(token, op.chatId, op.messageId, op.text, {
        parseMode: "HTML",
        replyMarkup: op.buttons
          ? { inline_keyboard: op.buttons }
          : undefined,
      });
      break;
    case "answerCallback":
      await answerCallbackQuery(token, op.callbackQueryId, op.text);
      break;
  }
}

/** chat_id из сырого апдейта (для сообщения об ошибке). */
function extractChatId(raw: unknown): number | null {
  const u = (raw ?? {}) as Record<string, unknown>;
  const msg = u.message as Record<string, unknown> | undefined;
  const cq = u.callback_query as Record<string, unknown> | undefined;
  const source =
    msg ?? (cq?.message as Record<string, unknown> | undefined);
  const chat = source?.chat as Record<string, unknown> | undefined;
  return typeof chat?.id === "number" ? (chat.id as number) : null;
}

/**
 * GET /telegram-status — диагностика интеграции без секретов:
 * задан ли токен (только префикс), принимает ли его Bot API (getMe),
 * зарегистрирован ли вебхук, заданы ли TELEGRAM_WEBHOOK_SECRET и
 * TELEGRAM_MINI_APP_URL, и принимает ли Telegram origin для Login Widget
 * (кнопка «Войти через Telegram»). Origin проверки — из query-параметра
 * ?origin=https://…, по умолчанию канонический домен. Ответ — JSON,
 * который можно открыть в браузере или curl'ом.
 */
export const telegramStatus = httpAction(async (_ctx, request) => {
  const requestedOrigin = new URL(request.url).searchParams.get("origin");
  const status = await buildTelegramStatus({
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    miniAppUrl: process.env.TELEGRAM_MINI_APP_URL,
    loginWidgetOrigin: requestedOrigin ?? DEFAULT_MINI_APP_URL,
  });
  return new Response(JSON.stringify(status, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});

/** POST /telegram-webhook — приём апдейтов от Telegram. */
export const handleUpdate = httpAction(async (ctx, request) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return new Response("TELEGRAM_BOT_TOKEN не задан", { status: 500 });
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (
    secret &&
    request.headers.get("x-telegram-bot-api-secret-token") !== secret
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (!normalizeUpdate(raw)) return new Response("Ignored", { status: 200 });

  let ops: BotOp[];
  try {
    ops = await ctx.runMutation(api.telegram.processBotUpdate, { update: raw });
  } catch (e) {
    // Ошибка данных (rate-limit, лимиты) — сообщаем пользователю, не 500-им.
    const chatId = extractChatId(raw);
    if (chatId !== null) {
      try {
        await sendMessage(token, chatId, escapeHtml(errorText(e)));
      } catch {
        // Пользователь мог заблокировать бота — молча пропускаем.
      }
    }
    return new Response("OK", { status: 200 });
  }

  for (const op of ops) {
    try {
      await executeOp(op, token);
    } catch (e) {
      // Одно сообщение может не уйти (бот заблокирован, сообщение удалено,
      // некорректный parse_mode=HTML) — остальные операции выполняем, апдейт
      // не валим. Но логируем с контекстом, чтобы «молчаливые» сбои (как
      // непроэскейпленные <код> в тексте) было видно в dashboard.
      const chatLabel =
        op.op === "answerCallback" ? op.callbackQueryId : String(op.chatId);
      console.error(
        `Telegram op ${op.op} failed (${chatLabel}):`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return new Response("OK", { status: 200 });
});
