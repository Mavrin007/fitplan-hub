/**
 * Провайдер входа через Telegram (ConvexCredentials).
 *
 * Клиент шлёт signIn("telegram", { ... }) с результатом авторизации Telegram:
 *   - из обычного браузера — данные Login Widget (поля id/first_name/.../hash);
 *   - из Telegram Mini App — сырую initData (window.Telegram.WebApp.initData).
 *
 * Подпись всегда проверяется здесь (сервер), по секрету TELEGRAM_BOT_TOKEN —
 * токен бота никогда не попадает на клиент. При успехе:
 *   - Telegram уже привязан к аккаунту КИЛО (telegramAccounts) → вход в него;
 *   - не привязан и create !== false → создаём новый аккаунт и привязываем
 *     Telegram (полноценный «вход через Telegram» для новых пользователей);
 *   - не привязан и create === false (автовход Mini App) → ошибка с понятным
 *     текстом, аккаунт не создаётся молча.
 *
 * v3 — HMAC verification with diagnostic error codes.
 * 
 * IMPORTANT: verifyTelegramAuth() lives in src/lib/telegram/verify.ts (bundled
 * by Convex at deploy time). Any changes to verify.ts require a Convex
 * redeployment to take effect on the server.
 */

import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import type { GenericActionCtxWithAuthConfig } from "@convex-dev/auth/server";
import { ConvexError, type GenericId } from "convex/values";
import type { GenericDataModel } from "convex/server";
import { internal } from "../_generated/api";
/** Deploy marker — visible in Convex function logs after redeployment. */
const DEPLOY_VERSION = "v5-inline-hmac-2026-08-21";

/** Приводит произвольное значение к строке (или null). */
function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Только поля, которые подписал Telegram (без служебных source/create):
 *  data_check_string строится ровно по полям виджета, лишний ключ ломает
 *  подпись. */
function widgetFields(credentials: unknown): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    ...(credentials as Record<string, unknown>),
  };
  delete fields.source;
  delete fields.create;
  return fields;
}

