/**
 * Юнит-тесты чистых функций ассистента (src/lib/assistantCore.ts) — без
 * рантайма и сетевых вызовов: парсинг JSON-блоков модели (extractLogBlock),
 * санитизация ответа (stripLogBlock — без утечки блоков), категоризация
 * ошибок провайдера (describeError), оценка токенов, приведение значений.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_OUTPUT_TOKENS,
  SYSTEM_PROMPT_ESTIMATE_TOKENS,
  asString,
  clampNum,
  describeError,
  estimateTokens,
  extractLogBlock,
  stripLogBlock,
  timeoutSignal,
  toMealType,
  withTimeout,
} from "./assistantCore";

describe("extractLogBlock", () => {
  it("достаёт JSON между <<<LOG>>> и <<<END>>>", () => {
    const text = [
      "Записал: 500 г шашлыка.",
      "<<<LOG>>>",
      '{"action":"logMeal","items":[{"name":"Шашлык","quantity":500}]}',
      "<<<END>>>",
      "Готово!",
    ].join("\n");
    const block = extractLogBlock(text);
    expect(block).not.toBeNull();
    expect(JSON.parse(block!)).toMatchObject({
      action: "logMeal",
      items: [{ name: "Шашлык", quantity: 500 }],
    });
  });

  it("возвращает null, если блока нет", () => {
    expect(extractLogBlock("Просто ответ без записи.")).toBeNull();
  });

  it("вытаскивает JSON из обрезанного ответа (маркер есть, <<<END>>> нет)", () => {
    const text = 'Ответ пользователю.\n<<<LOG>>>\n{"action":"logWeight","weightKg":72.5}\n';
    expect(JSON.parse(extractLogBlock(text)!)).toEqual({
      action: "logWeight",
      weightKg: 72.5,
    });
  });

  it("возвращает null на обрезанном невалидном JSON", () => {
    const text = 'Ответ.\n<<<LOG>>>\n{"action":"logMeal","items":[{"name":"';
    expect(extractLogBlock(text)).toBeNull();
  });

  it("поддерживает JSON в тройных кавычках (fenced)", () => {
    const text = '```json\n{"action":"logWeight","weightKg":80}\n```';
    expect(JSON.parse(extractLogBlock(text)!)).toEqual({
      action: "logWeight",
      weightKg: 80,
    });
  });
});

describe("stripLogBlock", () => {
  it("убирает служебный блок, оставляя ответ пользователю", () => {
    const text = [
      "Записал: 500 г шашлыка — 950 ккал.",
      "",
      "<<<LOG>>>",
      '{"action":"logMeal","items":[]}',
      "<<<END>>>",
    ].join("\n");
    expect(stripLogBlock(text)).toBe("Записал: 500 г шашлыка — 950 ккал.");
  });

  it("не пропускает сырой блок даже при обрезанном ответе модели", () => {
    const text = 'Ответ.\n<<<LOG>>>\n{"action":"logMeal","items":[{"name":"';
    expect(stripLogBlock(text)).toBe("Ответ.");
  });

  it("убирает незакрытый код-фенс (нечётное количество ```)", () => {
    const text = "Вот как считать:\n```json\n{\"action\":\"logWeight\"}";
    expect(stripLogBlock(text)).toBe("Вот как считать:");
  });

  it("схлопывает тройные переносы строк", () => {
    expect(stripLogBlock("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("describeError", () => {
  it("нет ключа → подсказка про GEMINI_API_KEY", () => {
    expect(describeError("не задан ни один ключ")).toMatch(/GEMINI_API_KEY/);
    expect(describeError("missing API key for project")).toMatch(/GEMINI_API_KEY/);
  });

  it("429/quota → дневной лимит Gemini", () => {
    expect(describeError("429 Quota exceeded")).toMatch(/дневной лимит/);
    expect(describeError("RESOURCE_EXHAUSTED")).toMatch(/дневной лимит/);
  });

  it("401/403/invalid → недействительный ключ", () => {
    expect(describeError("401 API key not valid")).toMatch(/API-ключ недействителен/);
    expect(describeError("403 Forbidden")).toMatch(/API-ключ недействителен/);
  });

  it("404 → модель недоступна", () => {
    expect(describeError("404 model not found")).toMatch(/модель ИИ сейчас недоступна/);
  });

  it("network/timeout → нет связи", () => {
    expect(describeError("fetch failed: ECONNREFUSED")).toMatch(/Нет связи/);
    expect(describeError("timeout after 60000ms")).toMatch(/Нет связи/);
  });

  it("незнакомая ошибка → общий текст с оригиналом", () => {
    expect(describeError("weird internal error")).toMatch(/weird internal error/);
  });
});

describe("estimateTokens", () => {
  it("складывает длину всех частей + системный промпт + выходной бюджет", () => {
    // 1000 символов / 4 = 250 + 4000 + 1024
    expect(estimateTokens(["a".repeat(1000)])).toBe(
      Math.ceil(1000 / 4) + SYSTEM_PROMPT_ESTIMATE_TOKENS + MAX_OUTPUT_TOKENS,
    );
  });

  it("пустая история — только системный промпт и бюджет ответа", () => {
    expect(estimateTokens([])).toBe(
      SYSTEM_PROMPT_ESTIMATE_TOKENS + MAX_OUTPUT_TOKENS,
    );
  });
});

describe("clampNum / asString", () => {
  it("clampNum приводит к диапазону и округляет до 0.1", () => {
    expect(clampNum(50, 1, 20, 1)).toBe(20);
    expect(clampNum(0, 1, 20, 1)).toBe(1);
    expect(clampNum("42.55", 0, 100, 0)).toBe(42.6);
    expect(clampNum(NaN, 1, 20, 7)).toBe(7);
    expect(clampNum(undefined, 1, 20, 7)).toBe(7);
  });

  it("asString обрезает и отбрасывает пустые", () => {
    expect(asString("  Овсянка  ", "Продукт")).toBe("Овсянка");
    expect(asString("   ", "Продукт")).toBe("Продукт");
    expect(asString(42, "Продукт")).toBe("Продукт");
  });
});

describe("toMealType", () => {
  it("приводит русские и английские названия", () => {
    expect(toMealType("завтрак")).toBe("breakfast");
    expect(toMealType("Обед")).toBe("lunch");
    expect(toMealType("УЖИН")).toBe("dinner");
    expect(toMealType("перекус")).toBe("snack");
    expect(toMealType("breakfast")).toBe("breakfast");
  });

  it("неизвестное значение → snack (безопасный дефолт)", () => {
    expect(toMealType("второй завтрак")).toBe("snack");
    expect(toMealType(null)).toBe("snack");
    expect(toMealType(undefined)).toBe("snack");
  });
});

describe("timeoutSignal / withTimeout", () => {
  it("timeoutSignal создаёт сигнал или undefined (в окружении без поддержки)", () => {
    const signal = timeoutSignal(100);
    // AbortSignal.timeout доступен в Node 18+ — сигнал есть и не abort'нут сразу.
    expect(signal).toBeDefined();
  });

  it("withTimeout возвращает результат до истечения", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1000)).resolves.toBe("ok");
  });

  it("withTimeout отклоняется по таймауту", async () => {
    const slow = new Promise<string>(() => {
      /* never resolves */
    });
    await expect(withTimeout(slow, 20)).rejects.toThrow(/timeout after 20ms/);
  });
});
