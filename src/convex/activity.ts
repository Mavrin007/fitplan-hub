import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { v } from "convex/values";

/** Days with any logged activity (meals, water, workouts or weight check-ins)
 *  inside an inclusive date range, oldest first, with the number of log entries
 *  per day. Powers the "streak + activity calendar" block on the overview page. */
export const getActivityDays = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    // Индекс "by_user_date" = (userId, date): range-запрос по второму полю
    // работает без полного сканирования таблицы (в отличие от .filter).
    const meals = await ctx.db
      .query("mealLog")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", from).lte("date", to),
      )
      .collect();

    const water = await ctx.db
      .query("waterEntries")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", from).lte("date", to),
      )
      .collect();

    const workouts = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", from).lte("date", to),
      )
      .collect();

    const weights = await ctx.db
      .query("weightEntries")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", from).lte("date", to),
      )
      .collect();

    const counts = new Map<string, number>();
    for (const doc of [...meals, ...water, ...workouts, ...weights]) {
      counts.set(doc.date, (counts.get(doc.date) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
});
