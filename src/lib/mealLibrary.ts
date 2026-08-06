/** Встроенная база продуктов + генератор планов питания.
 *
 *  В отличие от старой версии (случайный подбор по категориям с пропорциональным
 *  масштабированием, из-за чего появлялись абсурдные сочетания вроде «креветки
 *  с картофелем на завтрак» и дробные порции вроде 0.75 батончика), новый
 *  генератор собирает меню из кураторских шаблонов блюд с реалистичными,
 *  человеческими порциями:
 *
 *  - каждое блюдо — это реально существующая комбинация (овсянка с бананом,
 *    яичница с тостами, курица с гречкой и салатом и т.д.);
 *  - штучные продукты (яйца, банан, хлеб) всегда целые: ни «0.75 батончика»,
 *    ни «2.4 яйца»;
 *  - порции адаптируются под цель: при похудении ужимаются углеводы и жиры,
 *    при наборе массы — растут углеводы и белок;
 *  - меню разнообразно: в неделе 7 завтраков, 7 обедов, 7 ужинов и 7-9
 *    перекусов без повторов в течение недели;
 *  - расхождение с целью по калориям закрывается «стапелем» — порцией крупы
 *    или гарнира, которую реально можно добавить/убавить (шаг 25 г).
 */

import type { FitnessGoal, Targets } from "./nutrition";
import { addDays, toDateKey } from "./dates";

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
  /** Примерная розничная цена в BYN за стандартную порцию (servingGrams).
   *  Используется для «бюджетно-очевидного» меню: цена блюда считается как
   *  сумма цен ингредиентов пропорционально их количеству. */
  priceByn: number;
}

export interface PlannedFood {
  food: FoodItem;
  /** Количество в граммах для плана. */
  amountGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Стоимость этого количества в BYN. */
  priceByn: number;
}

