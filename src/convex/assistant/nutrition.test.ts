/**
 * Юнит-тесты разрешения продуктов и расчёта КБЖУ (src/convex/assistant/nutrition.ts).
 *
 * Проверяем детерминированность и источники: verified (библиотека/свои
 * продукты), ai_estimate (явная логика оценки), масштабирование порций
 * (граммы/штуки/порции) и хранение количества. Никакого LLM в расчётах.
 */
import { describe, expect, it } from "vitest";
import {
  estimatePer100g,
  estimateNutrition,
  quantityToStore,
  resolveFood,
  resolveOrEstimate,
  scalePortion,
} from "./nutrition";

describe("resolveFood — verified-источники", () => {
  it("точное совпадение в кураторской библиотеке → verified с sourceId", () => {
    const res = resolveFood("Яблоко", []);
    expect(res).not.toBeNull();
    expect(res?.source).toBe("verified");
    expect(res?.isEstimate).toBe(false);
    expect(res?.sourceId).toBe("library:Яблоко");
    expect(res?.calories).toBe(52);
  });

  it("частичное совпадение (подстрока) разрешается в библиотеке", () => {
    const res = resolveFood("овсянка", []);
    expect(res?.name).toBe("Овсянка (сухая)");
    expect(res?.source).toBe("verified");
  });

  it("свой продукт пользователя (точное имя) → verified с _id источника", () => {
    const custom = {
      _id: "food-42",
      name: "Протеиновый коктейль",
      amount: 50,
      unit: "г",
      calories: 200,
      protein: 30,
      carbs: 10,
      fat: 4,
    };
    const res = resolveFood("Протеиновый коктейль", [custom]);
    expect(res).not.toBeNull();
    expect(res?.source).toBe("verified");
    expect(res?.sourceId).toBe("food-42");
    // На 100 г: 200 × 2 = 400 ккал, белки 30 × 2 = 60 г.
    expect(res?.calories).toBe(400);
    expect(res?.protein).toBe(60);
  });

  it("неизвестный продукт → null (оценку решает вызывающий)", () => {
    expect(resolveFood("Непонятное блюдо 42", [])).toBeNull();
  });
});

describe("estimateNutrition — явная детерминированная оценка", () => {
  it("алиас целого блюда (шашлык)", () => {
    const res = estimateNutrition("Шашлык из свинины");
    expect(res.source).toBe("ai_estimate");
    expect(res.isEstimate).toBe(true);
    expect(res.calories).toBe(250);
    expect(res.protein).toBe(25);
  });

  it("ключевое слово (курица) даёт типичные КБЖУ на 100 г", () => {
    const res = estimateNutrition("Куриная грудка тушёная");
    expect(res.source).toBe("ai_estimate");
    expect(res.calories).toBe(160);
    expect(res.protein).toBe(25);
  });

  it("generic-дефолт для неизвестного названия", () => {
    const res = estimatePer100g("Что-то экзотическое");
    expect(res).toEqual({ calories: 150, protein: 8, carbs: 12, fat: 7 });
  });

  it("resolveOrEstimate всегда возвращает результат с источником", () => {
    const known = resolveOrEstimate("Яблоко", []);
    expect(known.source).toBe("verified");
    const unknown = resolveOrEstimate("Рагу с фасолью", []);
    expect(unknown.source).toBe("ai_estimate");
    expect(unknown.isEstimate).toBe(true);
  });
});

describe("scalePortion — детерминированное масштабирование", () => {
  it("граммы: 150 г курицы (160 ккал/100 г) → 240 ккал", () => {
    const macros = scalePortion(
      { ...estimateNutrition("Курица"), name: "Курица" },
      150,
      "г",
    );
    expect(macros.calories).toBe(240);
    expect(macros.protein).toBe(37.5);
  });

  it("штуки: 2 яйца через servingGrams (по умолчанию 100 г/шт)", () => {
    const macros = scalePortion(
      { ...estimateNutrition("Яйцо"), name: "Яйцо" },
      2,
      "шт",
      50,
    );
    // 2 × 50 г = 100 г → как на 100 г.
    expect(macros.calories).toBe(155);
  });

  it("порции: 1.5 порции по servingGrams 100", () => {
    const macros = scalePortion(
      { ...estimateNutrition("Каша"), name: "Каша" },
      1.5,
      "serving",
      100,
    );
    // 1.5 × 100 = 150 г → 110 × 1.5 = 165 ккал.
    expect(macros.calories).toBe(165);
  });

  it("без единицы: штучный продукт библиотеки считается штуками", () => {
    const apple = resolveFood("Яблоко", []);
    expect(apple).not.toBeNull();
    // Яблоко: unit «шт», servingGrams 180 → 2 шт = 360 г → 52 × 3.6 = 187.
    const macros = scalePortion(apple!, 2, undefined);
    expect(macros.calories).toBe(187);
  });

  it("без единицы: граммовый продукт считается граммами", () => {
    const oat = resolveFood("овсянка", []);
    expect(oat).not.toBeNull();
    const macros = scalePortion(oat!, 50, undefined);
    // «Овсянка (сухая)»: 389 ккал/100 г × 0.5 = 194.5 → 195.
    expect(macros.calories).toBe(195);
  });

  it("отрицательное/нулевое количество не даёт отрицательных макросов", () => {
    const macros = scalePortion(estimateNutrition("Курица"), 0, "г");
    expect(macros.calories).toBe(0);
  });
});

describe("quantityToStore", () => {
  it("граммы хранятся граммами, штучные продукты — штуками", () => {
    const oat = resolveFood("овсянка", []);
    expect(quantityToStore(oat!, 250, undefined)).toBe(250);
    const apple = resolveFood("Яблоко", []);
    expect(quantityToStore(apple!, 2, undefined)).toBe(2);
  });

  it("явные единицы г/шт уважаются", () => {
    const apple = resolveFood("Яблоко", []);
    expect(quantityToStore(apple!, 300, "г")).toBe(300);
    const oat = resolveFood("овсянка", []);
    expect(quantityToStore(oat!, 3, "шт")).toBe(3);
  });
});
