// Минимальный Resend-клиент (без SDK-зависимости): обычный fetch к REST API
// Resend. Используется из Convex-функций (OTP-коды входа, недельная сводка).
//
// Env-переменные:
//   RESEND_API_KEY   — обязателен (панель Convex → Environment Variables).
//   RESEND_EMAIL_FROM — отправитель. Если не задан, берётся тестовый
//                      onboarding@resend.dev (шлёт только на адрес владельца
//                      аккаунта; для реальных получателей верифицируйте домен
//                      в дашборде Resend и задайте адрес вида noreply@domain).
//
// Возвращает нормализованный результат вместо исключений: вызывающие коды
// (emailOtp.ts, digest.ts) решают, как реагировать на сбой.

export interface ResendSendResult {
  success: boolean;
  error?: string;
  id?: string;
}

interface ResendPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendResendEmail(
  payload: ResendPayload,
): Promise<ResendSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, error: "RESEND_API_KEY не задан" };
  }
  const from = process.env.RESEND_EMAIL_FROM || "onboarding@resend.dev";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: string | { message?: string };
    };

    if (res.ok && typeof data.id === "string") {
      return { success: true, id: data.id };
    }

    const message =
      (typeof data.error === "string"
        ? data.error
        : data.error?.message) ||
      data.message ||
      `HTTP ${res.status}`;
    return { success: false, error: message };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
