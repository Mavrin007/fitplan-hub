import { internalMutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { todayKey } from "../lib/dates";

/**
 * Лимиты ИИ-ассистента, настраиваемые через переменные окружения бэкенда
 * (Convex Dashboard → Environment Variables). Захардкоженные значения — это
 * дефолты; на проде их можно переопределить, не трогая код:
 *
 *   ASSISTANT_DAILY_MESSAGE_LIMIT — сколько сообщений в день на пользователя
 *   ASSISTANT_DAILY_TOKEN_LIMIT   — сколько токенов (приблизительно) в день
 *                                   на пользователя; защита от «дорогого» чата
 *   ASSISTANT_MIN_INTERVAL_MS     — минимальный интервал между сообщениями
 */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Сколько сообщений в день на пользователя. */
export function dailyMessageLimit(): number {
  return envInt("ASSISTANT_DAILY_MESSAGE_LIMIT", 30);
}

/** Сколько токенов (приблизительно) в день на пользователя.
 *  30 сообщений × ~5k токенов (system + история + ответ) ≈ 150k. */
export function dailyTokenLimit(): number {
  return envInt("ASSISTANT_DAILY_TOKEN_LIMIT", 150_000);
}

/** Минимальный интервал между сообщениями (анти-спам), миллисекунды. */
export function minMessageIntervalMs(): number {
  return envInt("ASSISTANT_MIN_INTERVAL_MS", 2000);
}

/** Код ошибки для UI: дневная квота сообщений исчерпана. */
export const LIMIT_REACHED = "assistant_limit_reached";
/** Код ошибки для UI: дневная квота токенов исчерпана. */
export const TOKEN_LIMIT_REACHED = "assistant_token_limit_reached";
/** Код ошибки для UI: сообщения отправляются слишком часто. */
export const RATE_LIMITED = "assistant_rate_limited";

/** Понятная ошибка с кодом, по которому клиент отличает квоту от спама. */
function limitError(
  code: typeof LIMIT_REACHED | typeof TOKEN_LIMIT_REACHED | typeof RATE_LIMITED,
  message: string,
  data: { remaining: number; retryAfterSec?: number },
): ConvexError<{
  code: string;
  message: string;
  remaining: number;
  retryAfterSec?: number;
}> {
  return new ConvexError({ code, message, ...data });
}

/**
 * Серверная проверка и списание лимита ИИ-ассистента.
 *
 * Одна строка на (userId, day): count — сколько сообщений уже отправлено,
 * lastMessageAt — когда было последнее, totalTokens — сколько токенов
 * (приблизительно) уже потрачено за день. Проверяются три ограничения:
 * 1) интервал между сообщениями (MIN_MESSAGE_INTERVAL_MS) — анти-спам;
 * 2) дневная квота сообщений (DAILY_MESSAGE_LIMIT);
 * 3) дневная квота токенов (DAILY_TOKEN_LIMIT) — «дорогой» чат с длинной
 *    историей и большими ответами сжигает бюджет быстрее, чем число сообщений.
 *
 * Вызывается из assistant.chat (action) через ctx.runMutation ПЕРЕД вызовом
 * ИИ-провайдера: исчерпанная квота не тратит кредиты провайдера. Ошибки
 * бросаются ConvexError с кодом — action оборачивает их в понятный ответ UI.
 */
export const checkAndConsume = internalMutation({
  args: {
    userId: v.id("users"),
    /** Приблизительная стоимость запроса в токенах (см. estimateTokens). */
    estimatedTokens: v.number(),
  },
  handler: async (ctx, { userId, estimatedTokens }) => {
    const now = Date.now();
    const day = todayKey();
    const msgLimit = dailyMessageLimit();
    const tokLimit = dailyTokenLimit();
    const intervalMs = minMessageIntervalMs();

    const row = await ctx.db
      .query("assistantLimits")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", userId).eq("day", day),
      )
      .unique();

    if (row === null) {
      // Токен-лимит действует и на первое сообщение: один гигантский запрос
      // (огромная вставка) не должен сжечь весь дневной бюджет целиком.
      if (estimatedTokens > tokLimit) {
        throw limitError(
          TOKEN_LIMIT_REACHED,
          `Запрос слишком большой: превышен дневной лимит токенов ассистента (~${tokLimit.toLocaleString(
            "ru-RU",
          )}). Попробуйте короче.`,
          { remaining: 0 },
        );
      }
      await ctx.db.insert("assistantLimits", {
        userId,
        day,
        count: 1,
        totalTokens: estimatedTokens,
        lastMessageAt: now,
      });
      return {
        used: 1,
        remaining: msgLimit - 1,
        tokensUsed: estimatedTokens,
        tokensRemaining: Math.max(0, tokLimit - estimatedTokens),
        retryAfterSec: 0,
      };
    }

    // Токен-квота проверяется ДО сообщения-квоты: длинный разговор может
    // исчерпать бюджет токенов раньше, чем число сообщений.
    const totalTokens = (row.totalTokens ?? 0) + estimatedTokens;
    if (totalTokens > tokLimit) {
      throw limitError(
        TOKEN_LIMIT_REACHED,
        `Исчерпан дневной лимит токенов ассистента (~${tokLimit.toLocaleString(
          "ru-RU",
        )}). Завтра лимит обновится автоматически.`,
        { remaining: 0 },
      );
    }

    // Дневная квота сообщений исчерпана — терминальное состояние.
    if (row.count >= msgLimit) {
      throw limitError(
        LIMIT_REACHED,
        `Дневной лимит ассистента исчерпан (${msgLimit} сообщений). Завтра лимит обновится автоматически.`,
        { remaining: 0 },
      );
    }

    // Анти-спам: слишком часто шлём сообщения.
    const elapsed = now - row.lastMessageAt;
    if (elapsed < intervalMs) {
      throw limitError(
        RATE_LIMITED,
        `Слишком быстро — подождите ${Math.ceil(
          (intervalMs - elapsed) / 1000,
        )} с`,
        {
          remaining: Math.max(0, msgLimit - row.count),
          retryAfterSec: Math.ceil((intervalMs - elapsed) / 1000),
        },
      );
    }

    // Снапшот ДО patch: строка Convex иммутабельна, но фейковый ctx.db в
    // тестах мутирует её в месте — значение должно быть зафиксировано.
    const nextCount = row.count + 1;
    await ctx.db.patch(row._id, {
      count: nextCount,
      totalTokens,
      lastMessageAt: now,
    });
    return {
      used: nextCount,
      remaining: msgLimit - nextCount,
      tokensUsed: totalTokens,
      tokensRemaining: Math.max(0, tokLimit - totalTokens),
      retryAfterSec: 0,
    };
  },
});

/** Read-only состояние лимита для UI: сколько осталось сообщений и токенов. */
export const getMyLimit = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const row = await ctx.db
      .query("assistantLimits")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", userId).eq("day", todayKey()),
      )
      .unique();
    const msgLimit = dailyMessageLimit();
    const tokLimit = dailyTokenLimit();
    const used = row?.count ?? 0;
    const tokensUsed = row?.totalTokens ?? 0;
    return {
      used,
      limit: msgLimit,
      remaining: Math.max(0, msgLimit - used),
      tokensUsed,
      tokenLimit: tokLimit,
      tokensRemaining: Math.max(0, tokLimit - tokensUsed),
    };
  },
});
