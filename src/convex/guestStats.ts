import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

/**
 * Два «сестринских» запроса для оверлея выхода из гостевой сессии:
 *
 * - hasMyData — дешёвая проверка «есть ли хоть одна запись»: take(1) по каждой
 *   таблице, не вычитывая все строки. Решает, выходить ли сразу (данных нет)
 *   или показывать диалог.
 * - countMyData — точный счёт записей, дороже (collect по каждой таблице),
 *   поэтому UI запрашивает его только когда hasMyData уже вернул true
 *   (диалог реально открыт и данные есть).
 *
 * Для неавторизованных обе возвращают «нет данных». Считаем через
 * collect().length, а не count(): в Convex 1.42 count() доступен только на
 * инициализаторе запроса и игнорирует индексные фильтры (считает строки всей
 * таблицы) — он вернул бы число записей всех пользователей.
 *
 * TODO(convex-upgrade): когда в Convex появится count() с фильтрами по
 * индексу (или системная функция на уровне документа), заменить оба запроса
 * одним точным count() по userId — hasMyData станет его частным случаем.
 */
/** Есть ли у пользователя хоть одна запись (в любой из шести таблиц). */
export const hasMyData = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return false;

    // take(1) вместо collect(): нужен только факт существования, а не полный
    // список строк. Шесть независимых запросов — параллелим.
    const rows = await Promise.all([
      ctx.db
        .query("mealLog")
        .withIndex("by_user_date", (q) => q.eq("userId", userId))
        .take(1),
      ctx.db
        .query("waterEntries")
        .withIndex("by_user_date", (q) => q.eq("userId", userId))
        .take(1),
      ctx.db
        .query("workoutLogs")
        .withIndex("by_user_date", (q) => q.eq("userId", userId))
        .take(1),
      ctx.db
        .query("weightEntries")
        .withIndex("by_user_date", (q) => q.eq("userId", userId))
        .take(1),
      ctx.db
        .query("foods")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(1),
      ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(1),
    ]);

    // take(1) вернёт [] или [документ] — наличие любой непустой строки = true.
    return rows.some((r) => r.length > 0);
  },
});

/**
 * Точное число записей пользователя во всех таблицах. Выполняется только при
 * открытом диалоге с данными (см. hasMyData); для неавторизованных — 0.
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
