/**
 * Чистая математика порций страницы «Питание»: перевод количества в граммы,
 * пересчёт КБЖУ под порцию, шаги −/+ и превью «что добавится». Вынесены из
 * Meals.tsx, покрыты тестами.
 */

import type { MacroFood, KcalMacros } from "../types";

/** Калории одной порции (servingGrams) из макросов на 100 г. */
export function kcalPerServing(calories: number, servingGrams: number): number {
  return Math.round((calories * servingGrams) / 100);
}

/**
 * Граммы для выбранного количества: внешний продукт (каталог OFF) — количество
 * в граммах напрямую; библиотека — количество порций × размер порции.
 */
export function gramsFromQuantity(
  food: MacroFood,
  quantity: number,
  isExternal: boolean,
): number {
  return isExternal ? quantity : quantity * food.servingGrams;
}

/** КБЖУ под заданные граммы (макросы заданы на 100 г). */
export function macrosForGrams(
  food: MacroFood,
  grams: number,
): KcalMacros {
  const ratio = grams / 100;
  return {
    kcal: Math.round(food.calories * ratio),
    protein: Math.round(food.protein * ratio * 10) / 10,
    carbs: Math.round(food.carbs * ratio * 10) / 10,
    fat: Math.round(food.fat * ratio * 10) / 10,
  };
}

/** Округление количества до десятой (0.5 — минимальный шаг). */
export function roundPortion(quantity: number): number {
  return Math.max(0.5, Math.round(quantity * 10) / 10);
}

/** Следующее количество при шаге −/+. */
export function stepQuantity(
  current: number,
  step: number,
  dir: 1 | -1,
): number {
  return roundPortion(current + dir * step);
}

/**
 * Шаг −/+ для продукта: штучные (не граммовые) — целыми штуками, граммовые —
 * по 0.5 порции, внешний каталог (граммы) — по 100 г.
 */
export function quantityStepFor(
  food: MacroFood | null | undefined,
  isExternal: boolean,
): number {
  if (isExternal) return 100;
  if (food && food.unit !== "г") return 1;
  return 0.5;
}

/**
 * Превью «что добавится при текущем количестве»: макросы выбранного продукта.
 * null — нечего показать (нет выбора или количество невалидно).
 */
export function selectedPreview(
  food: MacroFood | null | undefined,
  quantity: number,
  isExternal: boolean,
): KcalMacros | null {
  if (quantity <= 0 || !food) return null;
  return macrosForGrams(food, gramsFromQuantity(food, quantity, isExternal));
}
