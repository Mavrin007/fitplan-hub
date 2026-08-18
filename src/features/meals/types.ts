/**
 * Общие типы фичи «Питание» (страница /dashboard/meals).
 *
 * Вынесены из src/pages/Meals.tsx при рефакторинге в features/meals:
 * страница остаётся тонкой, а типы переиспользуются хуками, компонентами
 * и lib-модулями фичи.
 */

import type { Doc } from "@/convex/_generated/dataModel";
import type { MealType } from "@/lib/mealLibrary";

/** Запись дневника питания (таблица mealLog). */
export type MealEntry = Doc<"mealLog">;

/** Свой продукт пользователя (таблица foods). */
export type CustomFood = Doc<"foods">;

/** Порядок приёмов пищи на странице. */
export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/** Макросы с калориями в поле calories (как в БД/итогах дня). */
export interface CalMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Макросы с калориями в поле kcal (как в превью порции). */
export interface KcalMacros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Элемент «Недавнее»: продукт из дневника с метаданными приёма. */
export interface RecentFoodItem extends CalMacros {
  name: string;
  mealType: MealType;
  quantity: number;
}

/** Продукт, у которого есть макросы и порция (библиотека / OFF / своё). */
export interface MacroFood {
  servingGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Штучные продукты (−/+ целыми штуками); отсутствует у внешнего каталога. */
  unit?: string;
}

/** Состояние формы «свой продукт». */
export interface NewFoodForm {
  name: string;
  amount: string;
  unit: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}
