/**
 * Чистые утилиты страницы «Питание»: константы оформления, форматирование,
 * шаги порций. Вынесены из Meals.tsx, чтобы страница оставалась тонкой и
 * утилиты покрывались тестами без рендера.
 */

import {
  Apple,
  Coffee,
  Moon,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { FOOD_LIBRARY, type FoodItem } from "@/lib/mealLibrary";
import type { MealType } from "@/lib/mealLibrary";

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/** Placeholder-иллюстрация приёма (M3: градиент + иконка в стиле «еды»). */
export const MEAL_ART: Record<MealType, { icon: LucideIcon; label: string }> = {
  breakfast: { icon: Coffee, label: "Завтрак" },
  lunch: { icon: UtensilsCrossed, label: "Обед" },
  dinner: { icon: Moon, label: "Ужин" },
  snack: { icon: Apple, label: "Перекус" },
};

/** Калории одной порции (servingGrams) из макросов на 100 г. */
export function kcalPerServing(calories: number, servingGrams: number): number {
  return Math.round((calories * servingGrams) / 100);
}

/** Быстрые «доборы» белка: привычные продукты с готовой порцией. */
export const PROTEIN_BOOSTS: { name: string; qty: number }[] = [
  { name: "Творог (нежирный)", qty: 1 },
  { name: "Куриная грудка (гриль)", qty: 1 },
  { name: "Яйца", qty: 2 },
  { name: "Греческий йогурт (0%)", qty: 1 },
  { name: "Сывороточный протеин", qty: 1 },
];

/** Форматирует примерную цену блюда/дня в BYN: «≈ 5,40 byn». */
export function formatPrice(byn: number): string {
  return `≈ ${byn.toFixed(2).replace(".", ",")} byn`;
}

/** Допустимые в числовом поле символы: цифры, запятая, точка. */
export const DECIMAL_INPUT = (v: string) => v.replace(/[^\d.,]/g, "");

/** Тон «соответствия цели»: зелёный в пределах 10%, янтарный до 20%, иначе красный. */
export function fitTone(drift: number): string {
  if (drift <= 0.1) return "text-emerald-600 dark:text-emerald-400";
  if (drift <= 0.2) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

/** Шаг порции для −/+: штучные продукты — целыми штуками, граммовые — по 0.5
 *  порции, внешний каталог (граммы) — по 100 г. */
export function quantityStep(
  selectedName: string,
  offSelected: boolean,
): number {
  if (offSelected) return 100;
  const qtyFood = FOOD_LIBRARY.find((f) => f.name === selectedName);
  if (qtyFood && qtyFood.unit !== "г") return 1;
  return 0.5;
}

/** Шаг −/+ быстрой правки порции записи: штучные продукты — целыми штуками,
 *  остальные — полпорции (как в диалоге добавления). */
export function quickQtyStep(name: string): number {
  const food = FOOD_LIBRARY.find((f) => f.name === name);
  if (food && food.unit !== "г") return 1;
  return 0.5;
}

/** Макросы для `qty` порций продукта. У OFF-продуктов servingGrams = 100
 *  (порция = 100 г), поэтому формула единая для библиотеки и каталога. */
export function macrosForQuantity(
  food: Pick<FoodItem, "calories" | "protein" | "carbs" | "fat" | "servingGrams">,
  qty: number,
): { kcal: number; protein: number; carbs: number; fat: number } {
  const ratio = (qty * food.servingGrams) / 100;
  return {
    kcal: Math.round(food.calories * ratio),
    protein: Math.round(food.protein * ratio * 10) / 10,
    carbs: Math.round(food.carbs * ratio * 10) / 10,
    fat: Math.round(food.fat * ratio * 10) / 10,
  };
}

/** Понятная подпись «сколько это еды» для поля порции в диалоге. */
export function portionLabel(
  food: Pick<FoodItem, "servingGrams" | "unit"> | undefined,
  qty: number,
): string {
  if (!food || qty <= 0) return "Порций";
  const grams = qty * food.servingGrams;
  if (food.unit === "г") return `Порций (≈ ${Math.round(grams)} г)`;
  const pieces = Math.round((grams / food.servingGrams) * 2) / 2;
  return `Порций (≈ ${pieces} ${food.unit})`;
}

/** Новый idempotency-ключ (общая реализация в @/lib/idempotencyKey). */
export { newIdempotencyKey } from "@/lib/idempotencyKey";
