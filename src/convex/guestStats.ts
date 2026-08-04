import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

/**
 * Сколько записей данных есть у текущего пользователя во всех таблицах
 * (приёмы пищи, вода, тренировки, замеры веса, свои продукты, профиль).
 *
 * Используется оверлеем «У вас N записей — привяжите почту» при выходе из
 * гостевой сессии: если данных больше нет смысла хранить под анонимным
 * аккаунтом, пользователю предлагают привязать email, чтобы их не потерять.
 *
 * Для неавторизованных возвращает 0. Считаем через collect().length, а не
 * count(): в этой версии Convex count() доступен только на уровне таблицы
 * (без фильтра по userId) — он вернул бы число записей всех пользователей.
 */
export const countMyData = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return 0;

    const [meals, water, workouts, weights, foods, profile] = await Promise.all([
      ctx.db
        .query("mealLog")
        .withIndex("by_user_date", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("waterEntries")
        .withIndex("by_user_date", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("workoutLogs")
        .withIndex("by_user_date", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("weightEntries")
        .withIndex("by_user_date", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("foods")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);

    return (
      meals.length +
      water.length +
      workouts.length +
      weights.length +
      foods.length +
      profile.length
    );
  },
});
