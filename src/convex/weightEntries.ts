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

/** Вес записывается как минимум раз в неделю — дальний предел только защитный. */
const MIN_WEIGHT_KG = 20;
const MAX_WEIGHT_KG = 500;

/** Понятная ошибка сессии вместо «Server Error» без текста. */
function authError(): never {
  return appError(ErrorCode.AUTH_REQUIRED, "Сессия истекла — войдите заново.");
}

export const listMyWeights = query({
  args: {
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { from, to, limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const q =
      from && to
        ? ctx.db
            .query("weightEntries")
            .withIndex("by_user_date", (qq) =>
              qq.eq("userId", userId).gte("date", from).lte("date", to),
            )
        : ctx.db
            .query("weightEntries")
            .withIndex("by_user_date", (qq) => qq.eq("userId", userId));
    // Лимит опционален: чарты/тренды передают его (графику не нужны сотни
    // замеров), экспорт «Скачать свои данные» — без лимита (полная выгрузка).
    return limit !== undefined
      ? await q.order("desc").take(limit)
      : await q.order("desc").collect();
  },
});

export const addWeight = mutation({
  args: {
    date: v.string(),
    weightKg: v.number(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, { date, weightKg, idempotencyKey }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();

    // Вес на дату — уже upsert (одна запись на пользователя и день), но
    // идемпотентность закрывает ретрай «двойного сохранения» формы.
    const fresh = await tryConsumeIdempotencyKey(ctx, userId, idempotencyKey);
    if (!fresh) throw duplicateError();

    try {
      assertDate(date);
      assertRange(weightKg, MIN_WEIGHT_KG, MAX_WEIGHT_KG, "Вес (кг)");
      await consumeRateLimit(ctx, `${userId}:weight`, RATE_LIMITS.weight);

      const existing = await ctx.db
        .query("weightEntries")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", userId).eq("date", date),
        )
        .first();
      let resultId: string;
      if (existing) {
        await ctx.db.patch(existing._id, { weightKg });
        resultId = existing._id;
      } else {
        resultId = await ctx.db.insert("weightEntries", {
          userId,
          date,
          weightKg,
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

export const deleteWeight = mutation({
  args: { id: v.id("weightEntries") },
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
    // Чужая запись отвечает так же, как несуществующая (защита от перебора id).
    if (entry.userId !== userId) {
      throw appError(
        ErrorCode.RESOURCE_NOT_FOUND,
        "Запись не найдена или уже удалена.",
      );
    }
    await ctx.db.delete(id);
  },
});
