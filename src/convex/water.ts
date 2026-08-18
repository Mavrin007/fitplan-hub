import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { RATE_LIMITS, consumeRateLimit } from "./rateLimit";
import { assertDate, assertRange } from "./validation";
import {
  duplicateError,
  markIdempotencyDone,
  releaseIdempotencyKey,
  tryConsumeIdempotencyKey,
} from "./idempotency";
import { ErrorCode, appError } from "./errors";

/** Разовая добавка воды (мл). Отрицательная — уменьшение, не больше стакана. */
const MAX_DELTA_ML = 5000;

/** Дневной итог воды (одна запись на пользователя и дату). */
export const getByDate = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return (
      (await ctx.db
        .query("waterEntries")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", userId).eq("date", date),
        )
        .first()) ?? null
    );
  },
});

/** Все записи воды пользователя (для экспорта «Скачать свои данные»).
 *  Лимит опционален: графики передают его, экспорт — без лимита. */
export const listMyWater = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const q = ctx.db
      .query("waterEntries")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("desc");
    return limit !== undefined ? await q.take(limit) : await q.collect();
  },
});

/** Добавляет `amountMl` к дневному итогу (upsert, отрицательные значения
 *  уменьшают — итог не уходит ниже нуля). */
export const addWater = mutation({
  args: {
    date: v.string(),
    amountMl: v.number(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, { date, amountMl, idempotencyKey }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw appError(ErrorCode.AUTH_REQUIRED, "Сессия истекла — войдите заново.");
    }

    const fresh = await tryConsumeIdempotencyKey(ctx, userId, idempotencyKey);
    if (!fresh) throw duplicateError();

    try {
      assertDate(date);
      assertRange(amountMl, -MAX_DELTA_ML, MAX_DELTA_ML, "Объём воды (мл)");
      await consumeRateLimit(ctx, `${userId}:water`, RATE_LIMITS.water);

      const existing = await ctx.db
        .query("waterEntries")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", userId).eq("date", date),
        )
        .first();

      let resultId: string | null;
      if (existing) {
        const total = Math.max(0, existing.amountMl + amountMl);
        // 0 мл = записи нет: удаляем строку, чтобы счётчик и экспорт не
        // показывали «выпито 0 мл» как отдельную запись дня.
        if (total === 0) {
          await ctx.db.delete(existing._id);
          resultId = existing._id;
        } else {
          await ctx.db.patch(existing._id, { amountMl: total });
          resultId = existing._id;
        }
      } else if (amountMl <= 0) {
        // Отрицательная добавка при отсутствии записи не создаёт строку с 0.
        resultId = null;
      } else {
        resultId = await ctx.db.insert("waterEntries", {
          userId,
          date,
          amountMl,
          createdAt: Date.now(),
        });
      }
      await markIdempotencyDone(ctx, userId, idempotencyKey);
      return resultId;
    } catch (err) {
      await releaseIdempotencyKey(ctx, userId, idempotencyKey);
      throw err;
    }
  },
});
