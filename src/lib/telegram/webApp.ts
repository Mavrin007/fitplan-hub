/**
 * Telegram Mini App: инициализация WebView и доступ к данным Telegram.
 *
 * Приложение КИЛО работает и как обычный сайт, и как Telegram Mini App
 * (кнопка бота). Вне Telegram все функции безопасно возвращают null/false —
 * ничего не ломается, скрипт telegram-web-app.js просто не инициализируется.
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
  setHeaderColor(color: string): void;
  colorScheme: "light" | "dark";
  isExpanded: boolean;
  close(): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebAppApi };
  }
}

/** Доступ к API WebApp; вне Telegram — null. */
export function telegramWebApp(): TelegramWebAppApi | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/** Запущено ли приложение внутри Telegram Mini App. */
export function isTelegramWebApp(): boolean {
  return telegramWebApp() !== null;
}

/** Инициализация: подтвердить показ, развернуть на весь экран, запретить
 *  вертикальный свайп (выход из приложения случайным жестом). Вызывается
 *  один раз при старте приложения (src/main.tsx). */
export function initTelegramWebApp(): void {
  const app = telegramWebApp();
  if (!app) return;
  app.ready();
  app.expand();
  try {
    app.disableVerticalSwipes();
  } catch {
    // disableVerticalSwipes появился в поздних версиях — не критично.
  }
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