export interface PlannedMeal {
  mealType: MealType;
  /** Название блюда из шаблона (например «Овсянка с бананом и пастой»). */
  name: string;
  foods: PlannedFood[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Примерная стоимость порции в BYN (сумма цен ингредиентов). */
  priceByn: number;
}

export interface GeneratedPlan {
  meals: PlannedMeal[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Один день недельного меню. */
export interface WeeklyDay {
  /** Дата дня (YYYY-MM-DD, начиная с сегодняшнего). */
  dateKey: string;
  /** День недели 0 = понедельник … 6 = воскресенье. */
  weekday: number;
  meals: PlannedMeal[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface WeeklyMealPlan {
  goal: FitnessGoal;
  days: WeeklyDay[];
}

/** Красиво форматирует количество: "240 г" или "2 шт" для штучных продуктов.
 *  Штучные порции округляются до 0.5, чтобы в интерфейсе не появлялись
 *  дробные «0.75 батончика». */
export function formatAmount(food: FoodItem, grams: number): string {
  const safe = Math.max(0, grams);
  if (food.unit === "г") return `${Math.round(safe)} г`;
  const pieces = safe / food.servingGrams;
  const rounded = Math.round(pieces * 2) / 2;
  return `${rounded.toLocaleString("ru-RU")} ${food.unit}`;
}

/** Простой детерминированный генератор случайных чисел — меню остаётся
 *  стабильным в течение дня и одинаковым для всех пользователей с той же
 *  целью и калорийностью. */
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
  { name: "Куриная грудка (гриль)", calories: 165, protein: 31, carbs: 0, fat: 3.6, unit: "г", servingGrams: 150, category: "protein", priceByn: 1.8 },
  { name: "Постная говядина (вырезка)", calories: 217, protein: 26, carbs: 0, fat: 12, unit: "г", servingGrams: 140, category: "protein", priceByn: 2.5 },
  { name: "Лосось (запечённый)", calories: 208, protein: 20, carbs: 0, fat: 13, unit: "г", servingGrams: 140, category: "protein", priceByn: 4.9 },
  { name: "Тунец (консервы в воде)", calories: 116, protein: 26, carbs: 0, fat: 1, unit: "г", servingGrams: 120, category: "protein", priceByn: 4.2 },
  { name: "Треска (запечённая)", calories: 90, protein: 19, carbs: 0, fat: 0.7, unit: "г", servingGrams: 150, category: "protein", priceByn: 2.1 },
  { name: "Яйца", calories: 155, protein: 13, carbs: 1.1, fat: 11, unit: "шт", servingGrams: 50, category: "protein", priceByn: 0.4 },
  { name: "Греческий йогурт (0%)", calories: 59, protein: 10, carbs: 3.6, fat: 0.4, unit: "г", servingGrams: 200, category: "dairy", priceByn: 2.4 },
  { name: "Творог (нежирный)", calories: 98, protein: 11, carbs: 3.4, fat: 4.3, unit: "г", servingGrams: 150, category: "dairy", priceByn: 1.4 },
  { name: "Тофу (плотный)", calories: 144, protein: 17, carbs: 3, fat: 9, unit: "г", servingGrams: 150, category: "protein", priceByn: 5.3 },
  { name: "Креветки", calories: 99, protein: 24, carbs: 0.2, fat: 0.3, unit: "г", servingGrams: 130, category: "protein", priceByn: 3.3 },
  { name: "Индейка (грудка, ветчина)", calories: 120, protein: 24, carbs: 1, fat: 2, unit: "г", servingGrams: 120, category: "protein", priceByn: 1.8 },
  { name: "Сывороточный протеин", calories: 400, protein: 80, carbs: 8, fat: 6, unit: "г", servingGrams: 30, category: "protein", priceByn: 1.7 },

  // Углеводы
  { name: "Белый рис (варёный)", calories: 130, protein: 2.7, carbs: 28, fat: 0.3, unit: "г", servingGrams: 180, category: "carb", priceByn: 0.45 },
  { name: "Бурый рис (варёный)", calories: 112, protein: 2.6, carbs: 24, fat: 0.9, unit: "г", servingGrams: 180, category: "carb", priceByn: 0.55 },
  { name: "Гречка (варёная)", calories: 132, protein: 4.5, carbs: 25, fat: 1.2, unit: "г", servingGrams: 180, category: "carb", priceByn: 0.55 },
  { name: "Киноа (варёная)", calories: 120, protein: 4.4, carbs: 21, fat: 1.9, unit: "г", servingGrams: 180, category: "carb", priceByn: 2.2 },
  { name: "Овсянка (сухая)", calories: 389, protein: 17, carbs: 66, fat: 7, unit: "г", servingGrams: 50, category: "carb", priceByn: 0.25 },
  { name: "Батат (запечённый)", calories: 90, protein: 2, carbs: 21, fat: 0.2, unit: "г", servingGrams: 200, category: "carb", priceByn: 0.7 },
  { name: "Цельнозерновой хлеб", calories: 247, protein: 13, carbs: 41, fat: 3.4, unit: "ломтик", servingGrams: 40, category: "carb", priceByn: 0.15 },
  { name: "Паста (варёная)", calories: 158, protein: 5.8, carbs: 31, fat: 0.9, unit: "г", servingGrams: 180, category: "carb", priceByn: 0.55 },
  { name: "Лапша яичная (варёная)", calories: 138, protein: 4.5, carbs: 25, fat: 2, unit: "г", servingGrams: 150, category: "carb", priceByn: 0.5 },
  { name: "Пшено (варёное)", calories: 120, protein: 3.5, carbs: 24, fat: 1, unit: "г", servingGrams: 180, category: "carb", priceByn: 0.4 },
  { name: "Картофель (отварной)", calories: 87, protein: 1.9, carbs: 20, fat: 0.1, unit: "г", servingGrams: 200, category: "carb", priceByn: 0.3 },
  { name: "Мёд", calories: 304, protein: 0.3, carbs: 82, fat: 0, unit: "г", servingGrams: 15, category: "carb", priceByn: 0.23 },
  { name: "Мука пшеничная", calories: 334, protein: 11, carbs: 68, fat: 1.2, unit: "г", servingGrams: 25, category: "carb", priceByn: 0.05 },
  { name: "Банан", calories: 89, protein: 1.1, carbs: 23, fat: 0.3, unit: "шт", servingGrams: 120, category: "fruit", priceByn: 0.3 },
  { name: "Яблоко", calories: 52, protein: 0.3, carbs: 14, fat: 0.2, unit: "шт", servingGrams: 180, category: "fruit", priceByn: 0.25 },
  { name: "Апельсин", calories: 47, protein: 0.9, carbs: 12, fat: 0.1, unit: "шт", servingGrams: 150, category: "fruit", priceByn: 0.4 },
  { name: "Груша", calories: 57, protein: 0.4, carbs: 15, fat: 0.1, unit: "шт", servingGrams: 150, category: "fruit", priceByn: 0.35 },
  { name: "Черника", calories: 57, protein: 0.7, carbs: 14, fat: 0.3, unit: "г", servingGrams: 100, category: "fruit", priceByn: 2.5 },

  // Овощи
  { name: "Брокколи (на пару)", calories: 35, protein: 2.4, carbs: 7, fat: 0.4, unit: "г", servingGrams: 150, category: "veg", priceByn: 1.1 },
  { name: "Шпинат", calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, unit: "г", servingGrams: 100, category: "veg", priceByn: 0.8 },
  { name: "Салатный микс", calories: 17, protein: 1.4, carbs: 3.3, fat: 0.2, unit: "г", servingGrams: 100, category: "veg", priceByn: 0.6 },
  { name: "Болгарский перец", calories: 31, protein: 1, carbs: 6, fat: 0.3, unit: "г", servingGrams: 120, category: "veg", priceByn: 0.7 },
  { name: "Помидор", calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, unit: "шт", servingGrams: 120, category: "veg", priceByn: 0.3 },
  { name: "Огурец", calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1, unit: "шт", servingGrams: 100, category: "veg", priceByn: 0.2 },
  { name: "Капуста белокочанная", calories: 25, protein: 1.3, carbs: 6, fat: 0.1, unit: "г", servingGrams: 100, category: "veg", priceByn: 0.12 },
  { name: "Морковь", calories: 41, protein: 0.9, carbs: 10, fat: 0.2, unit: "г", servingGrams: 100, category: "veg", priceByn: 0.15 },
  { name: "Кабачок", calories: 17, protein: 1.2, carbs: 3.1, fat: 0.3, unit: "г", servingGrams: 150, category: "veg", priceByn: 0.4 },
  { name: "Лук репчатый", calories: 40, protein: 1.1, carbs: 9, fat: 0.1, unit: "г", servingGrams: 50, category: "veg", priceByn: 0.08 },
  { name: "Свёкла (варёная)", calories: 45, protein: 1.6, carbs: 10, fat: 0.2, unit: "г", servingGrams: 100, category: "veg", priceByn: 0.15 },
  { name: "Тыква (запечённая)", calories: 26, protein: 1, carbs: 7, fat: 0.1, unit: "г", servingGrams: 150, category: "veg", priceByn: 0.25 },

  // Жиры
  { name: "Оливковое масло", calories: 884, protein: 0, carbs: 0, fat: 100, unit: "г", servingGrams: 10, category: "fat", priceByn: 0.2 },
  { name: "Миндаль", calories: 579, protein: 21, carbs: 22, fat: 50, unit: "г", servingGrams: 25, category: "fat", priceByn: 0.75 },
  { name: "Арахисовая паста", calories: 588, protein: 25, carbs: 20, fat: 50, unit: "г", servingGrams: 20, category: "fat", priceByn: 0.45 },
  { name: "Авокадо", calories: 160, protein: 2, carbs: 9, fat: 15, unit: "шт", servingGrams: 100, category: "fat", priceByn: 1.2 },
  { name: "Семена чиа", calories: 486, protein: 17, carbs: 42, fat: 31, unit: "г", servingGrams: 15, category: "fat", priceByn: 0.55 },
  { name: "Грецкие орехи", calories: 654, protein: 15, carbs: 14, fat: 65, unit: "г", servingGrams: 25, category: "fat", priceByn: 0.75 },

  // Молочное
  { name: "Молоко 2.5%", calories: 52, protein: 3, carbs: 4.8, fat: 2.5, unit: "г", servingGrams: 200, category: "dairy", priceByn: 0.5 },
  { name: "Кефир 2.5%", calories: 50, protein: 3, carbs: 4, fat: 2.5, unit: "г", servingGrams: 200, category: "dairy", priceByn: 0.55 },
  { name: "Сметана 15%", calories: 160, protein: 2.6, carbs: 4.1, fat: 15, unit: "г", servingGrams: 30, category: "dairy", priceByn: 0.25 },

  // Перекусы
  { name: "Протеиновый батончик", calories: 350, protein: 25, carbs: 40, fat: 10, unit: "шт", servingGrams: 60, category: "snack", priceByn: 1.5 },
  { name: "Рисовые хлебцы", calories: 387, protein: 8, carbs: 81, fat: 3, unit: "шт", servingGrams: 10, category: "snack", priceByn: 0.1 },
  { name: "Тёмный шоколад (85%)", calories: 598, protein: 8, carbs: 46, fat: 43, unit: "г", servingGrams: 20, category: "snack", priceByn: 0.4 },
  { name: "Творог с ананасом", calories: 90, protein: 9, carbs: 11, fat: 1.5, unit: "г", servingGrams: 150, category: "snack", priceByn: 1.1 },
  { name: "Хумус", calories: 166, protein: 7.9, carbs: 14, fat: 9.6, unit: "г", servingGrams: 50, category: "snack", priceByn: 0.6 },
];

/** Быстрый доступ к продуктам по имени. */
const FOOD_BY_NAME = new Map(FOOD_LIBRARY.map((f) => [f.name, f]));

/* ------------------------------------------------------------------ */
/* Шаблоны блюд                                                        */
/* ------------------------------------------------------------------ */

/** Ингредиент шаблона блюда. `g` — граммы в базовой порции (для штучных
 *  продуктов — граммы, кратные весу одной штуки). `adjustable` — гарнир/крупа,
 *  порцию которой генератор может подстраивать под цель по калориям. */
interface TemplateIngredient {
  name: string;
  g: number;
  adjustable?: boolean;
}

interface MealTemplate {
  name: string;
  mealType: MealType;
  ingredients: TemplateIngredient[];
}

/** Кураторские блюда: обычные, доступные, бюджетные комбинации, которые люди
 *  действительно едят. По 7 шаблонов на приём пищи — по одному на каждый день
 *  недели без повторов. */
const TEMPLATES: MealTemplate[] = [
  // Завтраки
  { name: "Овсянка с бананом и арахисовой пастой", mealType: "breakfast", ingredients: [
    { name: "Овсянка (сухая)", g: 60, adjustable: true },
    { name: "Молоко 2.5%", g: 150 },
    { name: "Банан", g: 120 },
    { name: "Арахисовая паста", g: 15 },
  ] },
  { name: "Творог с мёдом, ягодами и орехами", mealType: "breakfast", ingredients: [
    { name: "Творог (нежирный)", g: 200 },
    { name: "Черника", g: 100 },
    { name: "Мёд", g: 15 },
    { name: "Грецкие орехи", g: 15 },
  ] },
  { name: "Яичница из 3 яиц с тостами и помидорами", mealType: "breakfast", ingredients: [
    { name: "Яйца", g: 150 },
    { name: "Цельнозерновой хлеб", g: 80 },
    { name: "Помидор", g: 120 },
    { name: "Оливковое масло", g: 5 },
  ] },
  { name: "Гречневая каша с молоком и мёдом", mealType: "breakfast", ingredients: [
    { name: "Гречка (варёная)", g: 250, adjustable: true },
    { name: "Молоко 2.5%", g: 150 },
    { name: "Мёд", g: 15 },
  ] },
  { name: "Сырники со сметаной", mealType: "breakfast", ingredients: [
    { name: "Творог (нежирный)", g: 200 },
    { name: "Яйца", g: 50 },
    { name: "Мука пшеничная", g: 30 },
    { name: "Сметана 15%", g: 30 },
  ] },
  { name: "Бутерброды с индейкой и овощами", mealType: "breakfast", ingredients: [
    { name: "Цельнозерновой хлеб", g: 80 },
    { name: "Индейка (грудка, ветчина)", g: 60 },
    { name: "Огурец", g: 100 },
    { name: "Апельсин", g: 150 },
  ] },
  { name: "Омлет с овощами и тостом", mealType: "breakfast", ingredients: [
    { name: "Яйца", g: 150 },
    { name: "Молоко 2.5%", g: 50 },
    { name: "Болгарский перец", g: 100 },
    { name: "Цельнозерновой хлеб", g: 40 },
    { name: "Оливковое масло", g: 5 },
  ] },

  // Обеды
  { name: "Куриная грудка с гречкой и овощным салатом", mealType: "lunch", ingredients: [
    { name: "Куриная грудка (гриль)", g: 150 },
    { name: "Гречка (варёная)", g: 220, adjustable: true },
    { name: "Салатный микс", g: 100 },
    { name: "Огурец", g: 100 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Рис с тунцом и овощами", mealType: "lunch", ingredients: [
    { name: "Белый рис (варёный)", g: 220, adjustable: true },
    { name: "Тунец (консервы в воде)", g: 120 },
    { name: "Салатный микс", g: 80 },
    { name: "Помидор", g: 120 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Паста с курицей и овощами", mealType: "lunch", ingredients: [
    { name: "Паста (варёная)", g: 220, adjustable: true },
    { name: "Куриная грудка (гриль)", g: 120 },
    { name: "Болгарский перец", g: 100 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Куриный суп с картофелем и хлебом", mealType: "lunch", ingredients: [
    { name: "Куриная грудка (гриль)", g: 100 },
    { name: "Картофель (отварной)", g: 150, adjustable: true },
    { name: "Морковь", g: 60 },
    { name: "Лук репчатый", g: 50 },
    { name: "Цельнозерновой хлеб", g: 80 },
  ] },
  { name: "Говядина с картофелем и салатом", mealType: "lunch", ingredients: [
    { name: "Постная говядина (вырезка)", g: 150 },
    { name: "Картофель (отварной)", g: 250, adjustable: true },
    { name: "Салатный микс", g: 100 },
    { name: "Огурец", g: 80 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Рис с курицей и овощами", mealType: "lunch", ingredients: [
    { name: "Белый рис (варёный)", g: 250, adjustable: true },
    { name: "Куриная грудка (гриль)", g: 130 },
    { name: "Морковь", g: 80 },
    { name: "Болгарский перец", g: 80 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Гречка с тунцом и салатом", mealType: "lunch", ingredients: [
    { name: "Гречка (варёная)", g: 250, adjustable: true },
    { name: "Тунец (консервы в воде)", g: 120 },
    { name: "Салатный микс", g: 100 },
    { name: "Помидор", g: 120 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Борщ с говядиной и сметаной", mealType: "lunch", ingredients: [
    { name: "Постная говядина (вырезка)", g: 150 },
    { name: "Свёкла (варёная)", g: 100 },
    { name: "Картофель (отварной)", g: 200, adjustable: true },
    { name: "Капуста белокочанная", g: 100 },
    { name: "Морковь", g: 60 },
    { name: "Лук репчатый", g: 40 },
    { name: "Сметана 15%", g: 20 },
    { name: "Цельнозерновой хлеб", g: 40 },
  ] },
  { name: "Куриный суп с лапшой", mealType: "lunch", ingredients: [
    { name: "Куриная грудка (гриль)", g: 120 },
    { name: "Лапша яичная (варёная)", g: 200, adjustable: true },
    { name: "Морковь", g: 60 },
    { name: "Лук репчатый", g: 40 },
    { name: "Картофель (отварной)", g: 120 },
    { name: "Цельнозерновой хлеб", g: 40 },
  ] },

  // Ужины
  { name: "Лосось с картофелем и брокколи", mealType: "dinner", ingredients: [
    { name: "Лосось (запечённый)", g: 150 },
    { name: "Картофель (отварной)", g: 250, adjustable: true },
    { name: "Брокколи (на пару)", g: 150 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Треска с картофельным пюре и огурцами", mealType: "dinner", ingredients: [
    { name: "Треска (запечённая)", g: 180 },
    { name: "Картофель (отварной)", g: 250, adjustable: true },
    { name: "Молоко 2.5%", g: 50 },
    { name: "Огурец", g: 100 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Овощное рагу с курицей и картофелем", mealType: "dinner", ingredients: [
    { name: "Куриная грудка (гриль)", g: 150 },
    { name: "Картофель (отварной)", g: 200, adjustable: true },
    { name: "Кабачок", g: 150 },
    { name: "Болгарский перец", g: 100 },
    { name: "Помидор", g: 120 },
    { name: "Морковь", g: 80 },
    { name: "Оливковое масло", g: 10 },
  ] },
  { name: "Курица с рисом и брокколи", mealType: "dinner", ingredients: [
    { name: "Куриная грудка (гриль)", g: 150 },
    { name: "Белый рис (варёный)", g: 200, adjustable: true },
    { name: "Брокколи (на пару)", g: 100 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Творожная запеканка со сметаной", mealType: "dinner", ingredients: [
    { name: "Творог (нежирный)", g: 250 },
    { name: "Яйца", g: 50 },
    { name: "Мука пшеничная", g: 30 },
    { name: "Сметана 15%", g: 30 },
    { name: "Мёд", g: 15 },
  ] },
  { name: "Гречка с куриной грудкой и салатом", mealType: "dinner", ingredients: [
    { name: "Гречка (варёная)", g: 220, adjustable: true },
    { name: "Куриная грудка (гриль)", g: 150 },
    { name: "Салатный микс", g: 80 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Омлет-запеканка с овощами и хлебом", mealType: "dinner", ingredients: [
    { name: "Яйца", g: 150 },
    { name: "Молоко 2.5%", g: 50 },
    { name: "Болгарский перец", g: 100 },
    { name: "Помидор", g: 120 },
    { name: "Цельнозерновой хлеб", g: 40 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Пшённая каша с тыквой и молоком", mealType: "dinner", ingredients: [
    { name: "Пшено (варёное)", g: 300, adjustable: true },
    { name: "Тыква (запечённая)", g: 120 },
    { name: "Молоко 2.5%", g: 150 },
    { name: "Мёд", g: 15 },
  ] },
  { name: "Овсяная каша с яблоком и орехами", mealType: "dinner", ingredients: [
    { name: "Овсянка (сухая)", g: 60, adjustable: true },
    { name: "Молоко 2.5%", g: 200 },
    { name: "Яблоко", g: 180 },
    { name: "Грецкие орехи", g: 20 },
  ] },

  // Перекусы
  { name: "Яблоко с горстью миндаля", mealType: "snack", ingredients: [
    { name: "Яблоко", g: 180 },
    { name: "Миндаль", g: 20 },
  ] },
  { name: "Творог с ананасом", mealType: "snack", ingredients: [
    { name: "Творог с ананасом", g: 200 },
  ] },
  { name: "Кефир с бананом", mealType: "snack", ingredients: [
    { name: "Кефир 2.5%", g: 200 },
    { name: "Банан", g: 120 },
  ] },
  { name: "Протеиновый батончик", mealType: "snack", ingredients: [
    { name: "Протеиновый батончик", g: 60 },
  ] },
  { name: "Рисовые хлебцы с арахисовой пастой", mealType: "snack", ingredients: [
    { name: "Рисовые хлебцы", g: 40 },
    { name: "Арахисовая паста", g: 15 },
  ] },
  { name: "Морковные палочки с хумусом", mealType: "snack", ingredients: [
    { name: "Морковь", g: 100 },
    { name: "Хумус", g: 60 },
  ] },
  { name: "Груша с грецкими орехами", mealType: "snack", ingredients: [
    { name: "Груша", g: 150 },
    { name: "Грецкие орехи", g: 20 },
  ] },
  { name: "Яйца вкрутую (2 шт)", mealType: "snack", ingredients: [
    { name: "Яйца", g: 100 },
  ] },
  { name: "Кефир с хлебцами", mealType: "snack", ingredients: [
    { name: "Кефир 2.5%", g: 200 },
    { name: "Рисовые хлебцы", g: 20 },
  ] },
];

/* ------------------------------------------------------------------ */
/* Цель-зависимые порции                                               */
/* ------------------------------------------------------------------ */

/** Множители порции по категории продукта под цель. При похудении ужимаются
 *  углеводы и жиры (белок и овощи остаются — сытость и сохранение мышц),
 *  при наборе массы растут углеводы, белок и жиры. Экспортируется для тестов
 *  — это документированная «единая точка правды» по адаптации порций. */
export const PORTION_SCALE: Record<FitnessGoal, Record<FoodItem["category"], number>> = {
  lose_weight: { protein: 1, carb: 0.7, veg: 1, fat: 0.5, fruit: 1, dairy: 1, snack: 1 },
  gain_muscle: { protein: 1.3, carb: 1.6, veg: 1, fat: 1.35, fruit: 1, dairy: 1.25, snack: 1.1 },
  maintain: { protein: 1, carb: 1, veg: 1, fat: 1, fruit: 1, dairy: 1, snack: 1 },
  improve_endurance: { protein: 1, carb: 1.1, veg: 1, fat: 0.9, fruit: 1, dairy: 1, snack: 1 },
  // Сила: калории на поддержании, но чуть щедрее — восстановление и рост
  // силы требуют полного запаса энергии, в том числе углеводов.
  strength: { protein: 1.1, carb: 1.25, veg: 1, fat: 1.05, fruit: 1, dairy: 1.05, snack: 1 },
};

/** Штучные продукты всегда округляются до целой штуки (минимум одна). */
function snapPieces(food: FoodItem, grams: number): number {
  if (food.unit === "г") return Math.round(grams);
  const pieces = Math.max(1, Math.round(grams / food.servingGrams));
  return pieces * food.servingGrams;
}

/** Стоимость `grams` граммов продукта в BYN: цена за servingGrams, умноженная
 *  на количество порций. Для штучных продуктов servingGrams — вес одной штуки,
 *  поэтому цена тоже получается поштучной. */
function priceFor(food: FoodItem, grams: number): number {
  return Math.round((food.priceByn * (grams / food.servingGrams)) * 100) / 100;
}

/** Макросы и цена для `grams` граммов продукта (все макросы — на 100 г). */
function scale(food: FoodItem, grams: number): PlannedFood {
  const ratio = grams / 100;
  return {
    food,
    amountGrams: Math.round(grams),
    calories: Math.round(food.calories * ratio),
    protein: Math.round(food.protein * ratio * 10) / 10,
    carbs: Math.round(food.carbs * ratio * 10) / 10,
    fat: Math.round(food.fat * ratio * 10) / 10,
    priceByn: priceFor(food, grams),
  };
}

/** Регулируемый гарнир: порцию можно менять шагами по 25 г в диапазоне
 *  0.5–2 базовой порции — как в жизни («добавьте полпорции риса»). */
interface AdjustableSlot {
  mealType: MealType;
  food: FoodItem;
  base: number;
  grams: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Собирает одно блюдо из шаблона с порцией под цель. */
function mealFromTemplate(template: MealTemplate, goal: FitnessGoal): PlannedMeal {
  const foods = template.ingredients.map((ing) => {
    const food = FOOD_BY_NAME.get(ing.name);
    if (!food) throw new Error(`Неизвестный продукт в шаблоне: ${ing.name}`);
    const ratio = PORTION_SCALE[goal][food.category];
    return { food, grams: snapPieces(food, ing.g * ratio), adjustable: ing.adjustable === true };
  });

  const planned = foods.map((f) => scale(f.food, f.grams));
  return {
    mealType: template.mealType,
    name: template.name,
    foods: planned,
    calories: planned.reduce((s, f) => s + f.calories, 0),
    protein: Math.round(planned.reduce((s, f) => s + f.protein, 0) * 10) / 10,
    carbs: Math.round(planned.reduce((s, f) => s + f.carbs, 0) * 10) / 10,
    fat: Math.round(planned.reduce((s, f) => s + f.fat, 0) * 10) / 10,
    priceByn: Math.round(planned.reduce((s, f) => s + f.priceByn, 0) * 100) / 100,
  };
}

/** Насколько сильно меню цели может отходить от естественной калорийности,
 *  чтобы подогнаться под цель: похудение — меню держится цели (в ней уже
 *  заложен дефицит), набор массы — щедрые порции без жёсткой обрезки. */
const ADJUST_CAP: Record<FitnessGoal, number> = {
  lose_weight: 0.25,
  maintain: 0.2,
  gain_muscle: 0.3,
  improve_endurance: 0.2,
  // Силовое меню держит калории на поддержании, но порции щедрее — как
  // и при наборе, правка может быть заметной, не ломая характер.
  strength: 0.3,
};

/** Подстраивает порции регулируемых гарниров, чтобы день сошёлся к цели по
 *  калориям (погрешность < 8%), но не ломая характер меню под цель:
 *  суммарная правка ограничена `ADJUST_CAP` от естественной калорийности,
 *  шаги реалистичные — по 25 г в пределах 0.5–2 базовой порции гарнира.
 *  Штучные продукты (яйца, банан, хлеб) не трогаем. */
/** Заменяет порцию одного продукта в приёме пищи и пересчитывает макросы. */
function replaceFoodGrams(meal: PlannedMeal, foodName: string, grams: number): PlannedMeal {
  const foods = meal.foods.map((pf) =>
    pf.food.name === foodName ? scale(pf.food, grams) : pf,
  );
  return {
    ...meal,
    foods,
    calories: foods.reduce((s, f) => s + f.calories, 0),
    protein: Math.round(foods.reduce((s, f) => s + f.protein, 0) * 10) / 10,
    carbs: Math.round(foods.reduce((s, f) => s + f.carbs, 0) * 10) / 10,
    fat: Math.round(foods.reduce((s, f) => s + f.fat, 0) * 10) / 10,
    priceByn: Math.round(foods.reduce((s, f) => s + f.priceByn, 0) * 100) / 100,
  };
}

/** Подстраивает порции, чтобы день сошёлся к цели по калориям (погрешность
 *  < 8%), но не ломая характер меню под цель: суммарная правка ограничена
 *  `ADJUST_CAP` от естественной калорийности. Два приёма:
 *  1. Шаги по 25 г на «регулируемых» гарнирах (крупа/хлеб/картофель) — как
 *     в жизни («добавьте полпорции риса»).
 *  2. Если гарниров не хватило (например день из сырников и запеканки) —
 *     мягкое масштабирование всех углеводных гарниров по 10% за шаг.
 *  Штучные продукты (яйца, банан, хлеб) не трогаем. */
function adjustToTarget(
  meals: PlannedMeal[],
  targetCal: number,
  goal: FitnessGoal,
  ingredients: { name: string; g: number; adjustable?: boolean }[][],
): PlannedMeal[] {
  const slots: AdjustableSlot[] = [];
  meals.forEach((meal, mi) => {
    ingredients[mi].forEach((ing) => {
      if (!ing.adjustable) return;
      const food = FOOD_BY_NAME.get(ing.name);
      if (!food || food.unit !== "г") return;
      const used = meal.foods.find((f) => f.food.name === ing.name)?.amountGrams ?? ing.g;
      slots.push({ mealType: meal.mealType, food, base: ing.g, grams: used });
    });
  });

  const total = (ms: PlannedMeal[]) => ms.reduce((s, m) => s + m.calories, 0);
  const natural = total(meals);
  const cap = natural * ADJUST_CAP[goal];
  let adjusted = 0; // фактически добавленные/убранные ккал (по итогу правки)
  const withinTolerance = () =>
    Math.abs(total(meals) - targetCal) <= targetCal * 0.08;

  // Проход 1: пошагово 25 г на регулируемых гарнирах. Потолок одного
  // гарнира — 1.5 базовой порции, чтобы правка не концентрировалась в одном
  // блюде (дальше день добирают все гарниры равномерно в проходе 2).
  for (let iter = 0; iter < 40 && !withinTolerance(); iter++) {
    const direction = targetCal - total(meals) > 0 ? 1 : -1;
    let best: AdjustableSlot | null = null;
    let bestRoom = 0;
    for (const slot of slots) {
      const room =
        direction > 0
          ? Math.max(slot.base * 1.5, slot.grams) - slot.grams
          : slot.grams - slot.base * 0.75;
      if (room >= 25 && room > bestRoom) {
        bestRoom = room;
        best = slot;
      }
    }
    if (!best) break;

    best.grams = Math.round((best.grams + direction * 25) / 5) * 5;
    const mi = meals.findIndex((m) => m.mealType === best!.mealType);
    const before = total(meals);
    meals[mi] = replaceFoodGrams(meals[mi], best!.food.name, best!.grams);
    adjusted += total(meals) - before;
    if (Math.abs(adjusted) > cap) break; // не ломаем характер меню
  }

  // Проход 2: если всё ещё далеко — масштабируем углеводные гарниры по 10%.
  for (let iter = 0; iter < 6 && !withinTolerance(); iter++) {
    const direction = targetCal - total(meals) > 0 ? 1 : -1;
    let changed = false;
    const before = total(meals);
    meals = meals.map((meal) => {
      let next = meal;
      for (const pf of meal.foods) {
        if (pf.food.unit !== "г" || pf.food.category !== "carb") continue;
        const nextGrams = clamp(
          Math.round((pf.amountGrams * (1 + 0.1 * direction)) / 5) * 5,
          pf.food.servingGrams * 0.5,
          pf.food.servingGrams * 3.5,
        );
        // Не даём «увеличению» уменьшить порцию и наоборот.
        if (direction > 0 && nextGrams <= pf.amountGrams) continue;
        if (direction < 0 && nextGrams >= pf.amountGrams) continue;
        next = replaceFoodGrams(next, pf.food.name, nextGrams);
        changed = true;
      }
      return next;
    });
    if (!changed) break;
    adjusted += total(meals) - before;
    if (Math.abs(adjusted) > cap) break;
  }

  return meals;
}

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/** День недели 0 = понедельник … 6 = воскресенье для даты «YYYY-MM-DD». */
function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/** Случайные (но детерминированные) смещения по приёмам пищи — они общие для
 *  недельного меню и дневного плана, поэтому «план на сегодня» совпадает
 *  с первым днём недельного меню. */
function mealOffsets(goal: FitnessGoal, calories: number): Record<MealType, number> {
  const rand = seeded(`week-${goal}-${Math.round(calories)}`);
  return {
    breakfast: Math.floor(rand() * 7),
    lunch: Math.floor(rand() * 7),
    dinner: Math.floor(rand() * 7),
    snack: Math.floor(rand() * 7),
  };
}

/** Собирает день: по одному шаблону на приём пищи (по индексу дня недели —
 *  без повторов в течение недели) + подгонка к цели. */
function buildDay(
  goal: FitnessGoal,
  targets: Targets,
  weekday: number,
  offsets: Record<MealType, number>,
): { meals: PlannedMeal[]; calories: number; protein: number; carbs: number; fat: number } {
  const pools = new Map<MealType, MealTemplate[]>();
  for (const mt of MEAL_ORDER) pools.set(mt, TEMPLATES.filter((t) => t.mealType === mt));

  const chosen: MealTemplate[] = [];
  const ingredientsForAdjust: { name: string; g: number; adjustable?: boolean }[][] = [];
  const slots: MealType[] =
    goal === "gain_muscle"
      ? ["breakfast", "lunch", "dinner", "snack", "snack"]
      : MEAL_ORDER;
  for (let i = 0; i < slots.length; i++) {
    const mt = slots[i];
    const pool = pools.get(mt)!;
    // Второй перекус для набора массы — следующий шаблон по кругу: перекусы
    // за неделю повторяются максимум дважды, основные приёмы — не повторяются.
    const step = mt === "snack" && i > MEAL_ORDER.indexOf("snack") ? 1 : 0;
    const template = pool[(offsets[mt] + weekday + step) % pool.length];
    chosen.push(template);
    ingredientsForAdjust.push(template.ingredients);
  }

  const meals = chosen.map((t) => mealFromTemplate(t, goal));
  const adjusted = adjustToTarget(meals, targets.calories, goal, ingredientsForAdjust);

  return {
    meals: adjusted,
    calories: adjusted.reduce((s, m) => s + m.calories, 0),
    protein: Math.round(adjusted.reduce((s, m) => s + m.protein, 0) * 10) / 10,
    carbs: Math.round(adjusted.reduce((s, m) => s + m.carbs, 0) * 10) / 10,
    fat: Math.round(adjusted.reduce((s, m) => s + m.fat, 0) * 10) / 10,
  };
}

/** Недельное меню на 7 дней (с сегодняшнего) под цель пользователя. Каждый
 *  приём пищи за неделю не повторяется; блюда адаптированы под цель порциями
 *  и набором (см. PORTION_SCALE). */
export function generateWeeklyMealPlan(
  goal: FitnessGoal,
  targets: Targets,
): WeeklyMealPlan {
  const offsets = mealOffsets(goal, targets.calories);
  const days: WeeklyDay[] = [];

  for (let d = 0; d < 7; d++) {
    const dateKey = toDateKey(addDays(new Date(), d));
    const weekday = weekdayOf(dateKey);
    const day = buildDay(goal, targets, weekday, offsets);
    days.push({ dateKey, weekday, ...day });
  }
  return { goal, days };
}

/** Дневной план на конкретную дату — тот же механизм, что и недельное меню
 *  (смещения считаются от цели и калорий), поэтому план «на сегодня»
 *  совпадает с первым днём недельного меню. */
export function generateMealPlan(
  dateKey: string,
  goal: FitnessGoal,
  targets: Targets,
): GeneratedPlan {
  const offsets = mealOffsets(goal, targets.calories);
  const weekday = weekdayOf(dateKey);
  return buildDay(goal, targets, weekday, offsets);
}

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

/** Короткие названия дней недели для недельного меню (0 = понедельник). */
export const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
