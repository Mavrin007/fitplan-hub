import { Email } from "@convex-dev/auth/providers/Email";
import type { EmailConfig } from "@convex-dev/auth/server";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { sendResendEmail } from "../../lib/resend";
import { devCaptureEnabled } from "../devOtp";

// Все пользовательские ошибки бросаются как ConvexError({ message }): Convex
// гарантированно доносит data до клиента, тогда как обычный Error маскируется
// как «Server Error Called by client» и реальная причина теряется (клиентский
// разбор — src/lib/errors.ts). Текст ошибки показывается в форме входа.

// Второй аргумент ctx библиотека передаёт реально (см. server/implementation/signIn.ts),
// хотя в типах Auth.js его нет. Описываем минимальную форму для своих нужд.
interface SendVerificationCtx {
  runMutation: (
    fn: unknown,
    args: unknown,
  ) => Promise<unknown>;
}

/** Ответ мутации otpRateLimit.checkAndRecord. */
interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

/** Ответ Resend на отправку письма. */
interface SendMailResult {
  success: boolean;
  error?: string;
  id?: string;
}

/** Отправка письма с кодом через Resend (общий для dev-фолбэка и прода). */
async function sendMail(email: string, token: string): Promise<SendMailResult> {
  const appName = process.env.VLY_APP_NAME || "КИЛО";
  return sendResendEmail({
    to: email,
    subject: `Код входа в ${appName}`,
    text:
      `Здравствуйте! Ваш код подтверждения для входа в ${appName}: ${token}.\n\n` +
      `Код действует 15 минут. Если вы не запрашивали вход — просто проигнорируйте это письмо.`,
    html:
      `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">` +
      `<h2 style="margin:0 0 12px;font-size:20px;">Вход в ${appName}</h2>` +
      `<p style="margin:0 0 16px;color:#444;font-size:14px;line-height:1.5;">` +
      `Ваш код подтверждения:</p>` +
      `<p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:6px;color:#0b6;">${token}</p>` +
      `<p style="margin:0;color:#888;font-size:12px;line-height:1.5;">` +
      `Код действует 15 минут. Если вы не запрашивали вход, просто проигнорируйте это письмо.</p>` +
      `</div>`,
  });
}
/** 6-значный OTP из цифр (криптостойкий, crypto.getRandomValues). Вынесен из
 *  конфига Email() в именованную функцию, чтобы юнит-тестировать без
 *  auth-рантайма; длина параметризована (по умолчанию 6 — как требует провайдер). */
export function generateVerificationToken(length = 6): string {
  const random: RandomReader = {
    read(bytes: Uint8Array) {
      crypto.getRandomValues(bytes);
    },
  };
  return generateRandomString(random, "0123456789", length);
}

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  // This function can be asynchronous
  async generateVerificationToken() {
    // Внутри метода идентификатор разрешается к модульной функции выше.
    return generateVerificationToken();
  },
  // Библиотека передаёт ctx вторым аргументом, но тип колбэка его не объявляет,
  // поэтому кастуем функцию к ожидаемому типу (то же самое делает сам @convex-dev/auth
  // в signIn.ts: там стоит @ts-expect-error для этого параметра).
  sendVerificationRequest: (async (
    { identifier: email, token }: { identifier: string; token: string },
    ctx: SendVerificationCtx,
  ) => {
    // Серверный rate-limit: интервал повторной отправки 60с на email.
    // Проверяется ДО любых веток (dev-перехват и прод), чтобы не дёргать
    // ни devOtpCodes, ни VLY-шлюз вхолостую при повторных кликах.
    const rate = (await ctx.runMutation(
      internal.otpRateLimit.checkAndRecord,
      { email },
    )) as RateLimitResult;
    if (!rate.allowed) {
      throw new ConvexError({
        message: `Код уже отправлен. Повторите через ${rate.retryAfterSec} сек.`,
      });
    }

    // Dev/превью-режим (см. devOtp.devCaptureEnabled): внешней почты может
    // не быть, поэтому код сохраняется в devOtpCodes и форма входа показывает
    // его прямо в UI — вход по email работает даже без SMTP/интеграции.
    // Письмо при этом всё равно пробуем отправить (если ключ задан), но
    // неудача шлюза НЕ роняет вход — код виден в форме.
    if (devCaptureEnabled()) {
      console.log(`[dev-otp] код для ${email}: ${token}`);
      await ctx.runMutation(internal.devOtp.insert, {
        email,
        code: token,
        createdAt: Date.now(),
      });
      if (!process.env.RESEND_API_KEY) {
        return;
      }
      try {
        const res = await sendMail(email, token);
        if (res.success) return;
        console.warn(
          `[dev-otp] Resend не отправил письмо (${res.error ?? "unknown"}) — вход по коду из формы`,
        );
      } catch (err) {
        console.warn(
          "[dev-otp] ошибка отправки письма — вход по коду из формы",
          err,
        );
      }
      return;
    }

    // Прод: отправляем через Resend (RESEND_API_KEY задаётся в панели Convex —
    // никаких ключей в исходниках). Отправитель — RESEND_EMAIL_FROM; если не
    // задан, берётся тестовый onboarding@resend.dev (шлёт только на адрес
    // владельца аккаунта — для реальных пользователей верифицируйте домен
    // в дашборде Resend и задайте RESEND_EMAIL_FROM).
    if (!process.env.RESEND_API_KEY) {
      throw new ConvexError({
        message:
          "Отправка кода на email не настроена на сервере. Задайте RESEND_API_KEY в переменных окружения проекта (Convex Dashboard).",
      });
    }

    const res = await sendMail(email, token);
    if (!res.success) {
      throw new ConvexError({
        message:
          res.error ?? "Не удалось отправить письмо с кодом. Попробуйте ещё раз позже.",
      });
    }
  }) as unknown as EmailConfig["sendVerificationRequest"],
});
