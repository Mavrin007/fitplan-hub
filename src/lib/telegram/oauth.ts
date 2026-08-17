/**
 * Клиентская часть входа через Telegram (popup-флоу oauth.telegram.org) —
 * чистые функции без React.
 *
 * Клик по кнопке открывает попап
 * https://oauth.telegram.org/auth?bot_id=…&origin=…&embed=1&return_to=…
 * (тот же механизм, что у официального Login Widget). После подтверждения
 * Telegram редиректит попап на return_to с хэшем
 * #tgAuthResult=<urlencoded JSON> — поля id/first_name/…/auth_date/hash.
 * Подпись (hash) проверяется на сервере (src/convex/auth/telegramLogin.ts);
 * токен бота на клиент не попадает.
 */

import { TELEGRAM_BOT_ID } from "./api";

/** Пользователь из OAuth-флоу oauth.telegram.org (поля виджета). */
export interface TelegramWidgetUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/** URL авторизации oauth.telegram.org (popup-флоу). */
export function telegramAuthUrl(origin: string, returnTo: string): string {
  const params = new URLSearchParams({
    bot_id: String(TELEGRAM_BOT_ID),
    origin,
    embed: "1",
    return_to: returnTo,
  });
  return `https://oauth.telegram.org/auth?${params.toString()}`;
}

/** Разбирает #tgAuthResult=<urlencoded JSON> из хэша (нет результата — null). */
export function parseTelegramAuthResult(
  hash: string,
): TelegramWidgetUser | null {
  if (!hash) return null;
  const params = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash,
  );
  const raw = params.get("tgAuthResult");
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as TelegramWidgetUser;
    if (
      typeof user?.id === "number" &&
      typeof user?.hash === "string" &&
      user.auth_date > 0
    ) {
      return user;
    }
  } catch {
    // Битый/подменённый результат — игнорируем; сервер всё равно проверит подпись.
  }
  return null;
}
