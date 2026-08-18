/**
 * Серверное разрешение продуктов и расчёт КБЖУ для команд ассистента.
 *
 * Единый источник правды по питательной ценности: ИИ НЕ передаёт калории/
 * белки/жиры/углеводы (см. commands.ts — поля запрещены валидатором).
 * Здесь приложение само вычисляет КБЖУ:
 *
 *   1. verified      — точное совпадение в кураторской библиотеке (на 100 г)
 *                      или в своих продуктах пользователя (на `amount` `unit`);
 *   2. verified      — частичное совпадение (подстрока) в библиотеке;
 *   3. ai_estimate   — явная детерминированная логика оценки (алиасы + ключевые
 *                      слова) с пометкой, что это НЕ точное измерение.
 *
 * Любой результат несёт `source` — UI показывает оценку отдельно.
 * Все функции чистые и покрываются юнит-тестами.
 */

import { FOOD_LIBRARY, type FoodItem } from "../../lib/mealData";

export type NutritionSource =
  | "verified"
  | "open_food_facts"
  | "internal"
  | "ai_estimate";

export interface MacroValues {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ResolvedNutrition extends MacroValues {
  /** Каноническое имя продукта (из источника). */
  name: string;
  /** Откуда взяты КБЖУ. */
  source: NutritionSource;
  /** Идентификатор источника: barcode / foodId / внутренний ключ. */
  sourceId?: string;
  /** True, если источник — оценка, а не измерение. */
  isEstimate: boolean;
}

export interface CustomFoodLike {
  name: string;
  amount: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  _id?: string;
}

/** Быстрый доступ к кураторской библиотеке по имени. */
const FOOD_BY_NAME = new Map<string, FoodItem>(
  FOOD_LIBRARY.map((f) => [f.name, f]),
);

/** Детерминированные оценки частых блюд, которых нет в библиотеке
 *  (на 100 г). Значения — типичные для состава блюда, не измерение. */
const ESTIMATE_ALIASES: Record<string, MacroValues> = {
  шашлык: { calories: 250, protein: 25, carbs: 2, fat: 17 },
  стейк: { calories: 220, protein: 27, carbs: 0, fat: 12 },
  котлета: { calories: 240, protein: 18, carbs: 8, fat: 16 },
  борщ: { calories: 55, protein: 3, carbs: 7, fat: 2 },
  суп: { calories: 45, protein: 3, carbs: 6, fat: 1.5 },
  салат: { calories: 90, protein: 3, carbs: 6, fat: 6 },
  "овощное рагу": { calories: 60, protein: 2, carbs: 9, fat: 2 },
  плов: { calories: 180, protein: 8, carbs: 22, fat: 7 },
  пицца: { calories: 260, protein: 11, carbs: 30, fat: 11 },
  бургер: { calories: 260, protein: 13, carbs: 26, fat: 12 },
  пельмени: { calories: 230, protein: 12, carbs: 26, fat: 9 },
  блины: { calories: 200, protein: 6, carbs: 26, fat: 8 },
  сырники: { calories: 220, protein: 13, carbs: 18, fat: 11 },
  запеканка: { calories: 150, protein: 10, carbs: 14, fat: 6 },
  каша: { calories: 110, protein: 3.5, carbs: 19, fat: 2 },
  лапша: { calories: 140, protein: 4.5, carbs: 25, fat: 2.5 },
  "картофельное пюре": { calories: 90, protein: 2, carbs: 16, fat: 2 },
};

/** Ключевые слова → типичные КБЖУ на 100 г (детерминированный fallback). */
const KEYWORD_ESTIMATES: Array<{
  pattern: RegExp;
  values: MacroValues;
}> = [
  { pattern: /курин|куриц|индейк|индюш/, values: { calories: 160, protein: 25, carbs: 1, fat: 6 } },
  { pattern: /говядин|свинин|баранин/, values: { calories: 220, protein: 22, carbs: 0, fat: 14 } },
  { pattern: /рыб|тунец|лосос|треск|креветк|минтай/, values: { calories: 150, protein: 22, carbs: 0, fat: 7 } },
  { pattern: /яйц/, values: { calories: 155, protein: 13, carbs: 1, fat: 11 } },
  { pattern: /рис|гречк|овсян|пшен|киноа|кускус|булгур/, values: { calories: 130, protein: 4, carbs: 26, fat: 1.2 } },
  { pattern: /макарон|паст|спагетт|лапш/, values: { calories: 160, protein: 6, carbs: 31, fat: 1.2 } },
  { pattern: /хлеб|тост|булк|батон|лаваш/, values: { calories: 250, protein: 9, carbs: 48, fat: 3 } },
  { pattern: /картоф|батат/, values: { calories: 90, protein: 2, carbs: 20, fat: 0.2 } },
  { pattern: /творог|йогурт|кефир|молок|сметан|ряженк/, values: { calories: 80, protein: 6, carbs: 5, fat: 4 } },
  { pattern: /сыр/, values: { calories: 320, protein: 22, carbs: 2, fat: 25 } },
  { pattern: /фрукт|яблок|банан|апельсин|груш|персик|виноград|клубник/, values: { calories: 55, protein: 0.7, carbs: 13, fat: 0.3 } },
  { pattern: /овощ|помидор|огурец|перец|капуст|морков|брокколи|шпинат|салат/, values: { calories: 35, protein: 2, carbs: 6, fat: 0.4 } },
  { pattern: /орех|миндал|фундук|кешью/, values: { calories: 600, protein: 18, carbs: 15, fat: 55 } },
  { pattern: /шоколад|конфет|печень|вафл/, values: { calories: 500, protein: 6, carbs: 60, fat: 27 } },
  { pattern: /чипс/, values: { calories: 520, protein: 6, carbs: 50, fat: 32 } },
  { pattern: /сок|компот|лимонад|кола|фанта/, values: { calories: 45, protein: 0.2, carbs: 11, fat: 0 } },
  { pattern: /пиво|вино|водк|коньяк/, values: { calories: 45, protein: 0.3, carbs: 4, fat: 0 } },
  { pattern: /протеин/, values: { calories: 380, protein: 75, carbs: 10, fat: 6 } },
];

/** Оценка КБЖУ (на 100 г) по названию — детерминированная, без LLM. */
export function estimatePer100g(name: string): MacroValues {
  const lower = name.trim().toLowerCase();
  // 1. Алиасы целых блюд.
  for (const [alias, values] of Object.entries(ESTIMATE_ALIASES)) {
    if (lower === alias || lower.includes(alias)) return values;
  }
  // 2. Ключевые слова.
  for (const { pattern, values } of KEYWORD_ESTIMATES) {
    if (pattern.test(lower)) return values;
  }
  // 3. Generic-дефолт: смешанное блюдо.
  return { calories: 150, protein: 8, carbs: 12, fat: 7 };
}

/** КБЖУ на 100 г из своего продукта пользователя (amount/unit → 100 г). */
function per100FromCustom(food: CustomFoodLike): MacroValues {
  const ratio = food.amount > 0 ? 100 / food.amount : 0;
  return {
    calories: Math.round(food.calories * ratio),
    protein: Math.round(food.protein * ratio * 10) / 10,
    carbs: Math.round(food.carbs * ratio * 10) / 10,
    fat: Math.round(food.fat * ratio * 10) / 10,
  };
}

/** Точное совпадение в кураторской библиотеке. */
function exactLibraryMatch(name: string): FoodItem | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const exact = FOOD_BY_NAME.get(name.trim());
  if (exact) return exact;
  for (const f of FOOD_LIBRARY) {
    if (f.name.toLowerCase() === key) return f;
  }
  return null;
}

