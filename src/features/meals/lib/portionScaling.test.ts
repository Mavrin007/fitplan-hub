/**
 * Тесты математики порций страницы «Питание».
 */
import { describe, expect, it } from "vitest";
import {
  gramsFromQuantity,
  kcalPerServing,
  macrosForGrams,
  quantityStepFor,
  roundPortion,
  selectedPreview,
  stepQuantity,
} from "./portionScaling";

const FOOD = { servingGrams: 150, calories: 200, protein: 20, carbs: 30, fat: 5, unit: "г" };

describe("kcalPerServing", () => {
  it("ккал порции из макросов на 100 г", () => {
    expect(kcalPerServing(200, 150)).toBe(300);
  });
});

describe("gramsFromQuantity", () => {
  it("библиотека: количество порций × размер порции", () => {
    expect(gramsFromQuantity(FOOD, 2, false)).toBe(300);
  });

  it("внешний каталог: количество — это граммы", () => {
    expect(gramsFromQuantity(FOOD, 250, true)).toBe(250);
  });
});

describe("macrosForGrams", () => {
  it("масштабирует КБЖУ на 100 г к заданным граммам", () => {
    expect(macrosForGrams(FOOD, 300)).toEqual({ kcal: 600, protein: 60, carbs: 90, fat: 15 });
  });

  it("округляет макросы до десятых", () => {
    const half = macrosForGrams(FOOD, 75);
    expect(half).toEqual({ kcal: 150, protein: 15, carbs: 22.5, fat: 3.8 });
  });
});

describe("roundPortion / stepQuantity", () => {
  it("округляет до десятых и не опускается ниже 0.5", () => {
    expect(roundPortion(2.33)).toBe(2.3);
    expect(roundPortion(0.1)).toBe(0.5);
  });

  it("шаг −/+ от текущего количества", () => {
    expect(stepQuantity(2, 0.5, 1)).toBe(2.5);
    expect(stepQuantity(2, 0.5, -1)).toBe(1.5);
  });
});

describe("quantityStepFor", () => {
  it("внешний каталог — 100 г", () => {
    expect(quantityStepFor(FOOD, true)).toBe(100);
  });

  it("штучные продукты — целыми штуками", () => {
    expect(quantityStepFor({ ...FOOD, unit: "шт" }, false)).toBe(1);
  });

  it("граммовые — полпорции", () => {
    expect(quantityStepFor(FOOD, false)).toBe(0.5);
  });

  it("неизвестный продукт — полпорции", () => {
    expect(quantityStepFor(null, false)).toBe(0.5);
  });
});

describe("selectedPreview", () => {
  it("превью для библиотечного продукта по порциям", () => {
    expect(selectedPreview(FOOD, 2, false)).toEqual({
      kcal: 600,
      protein: 60,
      carbs: 90,
      fat: 15,
    });
  });

  it("превью для внешнего продукта по граммам", () => {
    const off = { servingGrams: 100, calories: 90, protein: 5, carbs: 10, fat: 2 };
    expect(selectedPreview(off, 250, true)).toEqual({ kcal: 225, protein: 12.5, carbs: 25, fat: 5 });
  });

  it("null без продукта или с нулевым количеством", () => {
    expect(selectedPreview(null, 1, false)).toBeNull();
    expect(selectedPreview(FOOD, 0, false)).toBeNull();
  });
});
