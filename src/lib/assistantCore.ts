/**
 * Чистые функции ИИ-ассистента (без Convex-рантайма и сетевых вызовов).
 *
 * Вынесены из src/convex/assistant.ts, чтобы покрывать их юнит-тестами без
 * моков рантайма: парсинг служебных JSON-блоков модели, санитизация текста
 * ответа, категоризация ошибок провайдера, оценка токенов, приведение
 * значений к безопасным диапазонам.
 */

/** Полный выходной бюджет ответа (токены). */
export const MAX_OUTPUT_TOKENS = 1024;

/** Оценка размера системного промпта в токенах: он строится в хендлере
 *  (профиль + продукты + план + справочник) и почти статичен по длине —
 *  закладываем его как константу вместо повторного измерения. */
export const SYSTEM_PROMPT_ESTIMATE_TOKENS = 4_000;

/** Таймаут одного запроса к ИИ-провайдеру, мс. */
export const AI_REQUEST_TIMEOUT_MS = 60_000;

/** Общий дедлайн на весь ответ ассистента (включая автоподбор моделей), мс. */
export const AI_TOTAL_BUDGET_MS = 90_000;

/** Грубая оценка стоимости запроса в токенах: ~4 символа ≈ 1 токен для
 *  смешанного русско-английского текста + системный промпт + полный выходной
 *  бюджет (мы не знаем фактический, берём максимум). Используется квотой
 *  assistantLimits как «сколько мы собираемся сжечь» — консервативная
 *  оценка сверху. */
export function estimateTokens(parts: string[]): number {
  const chars = parts.reduce((s, p) => s + p.length, 0);
  return Math.ceil(chars / 4) + SYSTEM_PROMPT_ESTIMATE_TOKENS + MAX_OUTPUT_TOKENS;
}

/** Таймаут для fetch с понятной ошибкой: AbortSignal.timeout доступен в
 *  Node 18+ (рантайм Convex actions). Возвращает сигнал или null (если
 *  окружение не поддерживает — тогда fetch идёт без таймаута). */
export function timeoutSignal(timeoutMs: number): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(timeoutMs);
  } catch {
    return undefined;
  }
}

/** Приводит русские/английские названия приёмов пищи к валидным значениям. */
const MEAL_TYPE_ALIASES: Record<string, string> = {
  завтрак: "breakfast",
  breakfast: "breakfast",
  обед: "lunch",
  lunch: "lunch",
  ужин: "dinner",
  dinner: "dinner",
  перекус: "snack",
  снек: "snack",
  snack: "snack",
};

export function toMealType(raw: unknown): string {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase();
  return MEAL_TYPE_ALIASES[key] ?? "snack";
}

export function clampNum(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseFloat(value)
        : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
}

export function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

/** Достаёт JSON-блок из ответа модели (между <<<LOG>>> и <<<END>>> или в
 *  тройных кавычках). Устойчив к обрезанным ответам. Возвращает null, если
 *  блока нет. */
export function extractLogBlock(text: string): string | null {
  const marker = text.match(/<<<LOG>>>([\s\S]*?)<<<END>>>/);
  if (marker) return marker[1].trim();

  // Обрезанный ответ: маркер есть, а <<<END>>> нет. Пробуем извлечь из хвоста
  // валидный JSON (до последней закрывающей скобки).
  const start = text.indexOf("<<<LOG>>>");
  if (start !== -1) {
    const tail = text.slice(start + "<<<LOG>>>".length);
    const lastBrace = tail.lastIndexOf("}");
    if (lastBrace !== -1) {
      const json = tail.slice(0, lastBrace + 1);
      try {
        JSON.parse(json);
        return json;
      } catch {
        // невалидно — пробуем другие варианты ниже
      }
    }
  }

  const fenced = text.match(/```(?:json)?([\s\S]*?)```/);
  if (fenced) {
    const candidate = fenced[1].trim();
    if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;
  }
  const bare = text.match(/\{[\s\S]*?\}/);
  return bare ? bare[0] : null;
}

/** Убирает служебные JSON-блоки из текста, оставляя только ответ пользователю.
 *  Не допускает утечки сырых блоков даже при обрезанном ответе модели. */
export function stripLogBlock(text: string): string {
  let cleaned = text
    .replace(/<<<LOG>>>[\s\S]*?<<<END>>>/g, "")
    .replace(/```(?:json)?[\s\S]*?```/g, "");
  // Обрезанный ответ: блок начался, но не закрылся — отрезаем весь хвост.
  const logIdx = cleaned.indexOf("<<<LOG>>>");
  if (logIdx !== -1) cleaned = cleaned.slice(0, logIdx);
  // Незакрытый код-фенс тоже отрезаем (нечётное количество ```).
  const backticks = (cleaned.match(/```/g) ?? []).length;
  if (backticks % 2 === 1) {
    const fenceIdx = cleaned.indexOf("```");
    if (fenceIdx !== -1) cleaned = cleaned.slice(0, fenceIdx);
  }
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

/** Превращает сырую ошибку ИИ-провайдера в понятное сообщение на русском
 *  с подсказкой, что делать. */
export function describeError(raw: string): string {
  const e = raw.toLowerCase();

  if (/не задан|ключ/.test(e) && !/invalid/.test(e)) {
    return (
      "Для работы ассистента нужен ключ ИИ: добавьте GEMINI_API_KEY (или " +
      "VLY_INTEGRATION_KEY) в переменные окружения проекта. Как только ключ " +
      "появится, ассистент заработает без изменений кода."
    );
  }
  if (/429|quota|rate.?limit|too many|exhausted|resource|лимит/.test(e)) {
    return (
      "Исчерпан дневной лимит бесплатного тарифа Gemini — это временно. " +
      "Лимит обычно обновляется раз в сутки (у flash-моделей ~1500 запросов). " +
      "Попробуйте ещё раз позже."
    );
  }
  if (
    /401|403|invalid|api.?key|permission|forbidden|unauthorized|not.?valid/.test(
      e,
    )
  ) {
    return (
      "Похоже, API-ключ недействителен. Проверьте GEMINI_API_KEY в переменных " +
      "окружения проекта: скопируйте его заново из Google AI Studio и сохраните."
    );
  }
  if (/404|not.?found/.test(e)) {
    return (
      "Выбранная модель ИИ сейчас недоступна (возможно, Google переименовал " +
      "её). Нажмите «Проверить подключение» — ассистент подберёт рабочую модель."
    );
  }
  if (
    /fetch|network|econn|timeout|dns|socket|unreachable|offline|нет связи/.test(
      e,
    )
  ) {
    return (
      "Нет связи с сервисом ИИ — возможно, временный сбой сети. Попробуйте " +
      "ещё раз через несколько секунд."
    );
  }
  return (
    `Сервис ИИ временно недоступен (${raw}). Попробуйте ещё раз или нажмите ` +
    "«Проверить подключение» в шапке чата."
  );
}

/** Обёртка с таймаутом для вызовов без поддержки signal (VLY). */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timeout after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