/** Частичное совпадение (подстрока) в кураторской библиотеке.
 *
 * Сначала ищем совпадение целого слова («рис» → «Белый рис (варёный)», а не
 * «Рисовые хлебцы»), затем — подстроку с предпочтением самого короткого
 * названия (самое специфичное). */
function fuzzyLibraryMatch(name: string): FoodItem | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordRe = new RegExp(`(^|[^а-яa-z0-9])${esc}($|[^а-яa-z0-9])`);
  let bestWord: FoodItem | null = null;
  let bestSub: FoodItem | null = null;
  for (const f of FOOD_LIBRARY) {
    const fName = f.name.toLowerCase();
    if (wordRe.test(fName)) {
      if (!bestWord || f.name.length < bestWord.name.length) bestWord = f;
    } else if (fName.includes(key) || key.includes(fName)) {
      if (!bestSub || f.name.length < bestSub.name.length) bestSub = f;
    }
  }
  return bestWord ?? bestSub;
}

/**
 * Разрешает продукт: библиотека → свои продукты → null.
 * Возвращает verified-источник или null (тогда вызывающий решает, оценивать
 * ли через estimateNutrition).
 */
export function resolveFood(
  name: string,
  customFoods: CustomFoodLike[],
): ResolvedNutrition | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const lib = exactLibraryMatch(trimmed) ?? fuzzyLibraryMatch(trimmed);
  if (lib) {
    return {
      name: lib.name,
      source: "verified",
      isEstimate: false,
      sourceId: `library:${lib.name}`,
      calories: lib.calories,
      protein: lib.protein,
      carbs: lib.carbs,
      fat: lib.fat,
    };
  }

  const customKey = trimmed.toLowerCase();
  const custom = customFoods.find(
    (f) => f.name.trim().toLowerCase() === customKey,
  );
  if (custom) {
    const per100 = per100FromCustom(custom);
    return {
      name: custom.name,
      source: "verified",
      isEstimate: false,
      sourceId: custom._id,
      ...per100,
    };
  }

  return null;
}

