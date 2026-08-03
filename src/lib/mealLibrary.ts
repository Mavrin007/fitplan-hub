/** Встроенная база продуктов + генератор дневного плана питания.
 *  Все макросы указаны на 100 г (для штучных продуктов — на 100 г, а
 *  `servingGrams` — типичный вес одной порции/штуки). Генератор собирает
 *  завтрак / обед / ужин / перекус так, чтобы попасть в цели по калориям
 *  и макросам, используя сначала свои продукты пользователя. */

import type { Targets } from "./nutrition";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface FoodItem {
  name: string;
  /** Калории на 100 г. */
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Как показывать количество: "г" или штучная единица ("шт", "ломтик"). */
  unit: string;
  /** Типичный вес одной порции/штуки в граммах. */
  servingGrams: number;
  category: "protein" | "carb" | "veg" | "fat" | "fruit" | "dairy" | "snack";
}

export interface PlannedFood {
  food: FoodItem;
  /** Количество в граммах для плана. */
  amountGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface PlannedMeal {
  mealType: MealType;
  foods: PlannedFood[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface GeneratedPlan {
  meals: PlannedMeal[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Красиво форматирует количество: "240 г" или "2 шт" для штучных продуктов. */
export function formatAmount(food: FoodItem, grams: number): string {
  const safe = Math.max(0, grams);
  if (food.unit === "г") return `${Math.round(safe)} г`;
  const pieces = safe / food.servingGrams;
  const rounded = Math.round(pieces * 10) / 10;
  return `${rounded.toLocaleString("ru-RU")} ${food.unit}`;
}

/** Простой детерминированный генератор случайных чисел, чтобы «план на
 *  сегодня» оставался стабильным в течение дня. */
function seeded(seedStr: string) {
  let h = 1779033703;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export const FOOD_LIBRARY: FoodItem[] = [
  // Белок
  { name: "Куриная грудка (гриль)", calories: 165, protein: 31, carbs: 0, fat: 3.6, unit: "г", servingGrams: 150, category: "protein" },
  { name: "Постная говядина (вырезка)", calories: 217, protein: 26, carbs: 0, fat: 12, unit: "г", servingGrams: 140, category: "protein" },
  { name: "Лосось (запечённый)", calories: 208, protein: 20, carbs: 0, fat: 13, unit: "г", servingGrams: 140, category: "protein" },
  { name: "Тунец (консервы в воде)", calories: 116, protein: 26, carbs: 0, fat: 1, unit: "г", servingGrams: 120, category: "protein" },
  { name: "Яйца", calories: 155, protein: 13, carbs: 1.1, fat: 11, unit: "шт", servingGrams: 50, category: "protein" },
  { name: "Яичные белки", calories: 52, protein: 11, carbs: 0.7, fat: 0.2, unit: "г", servingGrams: 120, category: "protein" },
  { name: "Греческий йогурт (0%)", calories: 59, protein: 10, carbs: 3.6, fat: 0.4, unit: "г", servingGrams: 200, category: "dairy" },
  { name: "Творог (нежирный)", calories: 98, protein: 11, carbs: 3.4, fat: 4.3, unit: "г", servingGrams: 150, category: "dairy" },
  { name: "Тофу (плотный)", calories: 144, protein: 17, carbs: 3, fat: 9, unit: "г", servingGrams: 150, category: "protein" },
  { name: "Креветки", calories: 99, protein: 24, carbs: 0.2, fat: 0.3, unit: "г", servingGrams: 130, category: "protein" },
  { name: "Индейка (грудка, ветчина)", calories: 120, protein: 24, carbs: 1, fat: 2, unit: "г", servingGrams: 120, category: "protein" },
  { name: "Сывороточный протеин", calories: 400, protein: 80, carbs: 8, fat: 6, unit: "г", servingGrams: 30, category: "protein" },

  // Углеводы
  { name: "Белый рис (варёный)", calories: 130, protein: 2.7, carbs: 28, fat: 0.3, unit: "г", servingGrams: 180, category: "carb" },
  { name: "Бурый рис (варёный)", calories: 112, protein: 2.6, carbs: 24, fat: 0.9, unit: "г", servingGrams: 180, category: "carb" },
  { name: "Киноа (варёная)", calories: 120, protein: 4.4, carbs: 21, fat: 1.9, unit: "г", servingGrams: 180, category: "carb" },
  { name: "Овсянка (сухая)", calories: 389, protein: 17, carbs: 66, fat: 7, unit: "г", servingGrams: 50, category: "carb" },
  { name: "Батат (запечённый)", calories: 90, protein: 2, carbs: 21, fat: 0.2, unit: "г", servingGrams: 200, category: "carb" },
  { name: "Цельнозерновой хлеб", calories: 247, protein: 13, carbs: 41, fat: 3.4, unit: "ломтик", servingGrams: 40, category: "carb" },
  { name: "Паста (варёная)", calories: 158, protein: 5.8, carbs: 31, fat: 0.9, unit: "г", servingGrams: 180, category: "carb" },
  { name: "Картофель (отварной)", calories: 87, protein: 1.9, carbs: 20, fat: 0.1, unit: "г", servingGrams: 200, category: "carb" },
  { name: "Банан", calories: 89, protein: 1.1, carbs: 23, fat: 0.3, unit: "шт", servingGrams: 120, category: "fruit" },
  { name: "Яблоко", calories: 52, protein: 0.3, carbs: 14, fat: 0.2, unit: "шт", servingGrams: 180, category: "fruit" },
  { name: "Черника", calories: 57, protein: 0.7, carbs: 14, fat: 0.3, unit: "г", servingGrams: 100, category: "fruit" },

  // Овощи
  { name: "Брокколи (на пару)", calories: 35, protein: 2.4, carbs: 7, fat: 0.4, unit: "г", servingGrams: 150, category: "veg" },
  { name: "Шпинат", calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, unit: "г", servingGrams: 100, category: "veg" },
  { name: "Салатный микс", calories: 17, protein: 1.4, carbs: 3.3, fat: 0.2, unit: "г", servingGrams: 100, category: "veg" },
  { name: "Болгарский перец", calories: 31, protein: 1, carbs: 6, fat: 0.3, unit: "г", servingGrams: 120, category: "veg" },
  { name: "Помидор", calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, unit: "шт", servingGrams: 120, category: "veg" },
  { name: "Морковь", calories: 41, protein: 0.9, carbs: 10, fat: 0.2, unit: "г", servingGrams: 100, category: "veg" },
  { name: "Кабачок", calories: 17, protein: 1.2, carbs: 3.1, fat: 0.3, unit: "г", servingGrams: 150, category: "veg" },

  // Жиры
  { name: "Оливковое масло", calories: 884, protein: 0, carbs: 0, fat: 100, unit: "г", servingGrams: 10, category: "fat" },
  { name: "Миндаль", calories: 579, protein: 21, carbs: 22, fat: 50, unit: "г", servingGrams: 25, category: "fat" },
  { name: "Арахисовая паста", calories: 588, protein: 25, carbs: 20, fat: 50, unit: "г", servingGrams: 20, category: "fat" },
  { name: "Авокадо", calories: 160, protein: 2, carbs: 9, fat: 15, unit: "шт", servingGrams: 100, category: "fat" },
  { name: "Семена чиа", calories: 486, protein: 17, carbs: 42, fat: 31, unit: "г", servingGrams: 15, category: "fat" },
  { name: "Грецкие орехи", calories: 654, protein: 15, carbs: 14, fat: 65, unit: "г", servingGrams: 25, category: "fat" },

  // Перекусы
  { name: "Протеиновый батончик", calories: 350, protein: 25, carbs: 40, fat: 10, unit: "шт", servingGrams: 60, category: "snack" },
  { name: "Рисовые хлебцы", calories: 387, protein: 8, carbs: 81, fat: 3, unit: "шт", servingGrams: 10, category: "snack" },
  { name: "Тёмный шоколад (85%)", calories: 598, protein: 8, carbs: 46, fat: 43, unit: "г", servingGrams: 20, category: "snack" },
  { name: "Творог с ананасом", calories: 90, protein: 9, carbs: 11, fat: 1.5, unit: "г", servingGrams: 150, category: "snack" },
];

export interface CustomFoodLike {
  name: string;
  amount: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Преобразует свой продукт пользователя (макросы на `amount` единиц) в
 *  FoodItem с макросами на 100 г. */
export function customToFoodItem(f: CustomFoodLike): FoodItem {
  const ratio = 100 / Math.max(1, f.amount);
  return {
    name: f.name,
    calories: f.calories * ratio,
    protein: f.protein * ratio,
    carbs: f.carbs * ratio,
    fat: f.fat * ratio,
    unit: f.unit === "г" ? "г" : f.unit,
    servingGrams: f.amount,
    category: "protein",
  };
}

const MEAL_SPLITS: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.3,
  snack: 0.1,
};

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

const MEAL_STRUCTURE: Record<MealType, FoodItem["category"][]> = {
  breakfast: ["protein", "carb", "fruit"],
  lunch: ["protein", "carb", "veg"],
  dinner: ["protein", "veg", "carb"],
  snack: ["protein", "snack"],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Макросы для `grams` граммов продукта (все макросы — на 100 г). */
function scale(food: FoodItem, grams: number): PlannedFood {
  const ratio = grams / 100;
  return {
    food,
    amountGrams: Math.round(grams),
    calories: Math.round(food.calories * ratio),
    protein: Math.round(food.protein * ratio * 10) / 10,
    carbs: Math.round(food.carbs * ratio * 10) / 10,
    fat: Math.round(food.fat * ratio * 10) / 10,
  };
}

/** Собирает один приём пищи так, чтобы итог попал в `targetCal` ккал:
 *  выбирает по одному продукту на категорию, пропорционально масштабирует,
 *  затем корректирует граммы до схождения (погрешность < 2%). */
function buildMeal(
  mealType: MealType,
  targetCal: number,
  pool: FoodItem[],
  rand: () => number,
  usedNames: Set<string>,
): PlannedMeal {
  const slots = MEAL_STRUCTURE[mealType];
  const chosen: FoodItem[] = [];

  for (const category of slots) {
    const candidates = pool.filter(
      (f) => f.category === category && !usedNames.has(f.name),
    );
    if (candidates.length === 0) continue;
    const food = candidates[Math.floor(rand() * candidates.length)];
    usedNames.add(food.name);
    chosen.push(food);
  }

  if (chosen.length === 0) {
    return {
      mealType,
      foods: [],
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    };
  }

  // Стартовая порция — по одному `servingGrams` на продукт.
  let grams = chosen.map((f) => f.servingGrams);
  const baseCal = grams.reduce(
    (sum, g, i) => sum + (chosen[i].calories * g) / 100,
    0,
  );

  // Пропорциональное масштабирование, чтобы попасть в цель.
  const ratio = clamp(targetCal / Math.max(1, baseCal), 0.4, 3);
  grams = grams.map((g) => clamp(g * ratio, 10, 900));

  // Корректировка: шагами по 5 г подводим итог к цели.
  for (let iter = 0; iter < 60; iter++) {
    const total = grams.reduce(
      (sum, g, i) => sum + (chosen[i].calories * g) / 100,
      0,
    );
    const diff = targetCal - total;
    if (Math.abs(diff) < Math.max(15, targetCal * 0.02)) break;

    // Прибавляем к самому калорийному, убавляем у наименее калорийного.
    const densities = chosen.map((f) => f.calories / 100);
    let idx = 0;
    if (diff > 0) {
      let best = -1;
      for (let i = 0; i < chosen.length; i++) {
        if (grams[i] < 900 && densities[i] > best) {
          best = densities[i];
          idx = i;
        }
      }
    } else {
      let worst = Infinity;
      for (let i = 0; i < chosen.length; i++) {
        if (grams[i] > 15 && densities[i] < worst) {
          worst = densities[i];
          idx = i;
        }
      }
    }
    grams[idx] = clamp(grams[idx] + (diff > 0 ? 5 : -5), 10, 900);
  }

  const foods = chosen.map((f, i) => scale(f, grams[i]));
  return {
    mealType,
    foods,
    calories: foods.reduce((s, f) => s + f.calories, 0),
    protein: Math.round(foods.reduce((s, f) => s + f.protein, 0) * 10) / 10,
    carbs: Math.round(foods.reduce((s, f) => s + f.carbs, 0) * 10) / 10,
    fat: Math.round(foods.reduce((s, f) => s + f.fat, 0) * 10) / 10,
  };
}

/** Генерирует детерминированный дневной план питания для ключа даты + целей,
 *  при необходимости включая свои продукты пользователя в пул. */
export function generateMealPlan(
  dateKey: string,
  targets: Targets,
  customFoods: CustomFoodLike[] = [],
): GeneratedPlan {
  const rand = seeded(`meal-${dateKey}`);
  const pool = [...FOOD_LIBRARY, ...customFoods.map(customToFoodItem)];
  const usedNames = new Set<string>();

  const meals = MEAL_ORDER.map((mealType) =>
    buildMeal(
      mealType,
      targets.calories * MEAL_SPLITS[mealType],
      pool,
      rand,
      usedNames,
    ),
  );

  return {
    meals,
    calories: meals.reduce((s, m) => s + m.calories, 0),
    protein: Math.round(meals.reduce((s, m) => s + m.protein, 0) * 10) / 10,
    carbs: Math.round(meals.reduce((s, m) => s + m.carbs, 0) * 10) / 10,
    fat: Math.round(meals.reduce((s, m) => s + m.fat, 0) * 10) / 10,
  };
}

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};
