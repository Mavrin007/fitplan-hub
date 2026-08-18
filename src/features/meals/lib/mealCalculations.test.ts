/**
 * Тесты чистых расчётов страницы «Питание»: группировка по приёмам,
 * итоги дня, добор белка, проценты прогресса.
 */
import { describe, expect, it } from "vitest";
import { groupByMeal, progressPercent, proteinBoostAmount, totalsFromEntries } from "./mealCalculations";

describe("groupByMeal", () => {
  it("раскладывает записи по четырём приёмам в фиксированном порядке", () => {
    const entries = [
      { mealType: "dinner", name: "Ужин 1" },
      { mealType: "breakfast", name: "Завтрак 1" },
      { mealType: "dinner", name: "Ужин 2" },
      { mealType: "snack", name: "Перекус" },
      { mealType: "lunch", name: "Обед" },
    ] as { mealType: "breakfast" | "lunch" | "dinner" | "snack"; name: string }[];

    const map = groupByMeal(entries);

    expect(Object.keys(map)).toEqual(["breakfast", "lunch", "dinner", "snack"]);
    expect(map.breakfast.map((e) => e.name)).toEqual(["Завтрак 1"]);
    expect(map.lunch.map((e) => e.name)).toEqual(["Обед"]);
    expect(map.dinner.map((e) => e.name)).toEqual(["Ужин 1", "Ужин 2"]);
    expect(map.snack.map((e) => e.name)).toEqual(["Перекус"]);
  });

  it("пустой список даёт пустые корзины", () => {
    const map = groupByMeal([]);
    expect(map).toEqual({ breakfast: [], lunch: [], dinner: [], snack: [] });
  });
});

describe("totalsFromEntries", () => {
  it("суммирует КБЖУ по всем записям", () => {
    const totals = totalsFromEntries([
      { calories: 250, protein: 20, carbs: 30, fat: 5 },
      { calories: 100, protein: 5, carbs: 10, fat: 2.5 },
    ]);
    expect(totals).toEqual({ calories: 350, protein: 25, carbs: 40, fat: 7.5 });
  });

  it("пустой список даёт нули", () => {
    expect(totalsFromEntries([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe("proteinBoostAmount", () => {
  it("белок на 100 г × порции × размер порции", () => {
    const food = { servingGrams: 150, protein: 20, calories: 0, carbs: 0, fat: 0 };
    expect(proteinBoostAmount(food, 1)).toBe(30);
    expect(proteinBoostAmount(food, 2)).toBe(60);
  });
});

describe("progressPercent", () => {
  it("ограничивает 100 и округляет", () => {
    expect(progressPercent(50, 200)).toBe(25);
    expect(progressPercent(250, 200)).toBe(100);
    expect(progressPercent(0, 200)).toBe(0);
  });

  it("нулевая цель не даёт деления на ноль", () => {
    expect(progressPercent(100, 0)).toBe(0);
  });
});
