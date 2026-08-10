import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Перехват OTP-кодов для работы входа по email БЕЗ внешнего SMTP.
 *
 * Заполняется из sendVerificationRequest в auth/emailOtp.ts. Включается на
 * dev/превью-развёртках (localhost, 127.0.0.1, *.convex.site — превью Freebuff)
 * или явным флагом VLY_EMAIL_DEV_CAPTURE=1. На боевом деплое (свой домен,
 * флаг не задан) перехват отключён: коды не сохраняются и не отдаются
 * клиенту — работает только настоящая почта. VLY_EMAIL_DEV_CAPTURE=0 —
 * принудительное выключение. UI читает коды через getByEmail — она защищена
 * тем же условием.
 */
export function devCaptureEnabled(): boolean {
  if (process.env.VLY_EMAIL_DEV_CAPTURE === "0") return false;
  const siteUrl = process.env.CONVEX_SITE_URL ?? "";
  return (
    process.env.VLY_EMAIL_DEV_CAPTURE === "1" ||
    siteUrl.includes("127.0.0.1") ||
    siteUrl.includes("localhost") ||
    siteUrl.includes("convex.site")
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