export const telegramLogin = ConvexCredentials({
  id: "telegram",
  authorize: async (
    credentials,
    ctx: GenericActionCtxWithAuthConfig<GenericDataModel>,
  ): Promise<{ userId: GenericId<"users"> } | null> => {
    console.warn(`[TG-AUTH] ${DEPLOY_VERSION} authorize called`);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new ConvexError({
        message:
          "Вход через Telegram не настроен на сервере. Попробуйте email или гостевой вход.",
      });
    }

    let source: "widget" | "webapp";
    if (credentials.source === "widget") source = "widget";
    else if (credentials.source === "webapp") source = "webapp";
    else {
      throw new ConvexError({
        message: "Некорректные данные входа через Telegram.",
      });
    }

    // Inline HMAC verification (v5) — the external verify.ts import was
    // not picked up by the Convex bundler despite multiple deploys.
    // This eliminates the import dependency and guarantees the code runs.
    let verified;
    try {
      verified = await inlineVerifyTelegramAuth({
        source,
        botToken,
        fields: source === "widget" ? widgetFields(credentials) : undefined,
        initData:
          source === "webapp" ? asString(credentials.initData) ?? "" : undefined,
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const message = `[${DEPLOY_VERSION}] ${raw}`;
      throw new ConvexError({ message });
    }

    // Уже привязан — входим в существующий аккаунт (все данные на месте).
    const existing = (await ctx.runQuery(internal.telegram.findByTelegram, {
      telegramUserId: verified.id,
    })) as { userId: string } | null;
    if (existing) {
      // «Последняя активность» сессии — обновляем (без отдельного запроса).
      await ctx.runMutation(internal.telegram.touchLastActive, {
        telegramUserId: verified.id,
      });
      return { userId: existing.userId as GenericId<"users"> };
    }

    // Автовход Mini App без явного действия: аккаунт не создаём, иначе любое
    // открытие приложения молча заводило бы нового пользователя.
    const create = credentials.create !== false;
    if (!create) {
      throw new ConvexError({
        message:
          "Этот Telegram ещё не привязан к аккаунту КИЛО. Войдите по email или как гость и привяжите Telegram в профиле.",
      });
    }

    const userId = (await ctx.runMutation(
      internal.telegram.createAccountFromTelegram,
      {
        telegramUserId: verified.id,
        firstName: verified.firstName,
        username: verified.username,
      },
    )) as string;
    return { userId: userId as GenericId<"users"> };
  },
});

// ── Inline HMAC verification (v5) ──────────────────────────────────────
// The external src/lib/telegram/verify.ts was NOT picked up by the Convex
// bundler despite multiple deploys. This inline version implements the
// exact same algorithm (verified against official Telegram Bot API docs
// and aiogram reference implementation).
//
// Telegram Mini App initData HMAC:
//   1. Parse initData as URL query string, remove "hash"
//   2. Sort remaining params by key, join as key=value with "\n"
//   3. secret_key = HMAC-SHA256(key="WebAppData", message=bot_token)
//   4. calculated = HMAC-SHA256(key=secret_key, message=data_check_string)
//   5. Compare calculated with hash (case-insensitive)
//
// Telegram Login Widget HMAC:
//   1. Sort fields by key, remove "hash", join as key=value with "\n"
//   2. secret_key = SHA256(bot_token)
//   3. calculated = HMAC-SHA256(key=secret_key, message=data_check_string)
//   4. Compare calculated with hash (case-insensitive)
//
// Source: https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
// Reference: aiogram.utils.web_app.check_webapp_signature

const encoder = new TextEncoder();

async function sha256(data: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return new Uint8Array(digest);
}

async function hmacSha256(
  key: Uint8Array,
  data: string,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer.slice(
      key.byteOffset,
      key.byteOffset + key.byteLength,
    ) as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(data),
  );
  return new Uint8Array(signature);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function widgetDataCheckString(fields: Record<string, unknown>): string {
  return Object.keys(fields)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${String(fields[key])}`)
    .join("\n");
}

/** data_check_string for Mini App: sorted key=value joined by "\n". */
function webappDataCheckString(initData: string): string {
  const params = new URLSearchParams(initData);
  params.delete("hash");
  return Array.from(params.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

async function inlineVerifyTelegramAuth(options: {
  source: "widget" | "webapp";
  botToken: string;
  fields?: Record<string, unknown>;
  initData?: string;
  now?: number;
}): Promise<{
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  authDate: number;
}> {
  const { source, botToken, now = Date.now() } = options;
  if (!botToken) {
    throw new Error("TG_AUTH_NO_BOT_TOKEN: bot token not configured.");
  }

  let hash: string | null = null;
  let dataCheckString = "";
  let userFields: Record<string, unknown> = {};
  let authDate: number | null = null;

  if (source === "widget") {
    const fields = options.fields ?? {};
    userFields = fields;
    hash = typeof fields.hash === "string" ? fields.hash : null;
    dataCheckString = widgetDataCheckString(fields);
    authDate =
      typeof fields.auth_date === "string" || typeof fields.auth_date === "number"
        ? Number(fields.auth_date)
        : null;
  } else {
    const initData = options.initData ?? "";
    if (!initData) {
      throw new Error("TG_AUTH_NO_INIT_DATA: initData is empty.");
    }
    const params = new URLSearchParams(initData);
    hash = params.get("hash");
    dataCheckString = webappDataCheckString(initData);
    const authDateRaw = params.get("auth_date");
    authDate = authDateRaw ? Number(authDateRaw) : null;
    const rawUser = params.get("user");
    if (rawUser) {
      try {
        userFields = JSON.parse(rawUser) as Record<string, unknown>;
      } catch {
        userFields = {};
      }
    }
  }

  if (!hash || !authDate) {
    throw new Error(
      `TG_AUTH_NO_SIGNATURE: hash=${!!hash}, authDate=${!!authDate}.`,
    );
  }

  const maxAgeS = source === "widget" ? 5 * 60 : 24 * 60 * 60;
  const ageS = Math.floor(now / 1000) - authDate;
  if (ageS < -300 || ageS > maxAgeS) {
    throw new Error(
      `TG_AUTH_EXPIRED: age=${ageS}s, max=${maxAgeS}s, source=${source}.`,
    );
  }

  // secret_key: widget uses SHA256(token), Mini App uses HMAC("WebAppData", token)
  const secretKey =
    source === "widget"
      ? await sha256(botToken)
      : await hmacSha256(encoder.encode("WebAppData"), botToken);
  const expected = toHex(await hmacSha256(secretKey, dataCheckString));

  if (expected.toLowerCase() !== hash.toLowerCase()) {
    const keys = dataCheckString
      .split("\n")
      .map((l) => l.split("=")[0]);
    throw new Error(
      `TG_AUTH_INVALID_SIGNATURE: v5-inline keys=[${keys.join(",")}] dcsLen=${dataCheckString.length} tokenLen=${botToken.length} source=${source}.`,
    );
  }

  const id = Number(userFields.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`TG_AUTH_INVALID_USER: id=${userFields.id}.`);
  }

  return {
    id,
    firstName: typeof userFields.first_name === "string" ? userFields.first_name : undefined,
    lastName: typeof userFields.last_name === "string" ? userFields.last_name : undefined,
    username: typeof userFields.username === "string" ? userFields.username : undefined,
    photoUrl: typeof userFields.photo_url === "string" ? userFields.photo_url : undefined,
    authDate,
  };
}
