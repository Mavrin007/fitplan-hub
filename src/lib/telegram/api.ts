/**
 * Минимальный клиент Telegram Bot API (fetch, без зависимостей).
 *
 * Конвейер бота: Convex httpAction получает апдейт от Telegram, `src/lib/telegram/bot.ts`
 * (чистая логика) возвращает план операций, а этот модуль выполняет их против
 * api.telegram.org. Токен передаётся аргументом — из process.env на сервере
 * (TELEGRAM_BOT_TOKEN), в тестах — мок.
 */

/** Имя бота (без @) — видно пользователям в приложении и в подсказках. */
export const TELEGRAM_BOT_USERNAME = "FitplanKiloBot";

/** Числовой id бота — цифры из TELEGRAM_BOT_TOKEN до «:». Публичное значение
 *  (как и username): нужно клиенту для OAuth-флоу oauth.telegram.org
 *  (параметр bot_id). При перевыпуске токена id не меняется. */
export const TELEGRAM_BOT_ID = 8659935112;

/** URL веб-версии КИЛО, который открывается как Telegram Mini App.
 *  Переопределяется env-переменной TELEGRAM_MINI_APP_URL на сервере
 *  (Convex dashboard); здесь — фолбэк на канонический домен проекта. */
export const DEFAULT_MINI_APP_URL = "https://fitplan-hub.vercel.app";

/** Глубокий линк на Mini App: t.me/<bot>/app открывает приложение внутри
 *  Telegram (бот должен быть создан в @BotFather, Mini App — настроен). */
export function telegramMiniAppUrl(
  botUsername: string = TELEGRAM_BOT_USERNAME,
): string {
  return `https://t.me/${botUsername}/app`;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
  /** Кнопка Mini App: открывает https-URL приложения внутри Telegram. */
  web_app?: { url: string };
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface SendMessageOptions {
  parseMode?: "HTML";
  replyMarkup?: InlineKeyboardMarkup;
}

/** Экранная клавиатура (для Mini App/команд не нужна — только инлайн). */

/** Базовый вызов метода Bot API. Кидает Error с описанием Telegram. */
export async function tgApi<T>(
  token: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as {
    ok: boolean;
    result?: T;
    description?: string;
  };
  if (!data.ok) {
    throw new Error(
      `Telegram ${method}: ${data.description ?? "неизвестная ошибка"}`,
    );
  }
  return data.result as T;
}

export function sendMessage(
  token: string,
  chatId: number,
  text: string,
  opts: SendMessageOptions = {},
): Promise<unknown> {
  return tgApi(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: opts.parseMode ?? "HTML",
    ...(opts.replyMarkup
      ? { reply_markup: { inline_keyboard: opts.replyMarkup.inline_keyboard } }
      : {}),
  });
}

export function editMessageText(
  token: string,
  chatId: number,
  messageId: number,
  text: string,
  opts: SendMessageOptions = {},
): Promise<unknown> {
  return tgApi(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: opts.parseMode ?? "HTML",
    ...(opts.replyMarkup
      ? { reply_markup: { inline_keyboard: opts.replyMarkup.inline_keyboard } }
      : {}),
  });
}

export function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  text?: string,
): Promise<unknown> {
  return tgApi(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

/** Экранирует HTML-спецсимволы для parse_mode=HTML (имена пользователей и т.п.). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