/** Явная логика оценки продукта, которого нет в проверенных источниках. */
export function estimateNutrition(name: string): ResolvedNutrition {
  const values = estimatePer100g(name);
  return {
    name: name.trim(),
    source: "ai_estimate",
    isEstimate: true,
    ...values,
  };
}

/** Единая точка входа: resolveFood → estimateNutrition (всегда что-то вернёт). */
export function resolveOrEstimate(
  name: string,
  customFoods: CustomFoodLike[],
): ResolvedNutrition {
  return resolveFood(name, customFoods) ?? estimateNutrition(name);
}

/** Масштабирует КБЖУ на указанное количество.
 *
 *  - unit "г"/"g": quantity — граммы (100 г = база);
 *  - unit "шт"/"piece": quantity — штуки, вес штуки берётся из servingGrams
 *    (для штучных продуктов библиотеки);
 *  - unit "serving": quantity — порции по servingGrams;
 *  - без unit: для штучных продуктов библиотеки — штуки, иначе граммы.
 */
export function scalePortion(
  nutrition: ResolvedNutrition,
  quantity: number,
  unit: QuantityUnitLike | undefined,
  servingGrams = 100,
): MacroValues {
  let grams: number;
  switch (unit) {
    case "г":
    case "g":
      grams = quantity;
      break;
    case "шт":
    case "piece":
      grams = quantity * servingGrams;
      break;
    case "serving":
      grams = quantity * servingGrams;
      break;
    default: {
      // Без явной единицы: штучные продукты библиотеки считаем штуками.
      const lib = exactLibraryMatch(nutrition.name);
      if (lib && lib.unit !== "г") {
        grams = quantity * lib.servingGrams;
      } else {
        grams = quantity;
      }
    }
  }
  const safeGrams = Math.max(0, grams);
  const ratio = safeGrams / 100;
  return {
    calories: Math.max(0, Math.round(nutrition.calories * ratio)),
    protein: Math.max(0, Math.round(nutrition.protein * ratio * 10) / 10),
    carbs: Math.max(0, Math.round(nutrition.carbs * ratio * 10) / 10),
    fat: Math.max(0, Math.round(nutrition.fat * ratio * 10) / 10),
  };
}

type QuantityUnitLike =
  | "г"
  | "g"
  | "шт"
  | "serving"
  | "piece"
  | undefined;

/** Форматирует количество для лога: граммы для г-продуктов, штуки — иначе. */
export function quantityToStore(
  nutrition: ResolvedNutrition,
  quantity: number,
  unit: QuantityUnitLike | undefined,
): number {
  const lib = exactLibraryMatch(nutrition.name);
  if (unit === "г" || unit === "g" || (!unit && (!lib || lib.unit === "г"))) {
    return Math.round(quantity * 10) / 10;
  }
  // Штуки/порции — храним количество штук.
  return Math.max(1, Math.round(quantity * 10) / 10);
}
