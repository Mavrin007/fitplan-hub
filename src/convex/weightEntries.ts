import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertDate, assertRange } from "./validation";

/** Вес записывается как минимум раз в неделю — дальний предел только защитный. */
const MIN_WEIGHT_KG = 20;
const MAX_WEIGHT_KG = 500;

/** Понятная ошибка сессии вместо «Server Error» без текста. */
function authError(): ConvexError<{ message: string }> {
  return new ConvexError({ message: "Сессия истекла — войдите заново." });
}

export const listMyWeights = query({
  args: {
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (ctx, { from, to }) => {
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
    return await q.order("desc").collect();
  },
});

export const addWeight = mutation({
  args: { date: v.string(), weightKg: v.number() },
  handler: async (ctx, { date, weightKg }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();

    assertDate(date);
    assertRange(weightKg, MIN_WEIGHT_KG, MAX_WEIGHT_KG, "Вес (кг)");

    const existing = await ctx.db
      .query("weightEntries")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", date),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { weightKg });
      return existing._id;
    }
    return await ctx.db.insert("weightEntries", {
      userId,
      date,
      weightKg,
      createdAt: Date.now(),
    });
  },
});

export const deleteWeight = mutation({
  args: { id: v.id("weightEntries") },
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
