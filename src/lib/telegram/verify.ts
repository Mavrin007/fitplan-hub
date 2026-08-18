/**
 * Проверка подписи входа через Telegram — чистые функции без зависимостей от
 * Convex/React (WebCrypto, доступна и в Node-рантайме Convex, и в браузере,
 * и в vitest).
 *
 * Поддерживаются два источника (одинаковая HMAC-схема, разный вывод ключа):
 *
 * 1. Login Widget (oauth.telegram.org) — «Войти через Telegram» в обычном
 *    браузере. После подтверждения виджет вызывает callback с полями
 *    id/first_name/last_name/username/photo_url/auth_date/hash.
 *    secret_key = SHA256(bot_token);
 *    data_check_string = «key=value» полей (кроме hash), отсортированных по
 *    имени ключа, соединённых «\n»; подпись = hex(HMAC_SHA256(secret_key, …)).
 *
 * 2. Mini App initData (window.Telegram.WebApp.initData) — вход из приложения
 *    внутри Telegram.
 *    secret_key = HMAC_SHA256(bot_token, "WebAppData");
 *    data_check_string = исходная query-строка без параметра hash (порядок
 *    параметров сохраняется); подпись — та же HMAC-SHA256.
 *
 * Секрет (bot_token) никогда не должен попадать на клиент: проверка всегда
 * выполняется на сервере (src/convex/auth/telegramLogin.ts).
 */

export interface TelegramAuthUser {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  /** unix-секунды — время выдачи подписи (для проверки свежести). */
  authDate: number;
}

export type TelegramAuthSource = "widget" | "webapp";

export interface VerifyTelegramAuthOptions {
  source: TelegramAuthSource;
  /** Токен бота (TELEGRAM_BOT_TOKEN). Никогда не отдавать клиенту. */
  botToken: string;
  /** Для source="widget": все поля от виджета, включая hash. */
  fields?: Record<string, unknown>;
  /** Для source="webapp": сырая initData (query-строка с user/hash и т.д.). */
  initData?: string;
  /** Тестируемость: текущее время в мс. По умолчанию Date.now(). */
  now?: number;
}

/** Сколько подпись считается свежей (сек). Виджет — 5 минут (типичная
 *  рекомендация Telegram), initData перевыпускается при каждом открытии
 *  Mini App — сутки. */
const WIDGET_MAX_AGE_S = 5 * 60;
const WEBAPP_MAX_AGE_S = 24 * 60 * 60;

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

/** «key=value» сортировка по имени ключа для виджета (как в доке Telegram). */
function widgetDataCheckString(fields: Record<string, unknown>): string {
  return Object.keys(fields)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${String(fields[key])}`)
    .join("\n");
}

/** initData без параметра hash (он всегда последний): сохраняем порядок. */
function webappDataCheckString(initData: string): string {
  return initData
    .replace(/(^|&)hash=[^&]*/, "")
    .replace(/^&/, "");
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asUnixSeconds(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Проверяет подпись входа через Telegram и возвращает данные пользователя.
 * Кидает Error с человекочитаемым сообщением (на русском) при неверной
 * подписи или устаревшем auth_date.
 */
export async function verifyTelegramAuth(
  options: VerifyTelegramAuthOptions,
): Promise<TelegramAuthUser> {
  const { source, botToken, now = Date.now() } = options;
  if (!botToken) {
    throw new Error("Вход через Telegram не настроен на сервере.");
  }

  let hash: string | null;
  let dataCheckString: string;
  let userFields: Record<string, unknown>;
  let authDate: number | null;

  if (source === "widget") {
    const fields = options.fields ?? {};
    userFields = fields;
    hash = asString(fields.hash);
    dataCheckString = widgetDataCheckString(fields);
    authDate = asUnixSeconds(fields.auth_date);
  } else {
    const initData = options.initData ?? "";
    const params = new URLSearchParams(initData);
    hash = params.get("hash");
    dataCheckString = webappDataCheckString(initData);
    authDate = asUnixSeconds(params.get("auth_date"));
    const rawUser = params.get("user");
    if (rawUser) {
      try {
        userFields = JSON.parse(rawUser) as Record<string, unknown>;
      } catch {
        userFields = {};
      }
    } else {
      userFields = {};
    }
  }

  if (!hash || !authDate) {
    throw new Error("Не удалось подтвердить вход через Telegram.");
  }

  // Свежесть: виджет — 5 минут, Mini App — сутки. Защита от повторного
  // использования перехваченной подписи (replay).
  const maxAgeS = source === "widget" ? WIDGET_MAX_AGE_S : WEBAPP_MAX_AGE_S;
  const ageS = Math.floor(now / 1000) - authDate;
  if (ageS < -300 || ageS > maxAgeS) {
    throw new Error("Вход через Telegram устарел. Попробуйте ещё раз.");
  }

  // Секрет подписи: у виджета это SHA256(токена), у Mini App — HMAC(токен,
  // "WebAppData"). Оба байтовые, без hex-кодирования.
  const secretKey =
    source === "widget"
      ? await sha256(botToken)
      : await hmacSha256(encoder.encode(botToken), "WebAppData");
  const expected = toHex(await hmacSha256(secretKey, dataCheckString));

  // Сравнение без учёта регистра: Telegram отдаёт hex в нижнем регистре, но
  // не полагаемся на это.
  if (expected.toLowerCase() !== hash.toLowerCase()) {
    throw new Error("Не удалось подтвердить вход через Telegram.");
  }

  const id = Number(userFields.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Не удалось подтвердить вход через Telegram.");
  }

  return {
    id,
    firstName: asString(userFields.first_name) ?? undefined,
    lastName: asString(userFields.last_name) ?? undefined,
    username: asString(userFields.username) ?? undefined,
    photoUrl: asString(userFields.photo_url) ?? undefined,
    authDate,
  };
}
