import type * as Sentry from "@sentry/react";

/** Маскирует персональные данные в строках: почты, JWT, длинные токены. */
export function redactPii(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "[jwt]",
    )
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[gemini-key]")
    .replace(/\b(?:sk|pk|token|secret)[-_]?[A-Za-z0-9_-]{12,}\b/gi, "[secret]");
}

/** Рекурсивно маскирует почты/токены в объектах произвольной формы. */
export function scrubPii(value: unknown, seen = new Set<object>()): unknown {
  if (typeof value === "string") return redactPii(value);
  if (Array.isArray(value)) return value.map((v) => scrubPii(v, seen));
  if (value && typeof value === "object") {
    if (seen.has(value)) return value;
    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) record[key] = scrubPii(record[key], seen);
  }
  return value;
}

/** beforeSend: убираем PII до того, как событие уйдёт в Sentry. */
export function sanitizeBeforeSend(
  event: Sentry.ErrorEvent,
): Sentry.ErrorEvent | null {
  // Пользователь: оставляем только обезличенные поля, без почты/IP/имени.
  if (event.user && typeof event.user === "object") {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(event.user)) {
      if (!["email", "username", "ip_address", "ipAddress"].includes(key)) {
        safe[key] = value;
      }
    }
    event.user = safe as Sentry.User;
  }
  // Заголовки запроса — могут содержать cookie и авторизацию.
  if (event.request?.headers) {
    const headers = event.request.headers as Record<string, string>;
    for (const key of Object.keys(headers)) {
      if (
        ["cookie", "authorization", "x-api-key", "x-goog-api-key"].includes(
          key.toLowerCase(),
        )
      ) {
        delete headers[key];
      }
    }
  }
  // Сообщения, breadcrumbs и extra — маскируем почты и токены.
  if (event.message) event.message = redactPii(event.message);
  // scrubPii мутирует объекты на месте — переприсваивание не нужно.
  if (event.extra) scrubPii(event.extra);
  if (event.contexts) scrubPii(event.contexts);
  if (event.breadcrumbs) {
    for (const breadcrumb of event.breadcrumbs) {
      if (breadcrumb.message) breadcrumb.message = redactPii(breadcrumb.message);
      if (breadcrumb.data) scrubPii(breadcrumb.data);
    }
  }
  return event;
}
