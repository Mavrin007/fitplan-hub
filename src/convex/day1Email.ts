/**
 * Day-1 email: одно письмо после первой завершённой тренировки пользователя с
 * привязанной почтой. Планируется из logWorkout (scheduler.runAfter) — не
 * блокирует сохранение тренировки и не роняет его при сбое отправки.
 *
 * Гейты — как у недельной сводки (digest.ts): dev / DIGEST_DISABLED / без
 * RESEND_API_KEY молча пропускают прогон. После успешной отправки пишется
 * событие email_sent (type: "day1") — для воронки email_sent → app_opened
 * (выводится из today_opened) → day_completed.
 *
 * TODO(guest): если гость сначала сделал тренировку, а потом привязал почту,
 * письмо не уходит (в момент тренировки email ещё не был). При появлении
 * привязки аккаунта можно проверить «первая тренировка + нет email_sent» и
 * допослать — пока оставляем как есть, недельная сводка покрывает возврат.
 */
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { sendResendEmail } from "../lib/resend";
import { buildDay1Email } from "../lib/day1Email";

export const sendDay1 = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    // Те же гейты, что у недельной рассылки (dev-бэкенд не спамит).
    if (process.env.NODE_ENV === "development") return;
    if (process.env.DIGEST_DISABLED === "1") return;
    if (!process.env.RESEND_API_KEY) return;

    const user = await ctx.db.get(userId);
    if (user === null) return;
    const email =
      typeof user.email === "string" && user.email.length > 0 ? user.email : "";
    if (!email || user.isAnonymous) return;

    // Перепроверяем, что тренировка действительно есть (лог могли удалить до
    // запуска джобы). Берём самую раннюю — это и есть «первая».
    const firstLog = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("asc")
      .first();
    if (!firstLog) return;

    const name =
      typeof user.name === "string" && user.name.length > 0
        ? user.name
        : undefined;
    const { subject, text, html } = buildDay1Email({
      name,
      workoutName: firstLog.workoutName,
      exercises: firstLog.exercises.map((e) => ({
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        weightKg: e.weightKg,
      })),
      siteUrl: process.env.SITE_URL,
    });

    const res = await sendResendEmail({ to: email, subject, text, html });
    // Не пробрасываем ошибку: джоба не должна падать на сбой письма, а в
    // лог email не пишем (PII). Повторную отправку при сбое не делаем —
    // письмо не критично, недельная сводка вернёт пользователя.
    if (!res.success) return;

    // Событие для воронки возврата: email_sent (type day1) → app_opened →
    // day_completed. Пишем напрямую (server-side), allowlist здесь не нужен.
    await ctx.db.insert("events", {
      userId,
      name: "email_sent",
      ts: Date.now(),
      meta: { type: "day1" },
    });
  },
});
