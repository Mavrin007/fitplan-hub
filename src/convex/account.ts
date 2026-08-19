import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";

/** Понятная ошибка сессии вместо «Server Error» без текста. */
function authError(): ConvexError<{ message: string }> {
  return new ConvexError({ message: "Сессия истекла — войдите заново." });
}

/**
 * Полный экспорт данных пользователя (GDPR-переносимость): все таблицы одним
 * ответом. Клиент скачивает его как JSON («Экспортировать все данные» на
 * Профиле). Для неавторизованных — ошибка сессии.
 */
export const exportMyData = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();

    const [profile, weights, meals, foods, water, workouts, plan, limits] =
      await Promise.all([
        ctx.db
          .query("profiles")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("weightEntries")
          .withIndex("by_user_date", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("mealLog")
          .withIndex("by_user_date", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("foods")
          .withIndex("by_user", (q) => q.eq("userId", userId))
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
          .query("workoutPlans")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("assistantLimits")
          .withIndex("by_user_day", (q) => q.eq("userId", userId))
          .collect(),
      ]);

    return {
      app: "kilo",
      exportedAt: new Date().toISOString(),
      profile: profile[0] ?? null,
      weightEntries: weights,
      mealLog: meals,
      foods,
      waterEntries: water,
      workoutLogs: workouts,
      workoutPlan: plan[0] ?? null,
      assistantLimits: limits,
    };
  },
});

/**
 * Полное удаление аккаунта (GDPR-право на забвение): все прикладные данные,
 * план тренировок, лимиты ассистента, затем сессии, привязанные провайдеры
 * и сам документ users. Клиент после этого выходит из сессии.
 *
 * Токены обновления и коды верификации не хранят userId напрямую — они
 * невалидны без живой сессии и протухают сами, отдельная чистка не нужна.
 */
export const deleteMyAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw authError();

    // Динамический обход таблиц: TS не может коррелировать пару
    // (таблица → индекс) в цикле, поэтому идём через локальный структурный
    // каст (как в rateLimit.ts) — индексы перечислены явно ниже и проверены
    // schema.ts / authTables @convex-dev/auth.
    const db = ctx.db as unknown as {
      query(table: string): {
        withIndex(
          name: string,
          fn: (q: { eq(f: string, v: unknown): unknown }) => void,
        ): {
          collect(): Promise<Array<{ _id: string }>>;
        };
      };
      delete(id: unknown): void;
    };

    // Прикладные таблицы (у всех есть userId + индекс по нему): читаем по
    // индексу, а не фильтром-сканом, чтобы удаление аккаунта с большим
    // дневником оставалось быстрым (паттерн из guestStats.ts).
    const appTables = [
      ["mealLog", "by_user_date"],
      ["waterEntries", "by_user_date"],
      ["workoutLogs", "by_user_date"],
      ["weightEntries", "by_user_date"],
      ["foods", "by_user"],
      ["workoutPlans", "by_user"],
      ["assistantLimits", "by_user_day"],
      ["profiles", "by_user"],
    ] as const;
    for (const [table, index] of appTables) {
      const rows = await db
        .query(table)
        .withIndex(index, (q) => q.eq("userId", userId))
        .collect();
      for (const row of rows) {
        await db.delete(row._id);
      }
    }

    // Auth-таблицы (имена из authTables @convex-dev/auth): сессии и
    // привязанные аккаунты провайдеров — оба с индексом по userId.
    const authTables = [
      ["authSessions", "userId"],
      ["authAccounts", "userIdAndProvider"],
    ] as const;
    for (const [table, index] of authTables) {
      const rows = await db
        .query(table)
        .withIndex(index, (q) => q.eq("userId", userId))
        .collect();
      for (const row of rows) {
        await db.delete(row._id);
      }
    }

    await ctx.db.delete(userId);
  },
});
