import { Email } from "@convex-dev/auth/providers/Email";
import type { EmailConfig } from "@convex-dev/auth/server";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { internal } from "../_generated/api";

// Второй аргумент ctx библиотека передаёт реально (см. server/implementation/signIn.ts),
// хотя в типах Auth.js его нет. Описываем минимальную форму для своих нужд.
interface SendVerificationCtx {
  runMutation: (
    fn: unknown,
    args: unknown,
  ) => Promise<unknown>;
}

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  // This function can be asynchronous
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  // Библиотека передаёт ctx вторым аргументом, но тип колбэка его не объявляет,
  // поэтому кастуем функцию к ожидаемому типу (то же самое делает сам @convex-dev/auth
  // в signIn.ts: там стоит @ts-expect-error для этого параметра).
  sendVerificationRequest: (async (
    { identifier: email, token }: { identifier: string; token: string },
    ctx: SendVerificationCtx,
  ) => {
    // Локальная разработка без внешнего SMTP: не ходим в email.vly.ai
    // (он сейчас отдаёт 401), а печатаем код в лог бэкенда и сохраняем
    // в таблицу devOtpCodes, чтобы форма входа показала его прямо в UI.
    if (process.env.VLY_EMAIL_DEV_CAPTURE === "1") {
      console.log(`[dev-otp] код для ${email}: ${token}`);
      await ctx.runMutation(internal.devOtp.insert, {
        email,
        code: token,
        createdAt: Date.now(),
      });
      return;
    }
    try {
      await axios.post(
        "https://email.vly.ai/send_otp",
        {
          to: email,
          otp: token,
          appName: process.env.VLY_APP_NAME || "a vly.ai application",
        },
        {
          headers: {
            "x-api-key": "vlytothemoon2025",
          },
        },
      );
    } catch (error) {
      throw new Error(JSON.stringify(error));
    }
  }) as unknown as EmailConfig["sendVerificationRequest"],
});
