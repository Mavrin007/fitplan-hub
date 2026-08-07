/**
 * Юнит-тесты action photo.analyzeMealPhoto (src/convex/photo.ts) без
 * Convex-рантайма: замоканы auth, internal.rateLimit.consumeRateLimitAction
 * (через ctx.runMutation) и глобальный fetch (Gemini Vision).
 *
 * Проверяем: неавторизованный путь, отсутствие GEMINI_API_KEY, невалидный
 * data URL / не изображение / слишком большой файл, payload с inlineData,
 * парсинг items из JSON-блока, пустое распознавание, ошибки провайдера,
 * списание лимита до вызова провайдера.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));

const { consumeRateLimitAction } = vi.hoisted(() => ({
  consumeRateLimitAction: vi.fn(async () => undefined),
}));
vi.mock("./_generated/api", () => ({
  internal: { rateLimit: { consumeRateLimitAction } },
}));

import { getAuthUserId } from "@convex-dev/auth/server";
import { analyzeMealPhoto } from "./photo";
import { RATE_LIMITS } from "./rateLimit";

type PhotoCtx = { runMutation: ReturnType<typeof vi.fn> };

const runPhoto = (
  analyzeMealPhoto as unknown as {
    _handler: (ctx: PhotoCtx, args: { imageDataUrl: string }) => Promise<{
      items: { name: string; quantity: number; calories: number; protein: number; carbs: number; fat: number }[];
      raw: string;
    }>;
  }
)._handler;

function makeCtx(): PhotoCtx {
  // runMutation исполняет внутренние мутации (vi.fn) — как в assistant.test.
  const runMutation = vi.fn(async (fn: unknown, args: unknown) =>
    typeof fn === "function" ? (fn as (a: unknown) => unknown)(args) : undefined,
  );
  return { runMutation };
}

/** Валидный крошечный data URL PNG (1×1, ~70 байт base64). */
const DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Мок успешного ответа Gemini с JSON-блоком logMeal. */
function geminiOk(block: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: block }] } }],
      }),
    })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  (getAuthUserId as ReturnType<typeof vi.fn>).mockResolvedValue("user-1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("analyzeMealPhoto — защитные пути", () => {
  it("без сессии бросает «Не авторизован» и не дёргает лимит/сеть", async () => {
    (getAuthUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      runPhoto(makeCtx(), { imageDataUrl: DATA_URL }),
    ).rejects.toThrow(/Не авторизован/);
    expect(consumeRateLimitAction).not.toHaveBeenCalled();
  });

  it("без GEMINI_API_KEY — понятная ошибка до сети", async () => {
    await expect(
      runPhoto(makeCtx(), { imageDataUrl: DATA_URL }),
    ).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it("невалидный data URL отклоняется", async () => {
    vi.stubEnv("GEMINI_API_KEY", "key");
    await expect(
      runPhoto(makeCtx(), { imageDataUrl: "not-a-data-url" }),
    ).rejects.toThrow(/JPEG\/PNG\/WebP/);
  });

  it("не изображение (text/plain) отклоняется", async () => {
    vi.stubEnv("GEMINI_API_KEY", "key");
    await expect(
      runPhoto(makeCtx(), {
        imageDataUrl: "data:text/plain;base64,aGVsbG8=",
      }),
    ).rejects.toThrow(/JPEG\/PNG\/WebP/);
  });

  it("слишком большой файл отклоняется", async () => {
    vi.stubEnv("GEMINI_API_KEY", "key");
    const huge = "data:image/png;base64," + "A".repeat(2_600_000);
    await expect(runPhoto(makeCtx(), { imageDataUrl: huge })).rejects.toThrow(
      /2\.5 МБ/,
    );
  });
});

describe("analyzeMealPhoto — успешный путь", () => {
  it("лимит списывается до вызова провайдера, payload содержит inlineData", async () => {
    vi.stubEnv("GEMINI_API_KEY", "key");
    geminiOk(
      "<<<LOG>>>\n{\"action\":\"logMeal\",\"items\":[{\"name\":\"Овсянка\",\"quantity\":250,\"calories\":340,\"protein\":12,\"carbs\":50,\"fat\":7}]}\n<<<END>>>",
    );

    const ctx = makeCtx();
    const res = await runPhoto(ctx, { imageDataUrl: DATA_URL });

    // Лимит ушёл с ключом user:photo и лимитами RATE_LIMITS.photo.
    expect(consumeRateLimitAction).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "user-1:photo",
        limit: RATE_LIMITS.photo.limit,
        windowMs: RATE_LIMITS.photo.windowMs,
      }),
    );

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(url).toMatch(/generateContent/);
    const body = JSON.parse(init.body) as {
      contents: { parts: { inlineData?: { mimeType: string; data: string } }[] }[];
    };
    const parts = body.contents[0].parts as unknown as {
      inlineData?: { mimeType: string; data: string };
    }[];
    expect(parts[1].inlineData).toEqual({
      mimeType: "image/png",
      data: DATA_URL.split(",")[1],
    });

    // Парсинг items из JSON-блока.
    expect(res.items).toEqual([
      { name: "Овсянка", quantity: 250, calories: 340, protein: 12, carbs: 50, fat: 7 },
    ]);
    expect(res.raw).toContain("logMeal");
  });

  it("пустое распознавание (items: []) → пустой массив без ошибки", async () => {
    vi.stubEnv("GEMINI_API_KEY", "key");
    geminiOk(
      "<<<LOG>>>\n{\"action\":\"logMeal\",\"items\":[]}\n<<<END>>>",
    );
    const res = await runPhoto(makeCtx(), { imageDataUrl: DATA_URL });
    expect(res.items).toEqual([]);
  });

  it("битый JSON от модели → пустой массив, а не падение", async () => {
    vi.stubEnv("GEMINI_API_KEY", "key");
    geminiOk("Просто текст без блока");
    const res = await runPhoto(makeCtx(), { imageDataUrl: DATA_URL });
    expect(res.items).toEqual([]);
  });

  it("значения из модели клампятся в безопасные диапазоны", async () => {
    vi.stubEnv("GEMINI_API_KEY", "key");
    geminiOk(
      "<<<LOG>>>\n{\"action\":\"logMeal\",\"items\":[{\"name\":\"Суп\",\"quantity\":99999,\"calories\":-5,\"protein\":\"10\"}]}\n<<<END>>>",
    );
    const res = await runPhoto(makeCtx(), { imageDataUrl: DATA_URL });
    expect(res.items[0]).toEqual({
      name: "Суп",
      quantity: 5000, // clampNum(99999, 1, 5000, 1)
      calories: 0, // отрицательные → 0
      protein: 10, // строки принимаются
      carbs: 0,
      fat: 0,
    });
  });
});

describe("analyzeMealPhoto — ошибки провайдера и лимита", () => {
  it("HTTP-ошибка Gemini → понятное сообщение про лимит (429 категоризируется)", async () => {
    vi.stubEnv("GEMINI_API_KEY", "key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })),
    );
    await expect(
      runPhoto(makeCtx(), { imageDataUrl: DATA_URL }),
    ).rejects.toThrow(/дневной лимит/);
  });

  it("лимит фото: ошибка из internal-мутации проходит наружу", async () => {
    vi.stubEnv("GEMINI_API_KEY", "key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    consumeRateLimitAction.mockRejectedValueOnce(
      new Error("Слишком часто. Попробуйте через 3000 сек."),
    );
    await expect(
      runPhoto(makeCtx(), { imageDataUrl: DATA_URL }),
    ).rejects.toThrow(/Слишком часто/);
    // Провайдер не вызван — лимит сработал до внешнего вызова.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
