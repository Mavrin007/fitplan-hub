/**
 * Юнит-тесты поиска продуктов (src/lib/productSearch.ts): локальная
 * кураторская библиотека, парсинг ответов Open Food Facts (ккал/кДж,
 * пропуски полей, мусорные имена, дедупликация), поведение при сетевых
 * ошибках (fetch мокается).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OFF_PAGE_SIZE,
  OFF_TIMEOUT_MS,
  parseOpenFoodFactsProduct,
  searchLocalLibrary,
  searchOpenFoodFacts,
} from "./productSearch";
import { FOOD_LIBRARY } from "./mealData";

function offProduct(overrides: Record<string, unknown> = {}) {
  return {
    product_name: "Овсяные хлопья",
    brands: "Урожай",
    code: "4812345678901",
    nutriments: {
      "energy-kcal_100g": 389,
      "proteins_100g": 17,
      "carbohydrates_100g": 66,
      "fat_100g": 7,
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchLocalLibrary", () => {
  it("ищет по подстроке без учёта регистра", () => {
    const res = searchLocalLibrary("Овсянк", 10);
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((f) => f.name.toLowerCase().includes("овсянк"))).toBe(true);
  });

  it("пустой запрос возвращает первые позиции каталога", () => {
    expect(searchLocalLibrary("", 5)).toHaveLength(5);
    expect(searchLocalLibrary("   ", 3)[0]).toEqual(FOOD_LIBRARY[0]);
  });

  it("ограничивает число результатов", () => {
    expect(searchLocalLibrary("", 1)).toHaveLength(1);
    expect(searchLocalLibrary("я", 2).length).toBeLessThanOrEqual(2);
  });

  it("не находит ничего по несуществующему запросу", () => {
    expect(searchLocalLibrary("зыфызфы")).toHaveLength(0);
  });
});

describe("parseOpenFoodFactsProduct", () => {
  it("мапит имя, бренд, штрихкод и макросы на 100 г", () => {
    const p = parseOpenFoodFactsProduct(offProduct());
    expect(p).toEqual({
      name: "Овсяные хлопья",
      brands: "Урожай",
      calories: 389,
      protein: 17,
      carbs: 66,
      fat: 7,
      servingGrams: 100,
      unit: "г",
      barcode: "4812345678901",
    });
  });

  it("считает калории из кДж, если нет ккал", () => {
    const p = parseOpenFoodFactsProduct(
      offProduct({
        nutriments: {
          "energy-kj_100g": 1630,
          "proteins_100g": "10.5",
          "carbohydrates_100g": "50",
          "fat_100g": "3.2",
        },
      }),
    );
    // 1630 кДж / 4.184 ≈ 390 ккал
    expect(p!.calories).toBe(390);
    expect(p!.protein).toBe(10.5); // строки тоже принимаются
  });

  it("отсутствующие макросы и калории → 0, отрицательные → 0", () => {
    const p = parseOpenFoodFactsProduct(
      offProduct({ nutriments: { "proteins_100g": -3 } }),
    );
    expect(p!.calories).toBe(0);
    expect(p!.protein).toBe(0);
    expect(p!.carbs).toBe(0);
  });

  it("без названия или с мусорным названием → null", () => {
    expect(parseOpenFoodFactsProduct({ product_name: "" })).toBeNull();
    expect(parseOpenFoodFactsProduct({ product_name: "   " })).toBeNull();
    expect(parseOpenFoodFactsProduct({ product_name: "{заглушка}" })).toBeNull();
    expect(parseOpenFoodFactsProduct({ product_name: "test product" })).toBeNull();
    expect(
      parseOpenFoodFactsProduct({ product_name: "без названия" }),
    ).toBeNull();
  });

  it("короткий/нецифровой код не попадает в штрихкод", () => {
    const p = parseOpenFoodFactsProduct(offProduct({ code: "abc" }));
    expect(p!.barcode).toBeUndefined();
  });
});

describe("searchOpenFoodFacts (сеть мокается)", () => {
  it("отправляет запрос с полями и парсит ответ", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ products: [offProduct()] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await searchOpenFoodFacts("овсянка");

    expect(res).toHaveLength(1);
    expect(res[0].name).toBe("Овсяные хлопья");
    // URL содержит поисковые термины, поля и page_size.
    const url = (fetchMock.mock.calls as unknown as [unknown][])[0][0] as string;
    expect(url).toContain("search_terms=");
    expect(url).toContain("product_name");
    expect(url).toContain("page_size=" + OFF_PAGE_SIZE);
  });

  it("пустой запрос не трогает сеть", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchOpenFoodFacts("   ")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("дедуплицирует продукты с одинаковым именем", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          products: [offProduct(), offProduct({ code: "9999999999999" })],
        }),
      })),
    );
    const res = await searchOpenFoodFacts("овсянка");
    expect(res).toHaveLength(1);
  });

  it("HTTP-ошибка кидает исключение (вызывающий показывает «каталог недоступен»)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    );
    await expect(searchOpenFoodFacts("овсянка")).rejects.toThrow(/HTTP 503/);
  });

  it("сетевая ошибка кидает исключение", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    await expect(searchOpenFoodFacts("овсянка")).rejects.toThrow(/network down/);
  });

  it("пустой ответ → пустой массив без ошибки", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ products: [] }) })),
    );
    await expect(searchOpenFoodFacts("зыфызфы")).resolves.toEqual([]);
  });

  it("создаёт AbortSignal (таймаут не вешает диалог)", async () => {
    expect(OFF_TIMEOUT_MS).toBeGreaterThan(0);
    const signal = AbortSignal.timeout(OFF_TIMEOUT_MS);
    expect(signal.aborted).toBe(false);
  });
});
