/**
 * Диагностика Telegram-интеграции (для GET /telegram-status).
 *
 * Возвращает только не-секретные данные: факт наличия env-переменных и
 * первые символы токена (для сверки с тем, что у пользователя в BotFather),
 * плюс результат getMe/getWebhookInfo от Bot API. Сам токен наружу никогда
 * не попадает.
 *
 * Чистый модуль (как остальные в src/lib/telegram): в тестах tgApi мокается,
 * в проде читается из process.env в httpAction.
 */

import { tgApi } from "./api";
import { telegramAuthUrl } from "./oauth";

/** Срез env-переменных Convex, нужных Telegram-интеграции. */
export interface TelegramEnv {
  botToken?: string;
  webhookSecret?: string;
  miniAppUrl?: string;
  /**
   * Origin для проверки Login Widget (oauth.telegram.org). Если не задан —
   * проверка не выполняется (checked: false).
   */
  loginWidgetOrigin?: string;
}

export interface TelegramStatus {
  /** Бот настроен и токен принимается Bot API (getMe прошёл). */
  ok: boolean;
  token: {
    configured: boolean;
    /** Первые 5 символов токена — сверка без раскрытия секрета. */
    prefix: string | null;
    length: number | null;
  };
  webhookSecretConfigured: boolean;
  miniAppUrlConfigured: boolean;
  getMe: {
    ok: boolean;
    id?: number;
    username?: string;
    error?: string;
  };
  webhook: {
    url?: string;
    pending?: number;
    lastError?: string;
    error?: string;
  };
  /** Принимает ли Telegram origin для Login Widget (кнопка «Войти через Telegram»). */
  loginWidget: TelegramLoginWidgetCheck;
}

export interface TelegramLoginWidgetCheck {
  checked: boolean;
  origin: string | null;
  ok: boolean;
  error?: string;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : "неизвестная ошибка";
}

/**
 * Проверка Login Widget для данного origin: открывает oauth.telegram.org/auth
 * и смотрит, что Telegram отвечает. «Bot domain invalid» — домен не добавлен
 * в @BotFather → Bot Settings → Login Widget (Allowed URLs). Не кидает.
 */
export async function checkLoginWidget(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TelegramLoginWidgetCheck> {
  try {
    const res = await fetchImpl(telegramAuthUrl(origin, origin));
    const text = await res.text();
    if (/bot domain invalid/i.test(text)) {
      return {
        checked: true,
        origin,
        ok: false,
        error:
          "Bot domain invalid — добавьте этот домен в @BotFather → Bot Settings → Login Widget (Allowed URLs)",
      };
    }
    if (res.ok && /Telegram Authorization|Log in/i.test(text)) {
      return { checked: true, origin, ok: true };
    }
    return {
      checked: true,
      origin,
      ok: false,
      error: `Неожиданный ответ oauth.telegram.org (HTTP ${res.status})`,
    };
  } catch (e) {
    return {
      checked: true,
      origin,
      ok: false,
      error: `Сетевая ошибка: ${message(e)}`,
    };
  }
}

/** Собирает статус. Не кидает: любой сбой Bot API попадает в поле error. */
export async function telegramStatus(
  env: TelegramEnv,
  fetchImpl?: typeof fetch,
): Promise<TelegramStatus> {
  const token = env.botToken;
  const tokenInfo = {
    configured: Boolean(token),
    prefix: token ? token.slice(0, 5) : null,
    length: token ? token.length : null,
  };

  const loginWidget = env.loginWidgetOrigin
    ? await checkLoginWidget(env.loginWidgetOrigin, fetchImpl)
    : { checked: false, origin: null, ok: false };

  let getMe: TelegramStatus["getMe"] = {
    ok: false,
    error: "TELEGRAM_BOT_TOKEN не задан на сервере",
  };
  let webhook: TelegramStatus["webhook"] = {};
  if (token) {
    try {
      const me = await tgApi<{ id: number; username: string }>(token, "getMe", {});
      getMe = { ok: true, id: me.id, username: me.username };
    } catch (e) {
      getMe = { ok: false, error: message(e) };
    }
    // getWebhookInfo имеет смысл только при валидном токене.
    if (getMe.ok) {
      try {
        const info = await tgApi<{
          url?: string;
          pending_update_count?: number;
          last_error_message?: string;
        }>(token, "getWebhookInfo", {});
        webhook = {
          url: info.url,
          pending: info.pending_update_count,
          lastError: info.last_error_message,
        };
      } catch (e) {
        webhook = { error: message(e) };
      }
    }
  }

  return {
    ok: Boolean(token) && getMe.ok,
    token: tokenInfo,
    webhookSecretConfigured: Boolean(env.webhookSecret),
    miniAppUrlConfigured: Boolean(env.miniAppUrl),
    getMe,
    webhook,
    loginWidget,
  };
}
