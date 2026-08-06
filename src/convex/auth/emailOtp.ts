import { Email } from "@convex-dev/auth/providers/Email";
import type { EmailConfig } from "@convex-dev/auth/server";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { internal } from "../_generated/api";
import { vly } from "../../lib/vly-integrations";

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
      throw new Error(
        `Код уже отправлен. Повторите через ${rate.retryAfterSec} сек.`,
      );
    }

    // Локальная разработка без внешнего SMTP: не ходим в VLY-шлюз, а печатаем
    // код в лог бэкенда и сохраняем в таблицу devOtpCodes, чтобы форма входа
    // показала его прямо в UI.
    if (process.env.VLY_EMAIL_DEV_CAPTURE === "1") {
      console.log(`[dev-otp] код для ${email}: ${token}`);
      await ctx.runMutation(internal.devOtp.insert, {
        email,
        code: token,
        createdAt: Date.now(),
      });
      return;
    }

    // Прод: отправляем через VLY-шлюз (VLY_INTEGRATION_KEY, задаётся в панели
    // Convex/в окружении — никаких ключей в исходниках). Требуется верифицированный
    // домен отправителя в дашборде VLY (vly.email.listDomains / verifyDomain).
    if (!process.env.VLY_INTEGRATION_KEY) {
      throw new Error(
        "Email-отправка не настроена: задайте VLY_INTEGRATION_KEY в переменных окружения проекта.",
      );
    }

    const appName = process.env.VLY_APP_NAME || "КИЛО";
    const res = await vly.email.send({
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

    if (!res.success || res.data?.status === "failed") {
      throw new Error(
        res.error ??
          "Не удалось отправить письмо с кодом. Попробуйте ещё раз позже.",
      );
    }
  }) as unknown as EmailConfig["sendVerificationRequest"],
});
