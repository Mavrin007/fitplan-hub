/**
 * Единая таксономия ошибок бэкенда.
 *
 * Все серверные мутации/actions кидают ConvexError с полем `data.code` из
 * этого справочника (+ человекочитаемое `message`). Клиент (lib/errors.ts)
 * превращает code в user-friendly текст, а произвольные строки ошибок
 * остаются только как запасной вариант для legacy-кода.
 *
 * Соглашения:
 *  - никогда не кладите в message PII, полные AI-промпты, токены;
 *  - `details` — только безопасные метаданные (не сырые пользовательские
 *    данные);
 *  - коды не меняются — они часть публичного контракта клиента.
 */
import { ConvexError } from "convex/values";

export const ErrorCode = {
  /** Сессия отсутствует или истекла. */
  AUTH_REQUIRED: "AUTH_REQUIRED",
  /** Превышен rate limit (обычно с retryAfterSec). */
  RATE_LIMITED: "RATE_LIMITED",
  /** Входные данные не прошли серверную валидацию. */
  VALIDATION_FAILED: "VALIDATION_FAILED",
  /** Продукт не найден ни в одном проверенном источнике. */
  FOOD_NOT_FOUND: "FOOD_NOT_FOUND",
  /** ИИ-провайдер недоступен/ошибся. */
  AI_UNAVAILABLE: "AI_UNAVAILABLE",
  /** Ответ ИИ не прошёл строгую валидацию команды. */
  AI_INVALID_OUTPUT: "AI_INVALID_OUTPUT",
  /** Telegram-аккаунт не привязан. */
  TELEGRAM_NOT_LINKED: "TELEGRAM_NOT_LINKED",
  /** Внешний API (OFF и т.п.) недоступен. */
  EXTERNAL_API_ERROR: "EXTERNAL_API_ERROR",
  /** Нет прав на ресурс (чужой объект, не-админ). */
  PERMISSION_DENIED: "PERMISSION_DENIED",
  /** Запись не найдена. */
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  /** Повторный запрос с тем же idempotency-ключом уже обработан. */
  DUPLICATE_REQUEST: "DUPLICATE_REQUEST",
  /** Дневная квота ассистента исчерпана. */
  ASSISTANT_LIMIT_REACHED: "ASSISTANT_LIMIT_REACHED",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Дополнительные безопасные поля ошибки. */
export interface AppErrorDetails {
  /** Через сколько секунд можно повторить (rate limit). */
  retryAfterSec?: number;
  /** Дополнительные безопасные метаданные (простые значения, без PII). */
  extra?: Record<string, string | number | boolean>;
}

/** Кидает ConvexError с кодом таксономии. */
export function appError(
  code: ErrorCode,
  message: string,
  details: AppErrorDetails = {},
): never {
  const data: Record<string, string | number | boolean> = { code, message };
  if (details.retryAfterSec !== undefined) {
    data.retryAfterSec = details.retryAfterSec;
  }
  if (details.extra) {
    for (const [key, value] of Object.entries(details.extra)) {
      data[key] = value;
    }
  }
  throw new ConvexError(data);
}

/**
 * Достаёт code из произвольной ошибки (ConvexError / Error). Клиентский
 * lib/errors.ts использует этот же формат.
 */
export function errorCodeOf(err: unknown): ErrorCode | null {
  const data = (err as { data?: { code?: string } } | undefined)?.data;
  if (data && typeof data.code === "string") {
    const code = data.code;
    if ((Object.values(ErrorCode) as string[]).includes(code)) {
      return code as ErrorCode;
    }
  }
  return null;
}
