/**
 * Чистые расчёты страницы «Питание»: группировка записей по приёмам,
 * итоги дня, агрегаты для чипов белка. Вынесены из Meals.tsx, покрыты
 * тестами.
 */

import type { MealType } from "@/lib/mealLibrary";
import type { MacroFood } from "../types";

/** Группирует записи дневника по приёму пищи (порядок MEAL_TYPES). */
export function groupByMeal<T extends { mealType: MealType }>(
  entries: T[],
): Record<MealType, T[]> {
  const map: Record<MealType, T[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const e of entries) map[e.mealType] = [...map[e.mealType], e];
  return map;
}

/** Итоги дня: сумма КБЖУ по записям. */
export function totalsFromEntries(
  entries: { calories: number; protein: number; carbs: number; fat: number }[],
): { calories: number; protein: number; carbs: number; fat: number } {
  return {
    calories: entries.reduce((s, e) => s + e.calories, 0),
    protein: entries.reduce((s, e) => s + e.protein, 0),
    carbs: entries.reduce((s, e) => s + e.carbs, 0),
    fat: entries.reduce((s, e) => s + e.fat, 0),
  };
}

/** Белок быстрого «добора»: макрос на 100 г → на qty порций (servingGrams). */
export function proteinBoostAmount(food: MacroFood, qty: number): number {
  return Math.round(food.protein * qty * (food.servingGrams / 100));
}

/** Проценты прогресса к цели (ккал/вода), ограниченные 100. */
export function progressPercent(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}
