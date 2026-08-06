import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertDate, assertRange } from "./validation";

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

/** Все записи воды пользователя (для экспорта «Скачать свои данные»). */
export const listMyWater = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("waterEntries")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/** Добавляет `amountMl` к дневному итогу (upsert, отрицательные значения
 *  уменьшают — итог не уходит ниже нуля). */
export const addWater = mutation({
  args: { date: v.string(), amountMl: v.number() },
  handler: async (ctx, { date, amountMl }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({ message: "Сессия истекла — войдите заново." });
    }

    assertDate(date);
    assertRange(amountMl, -MAX_DELTA_ML, MAX_DELTA_ML, "Объём воды (мл)");

    const existing = await ctx.db
      .query("waterEntries")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", date),
      )
      .first();

    if (existing) {
      const total = Math.max(0, existing.amountMl + amountMl);
      await ctx.db.patch(existing._id, { amountMl: total });
      return existing._id;
    }
    return await ctx.db.insert("waterEntries", {
      userId,
      date,
      amountMl: Math.max(0, amountMl),
      createdAt: Date.now(),
    });
  },
});
