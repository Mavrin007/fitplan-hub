/**
 * Тесты чистых форматтеров страницы «Питание».
 */
import { describe, expect, it } from "vitest";
import { DECIMAL_INPUT, fitTone, formatPrice, remainingHint } from "./mealFormatting";
import type { Targets } from "@/lib/nutrition";

const TARGETS: Targets = {
  calories: 2000,
  protein: 120,
  carbs: 250,
  fat: 60,
  bmr: 1800,
  tdee: 2200,
};

describe("formatPrice", () => {
  it("форматирует BYN с запятой", () => {
    expect(formatPrice(5.4)).toBe("≈ 5,40 byn");
    expect(formatPrice(12)).toBe("≈ 12,00 byn");
  });
});

describe("fitTone", () => {
  it("зелёный до 10%, янтарный до 20%, иначе красный", () => {
    expect(fitTone(0.05)).toMatch(/emerald/);
    expect(fitTone(0.1)).toMatch(/emerald/);
    expect(fitTone(0.15)).toMatch(/amber/);
    expect(fitTone(0.2)).toMatch(/amber/);
    expect(fitTone(0.5)).toMatch(/destructive/);
  });
});

describe("DECIMAL_INPUT", () => {
  it("оставляет только цифры, запятую и точку", () => {
    expect(DECIMAL_INPUT("12,5abc")).toBe("12,5");
    expect(DECIMAL_INPUT("1.5 кг")).toBe("1.5");
    expect(DECIMAL_INPUT("")).toBe("");
  });
});

describe("remainingHint", () => {
  it("осталось ккал и белка", () => {
    const hint = remainingHint(
      { calories: 1000, protein: 50 },
      TARGETS,
      { calories: 300, protein: 20 },
    );
    expect(hint).toContain("осталось 700 ккал");
    expect(hint).toContain("белка ещё 50 г");
  });

  it("перебор ккал при превышении цели", () => {
    const hint = remainingHint(
      { calories: 2000, protein: 120 },
      TARGETS,
      { calories: 200, protein: 10 },
    );
    expect(hint).toContain("перебор 200 ккал");
  });

  it("дневная норма ккал закрыта ровно в ноль", () => {
    const hint = remainingHint({ calories: 1800, protein: 100 }, TARGETS, {
      calories: 200,
      protein: 20,
    });
    expect(hint).toContain("дневная норма ккал закрыта");
  });

  it("белок набран — только ккал", () => {
    const hint = remainingHint(
      { calories: 1500, protein: 100 },
      TARGETS,
      { calories: 200, protein: 20 },
    );
    expect(hint).toContain("осталось 300 ккал");
    expect(hint).not.toContain("белка");
  });
});
