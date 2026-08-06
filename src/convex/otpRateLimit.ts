import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Серверный rate-limit на отправку OTP-кодов.
 *
 * Хендлер проверяет, когда последний раз был отправлен код на этот email, и
 * если с тех пор не прошло OTP_RESEND_INTERVAL_MS (60 секунд) — отклоняет
 * отправку. Это защищает прод-путь от дёрганья VLY-шлюза вхолостую при
 * повторных кликах «Отправить код».
 *
 * Вызывается из sendVerificationRequest (auth/emailOtp.ts) ДО вызова
 * vly.email.send — отклонение не тратит кредиты шлюза.
 *
 * Лимит попыток ВВОДА кода (не отправки) реализован в самом @convex-dev/auth:
 * таблица authRateLimits + signIn.maxFailedAttempsPerHour в auth.ts.
 */
export const OTP_RESEND_INTERVAL_MS = 60 * 1000; // 60 секунд

/**
 * Read-only проверка «можно ли слать код на email прямо сейчас» — БЕЗ записи.
 *
 * Нужна клиенту для пред-проверки перед повторной отправкой: @convex-dev/auth
 * перевыпускает verification-code в createVerificationCode ДО того, как наш
 * sendVerificationRequest увидит rate-limit и бросит ошибку. Поэтому заблокиро-
 * ванный ресенд (клик в течение 60-секундного окна) молча убивал старый код и
 * генерировал новый, который пользователь никогда не увидит. Если клиент
 * сначала спросит canSend и получит { allowed: false } — он вообще не вызовет
 * signIn, и старый код останется валидным.
 */
export const canSend = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const now = Date.now();
    const row = await ctx.db
      .query("otpRateLimits")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (row === null) {
      return { allowed: true, retryAfterSec: 0 };
    }
    const elapsed = now - row.lastSentAt;
    if (elapsed < OTP_RESEND_INTERVAL_MS) {
      return {
        allowed: false,
        retryAfterSec: Math.ceil((OTP_RESEND_INTERVAL_MS - elapsed) / 1000),
      };
    }
    return { allowed: true, retryAfterSec: 0 };
  },
});

// Серверный чек при отправке остаётся бэкапом поверх клиентской
// пред-проверки: даже если клиент его обошёл (или вызывает signIn напрямую),
// шлюз не будет дёргаться чаще раза в 60с.
export const checkAndRecord = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const now = Date.now();
    const row = await ctx.db
      .query("otpRateLimits")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (row === null) {
      await ctx.db.insert("otpRateLimits", { email, lastSentAt: now });
      return { allowed: true, retryAfterSec: 0 };
    }
    const elapsed = now - row.lastSentAt;
    if (elapsed < OTP_RESEND_INTERVAL_MS) {
      // Ещё рано: возвращаем, сколько секунд осталось ждать.
      return {
        allowed: false,
        retryAfterSec: Math.ceil((OTP_RESEND_INTERVAL_MS - elapsed) / 1000),
      };
    }
    await ctx.db.patch(row._id, { lastSentAt: now });
    return { allowed: true, retryAfterSec: 0 };
  },
});
