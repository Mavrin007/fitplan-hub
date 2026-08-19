/**
 * Telegram Mini App: инициализация WebView и доступ к данным Telegram.
 *
 * Приложение КИЛО работает и как обычный сайт, и как Telegram Mini App
 * (кнопка бота). Вне Telegram все функции безопасно возвращают null/false —
 * ничего не ломается, скрипт telegram-web-app.js просто не инициализируется.
 *
 * ВАЖНО: официальный telegram-web-app.js создаёт стаб-объект window.Telegram
 * и в обычном браузере (initData="", platform="unknown") — поэтому о
 * «настоящем» Mini App судим по подписанным данным, а не по наличию объекта
 * (см. isTelegramWebApp).
 */

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export interface TelegramWebAppInitData {
  user?: TelegramWebAppUser;
  query_id?: string;
  auth_date?: number;
  hash?: string;
  start_param?: string;
}

/** Минимальный срез официального API (telegram-web-app.js). */
export interface TelegramWebAppApi {
  initData: string;
  initDataUnsafe: TelegramWebAppInitData;
  ready(): void;
  expand(): void;
  disableVerticalSwipes(): void;
  enableVerticalSwipes(): void;
  /** Доступен с Bot API 6.1+. */
  isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: string): void;
  colorScheme: "light" | "dark";
  isExpanded: boolean;
  /** Платформа клиента (android/ios/macos/windows/tdesktop/web…); стаб вне
   *  Telegram отдаёт "unknown". */
  platform: string;
  version: string;
  close(): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebAppApi };
    /** Есть только в настоящем WebView Telegram (в обычном браузере — нет). */
    TelegramWebviewProxy?: unknown;
  }
}

/** Доступ к API WebApp; вне Telegram — null. */
export function telegramWebApp(): TelegramWebAppApi | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/** Запущено ли приложение внутри Telegram Mini App.
 *
 *  Стаб telegram-web-app.js в обычном браузере даёт initData="" и
 *  platform="unknown" — по одному наличию window.Telegram судить нельзя,
 *  иначе кнопка входа через Telegram скрыта на вебе. Настоящий Mini App
 *  всегда получает подписанный initData от Telegram (или держит
 *  TelegramWebviewProxy / реальную платформу). */
export function isTelegramWebApp(): boolean {
  const app = telegramWebApp();
  if (!app) return false;
  // Подписанные данные запуска — главный признак настоящего Mini App.
  if (typeof app.initData === "string" && app.initData.length > 0) {
    return true;
  }
  // Страховка: WebView Telegram без initData (редкие краевые случаи).
  if (typeof window.TelegramWebviewProxy !== "undefined") {
    return true;
  }
  // Стаб вне Telegram отдаёт platform="unknown" — реальная платформа
  // (android/ios/macos/windows/tdesktop/web…) бывает только в WebView.
  return (
    typeof app.platform === "string" &&
    app.platform.length > 0 &&
    app.platform !== "unknown"
  );
}

/** Минимальная версия Telegram WebApp API, поддерживающая
 *  enableVerticalSwipes / disableVerticalSwipes.
 *  Источник: https://core.telegram.org/bots/webapps — Bot API 7.7 (July 7, 2024). */
const VERTICAL_SWIPES_MIN_VERSION = "7.7";

/** Безопасно включает или отключает вертикальные свайпы в Telegram Mini App.
 *
 *  Feature detection без try/catch:
 *  1. Telegram.WebApp существует?
 *  2. isVersionAtLeast доступен? (Bot API 6.1+)
 *  3. Версия >= 7.7?
 *  4. disableVerticalSwipes / enableVerticalSwipes существует как функция?
 *
 *  Если хотя бы один пункт не пройден — ничего не делаем (старые
 *  клиенты просто сохраняют стандартное поведение свайпов).
 *
 *  Вызывается из initTelegramWebApp() и может вызываться из任何
 *  компонента, которому нужно временно заблокировать/разблокировать
 *  свайпы (например, при открытии диалога). */
export function setTelegramVerticalSwipes(enabled: boolean): void {
  const app = telegramWebApp();
  if (!app) return;

  // isVersionAtLeast появился в Bot API 6.1 — без него проверка версии
  // невозможна, и безопаснее не вызывать метод (старый клиент).
  if (typeof app.isVersionAtLeast !== "function") return;
  if (!app.isVersionAtLeast(VERTICAL_SWIPES_MIN_VERSION)) return;

  const method = enabled
    ? app.enableVerticalSwipes
    : app.disableVerticalSwipes;
  if (typeof method === "function") {
    method.call(app);
  }
}

/** Инициализация: подтвердить показ, развернуть на весь экран, запретить
 *  вертикальный свайп (выход из приложения случайным жестом). Вызывается
 *  один раз при старте приложения (src/main.tsx). */
export function initTelegramWebApp(): void {
  const app = telegramWebApp();
  if (!app) return;
  app.ready();
  app.expand();
  setTelegramVerticalSwipes(false);
}

/** Telegram id текущего пользователя (null вне Telegram или без авторизации). */
export function telegramUserId(): number | null {
  return telegramWebApp()?.initDataUnsafe.user?.id ?? null;
}

/** Имя/ник пользователя Telegram (для подписи в UI). */
export function telegramUserLabel(): string | null {
  const user = telegramWebApp()?.initDataUnsafe.user;
  if (!user) return null;
  return user.username
    ? `@${user.username}`
    : [user.first_name, user.last_name].filter(Boolean).join(" ") || null;
}
