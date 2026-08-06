/**
 * Единый разбор ошибок Convex-вызовов для тостов.
 *
 * Проблема: клиентская обёртка Convex при сбое мутации подставляет в
 * `err.message` служебный текст «[CONVEX M(fn)] [Request ID: ...] Server Error»
 * (или просто «Server Error»), и реальная причина теряется. Решение: сервер
 * кидает ConvexError с полем `data = { message }` — Convex гарантированно
 * доносит `data` до клиента (`err.data`), и мы показываем его. Плюс здесь же
 * вытаскиваем реальное сообщение из обёртки, если data нет (например, ошибка
 * валидации аргументов или старая версия сервера).
 */

/** Достаёт человекочитаемое сообщение из ConvexError / обычного Error. */
export function formatConvexError(err: unknown, fallback?: string): string {
  const fallbackText =
    fallback ?? "Сервер временно недоступен. Попробуйте ещё раз.";

  // 1. ConvexError: сервер положил причину в data ({ message } или строка).
  if (isRecord(err) && "data" in err) {
    const fromData = messageFromData(err.data);
    if (fromData) return fromData;
  }

  // 2. Обычный Error: вырезаем обёртки и ищем настоящее сообщение.
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err ?? "");

  let text = raw
    .replace(/^\[CONVEX [^\]]*\]\s*/, "") // [CONVEX M(fn)]
    .replace(/^\[Request ID: [^\]]*\]\s*/, "") // [Request ID: ...]
    .trim();

  // В некоторых средах реальное сообщение вложено в message после обёртки:
  // "Server Error\nUncaught Error: Not authenticated\n  at handler (…)…"
  const embedded = text.match(/Uncaught Error: ([^\n]+)/);
  if (embedded) text = embedded[1].trim();

  text = text
    .replace(/\n.*$/, "") // хвост со стеком ("Called by client" и т.п.)
    .trim();

  // Известные служебные сообщения — переводим в понятные.
  if (/^not authenticated$/i.test(text)) {
    return "Сессия истекла. Войдите заново.";
  }
  if (/^not found$/i.test(text)) {
    return "Запись не найдена или уже удалена.";
  }

  // «Server Error» без реальной причины — показываем общий текст.
  if (!text || /^server error$/i.test(text)) {
    return fallbackText;
  }
  return text;
}

/**
 * Быстрый человекочитаемый разбор ошибки auth/action-вызовов (Auth.tsx).
 *
 * Convex-клиент оборачивает серверные ошибки в длинный префикс:
 * «[CONVEX A(auth:signIn)] [Request ID: …] Server Error\nUncaught Error: …».
 * Пользователю показываем только текст после «Uncaught Error: » — это и есть
 * сообщение, брошенное в emailOtp.ts / otpRateLimit.ts. От formatConvexError
 * отличается намеренно: не переводит служебные сообщения и не подменяет
 * пустой результат fallback'ом (для auth-флоу важно показать исходный текст,
 * например серверный rate-limit «Код уже отправлен…»).
 */
export function readableError(error: unknown): string {
  if (error instanceof Error) {
    // Группа — всё до конца строки после «Uncaught Error: ». Если текста на
    // строке нет (пустая группа, дальше стек), trim даёт пустоту → исходник.
    const match = error.message.match(/Uncaught Error:([^\n]*)/);
    const text = match ? match[1].trim() : "";
    return text || error.message;
  }
  return String(error);
}

function messageFromData(data: unknown): string | null {
  if (typeof data === "string") {
    return data.trim() || null;
  }
  if (isRecord(data)) {
    const m = data.message;
    if (typeof m === "string" && m.trim()) return m.trim();
    const detail = data.detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    const s = JSON.stringify(data);
    if (s && s !== "{}") return s;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
