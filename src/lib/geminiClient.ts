/**
 * Минимальный клиент Gemini REST (без SDK): fetch к
 * generativelanguage.googleapis.com с системным промптом, историей и
 * опционально картинкой (inlineData — для фото-трекинга еды).
 *
 * Чистый модуль без Convex-импортов: используется и `convex/assistant.ts`
 * (текстовый чат), и `convex/photo.ts` (распознавание фото тарелки).
 * Таймаут-страховка через AbortSignal — зависший провайдер не вешает action.
 */

import { AI_REQUEST_TIMEOUT_MS } from "./assistantCore";

/** Часть запроса: текст и/или встроенное изображение (base64). */
export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface GeminiMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiResult {
  ok: boolean;
  text?: string;
  error?: string;
}

/** Один запрос generateContent. Возвращает текст или сообщение об ошибке. */
export async function geminiGenerateContent(
  key: string,
  model: string,
  system: string,
  contents: GeminiMessage[],
  maxTokens: number,
  timeoutMs: number = AI_REQUEST_TIMEOUT_MS,
): Promise<GeminiResult> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens },
        }),
        signal: timeoutSignal(timeoutMs),
      },
    );
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = (await res.json()) as { error?: { message?: string } };
        if (err.error?.message) detail = err.error.message;
      } catch {
        // Тело ошибки не JSON — оставляем статус.
      }
      return { ok: false, error: detail };
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("") ?? "";
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** AbortSignal.timeout с фолбэком на окружения без поддержки. */
function timeoutSignal(timeoutMs: number): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(timeoutMs);
  } catch {
    return undefined;
  }
}
