import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Dev-only перехват OTP-кодов для локальной разработки без внешнего SMTP.
 *
 * Заполняется из sendVerificationRequest в auth/emailOtp.ts. Работает только
 * когда включён VLY_EMAIL_DEV_CAPTURE=1 И сайт — localhost (защита от
 * случайной утечки кодов, если флаг уедет на облачный деплой). UI читает коды
 * через getByEmail — она защищена той же парой условий.
 */
function devCaptureEnabled(): boolean {
  const siteUrl = process.env.CONVEX_SITE_URL ?? "";
  return (
    process.env.VLY_EMAIL_DEV_CAPTURE === "1" &&
    (siteUrl.includes("127.0.0.1") || siteUrl.includes("localhost"))
  );
}

const OTP_MAX_AGE_MS = 60 * 15 * 1000; // 15 минут — совпадает с maxAge в emailOtp.ts

/** Внутренняя запись кода (вызывается из колбэка отправки письма). */
export const insert = internalMutation({
  args: { email: v.string(), code: v.string(), createdAt: v.number() },
  handler: async (ctx, { email, code, createdAt }) => {
    if (!devCaptureEnabled()) return;
    await ctx.db.insert("devOtpCodes", { email, code, createdAt });
    // Чистим старые коды этого адреса, чтобы таблица не росла и «последний код»
    // всегда был однозначным.
    const stale = await ctx.db
      .query("devOtpCodes")
      .withIndex("by_email_created", (q) => q.eq("email", email))
      .filter((q) => q.lt(q.field("createdAt"), createdAt - OTP_MAX_AGE_MS))
      .collect();
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
  },
});

/** Последний перехваченный код для адреса — только в dev-режиме. */
export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (!devCaptureEnabled()) return null;
    const rows = await ctx.db
      .query("devOtpCodes")
      .withIndex("by_email_created", (q) => q.eq("email", email))
      .order("desc")
      .take(1);
    return rows[0]?.code ?? null;
  },
});
