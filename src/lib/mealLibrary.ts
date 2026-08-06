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
 *  - день подгоняется ко всем целям КБЖУ (калории, белки, жиры, углеводы),
 *    а не только к калориям: гарниры шагают по 25 г, белок — по 10 г,
 *    жиры — по 5 г, штучные продукты — целыми штуками; порции остаются в
 *    реалистичных пределах 0.5–2 базовой, а суммарная правка ограничена
 *    характером цели — «500 г курицы» не появится.
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
  { name: "Плов с курицей", mealType: "lunch", ingredients: [
    { name: "Белый рис (варёный)", g: 300, adjustable: true },
    { name: "Куриная грудка (гриль)", g: 150 },
    { name: "Морковь", g: 80 },
    { name: "Лук репчатый", g: 40 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Макароны с говядиной и овощами", mealType: "lunch", ingredients: [
    { name: "Паста (варёная)", g: 260, adjustable: true },
    { name: "Постная говядина (вырезка)", g: 140 },
    { name: "Болгарский перец", g: 80 },
    { name: "Оливковое масло", g: 8 },
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
  { name: "Картофельная запеканка с курицей", mealType: "dinner", ingredients: [
    { name: "Картофель (отварной)", g: 300, adjustable: true },
    { name: "Куриная грудка (гриль)", g: 130 },
    { name: "Молоко 2.5%", g: 50 },
    { name: "Лук репчатый", g: 40 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Гречка с говядиной и салатом", mealType: "dinner", ingredients: [
    { name: "Гречка (варёная)", g: 280, adjustable: true },
    { name: "Постная говядина (вырезка)", g: 130 },
    { name: "Салатный микс", g: 80 },
    { name: "Огурец", g: 80 },
    { name: "Оливковое масло", g: 8 },
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

/** Суммы по дню. */
function dayTotals(meals: PlannedMeal[]) {
  return {
    calories: meals.reduce((s, m) => s + m.calories, 0),
    protein: meals.reduce((s, m) => s + m.protein, 0),
    carbs: meals.reduce((s, m) => s + m.carbs, 0),
    fat: meals.reduce((s, m) => s + m.fat, 0),
  };
}

/** Веса ошибок: калории в приоритете (день не должен уезжать от цели по
 *  энергии), макросы — по единице: «близко к КБЖУ» означает сходимость
 *  по всем четырём метрикам сразу, а не только по калориям. */
const MACRO_WEIGHTS = { calories: 2, protein: 1, carbs: 1, fat: 1 } as const;

/** Суммарное относительное отклонение дня от целей КБЖУ. */
function dayError(meals: PlannedMeal[], targets: Targets): number {
  const t = dayTotals(meals);
  return (
    (Math.abs(t.calories - targets.calories) / targets.calories) * MACRO_WEIGHTS.calories +
    (Math.abs(t.protein - targets.protein) / targets.protein) * MACRO_WEIGHTS.protein +
    (Math.abs(t.carbs - targets.carbs) / targets.carbs) * MACRO_WEIGHTS.carbs +
    (Math.abs(t.fat - targets.fat) / targets.fat) * MACRO_WEIGHTS.fat
  );
}

/** Одна «крутилка» порции: продукт, базовая порция из шаблона, текущее
 *  количество и реалистичные шаг/границы (от 0.5 до 2 базовой порции).
 *  Штучные продукты (яйца, авокадо) крутим только целыми штуками. */
interface PortionSlot {
  mealIndex: number;
  food: FoodItem;
  base: number;
  grams: number;
  step: number;
  min: number;
  max: number;
}

/** Порция в границах слота, округлённая до шага; штучные — до целой штуки. */
function snapToSlot(slot: PortionSlot, grams: number): number {
  const snapped =
    slot.food.unit === "г"
      ? Math.round(grams / slot.step) * slot.step
      : Math.max(1, Math.round(grams / slot.food.servingGrams)) * slot.food.servingGrams;
  return Math.min(slot.max, Math.max(slot.min, snapped));
}

/** Собирает «крутилки» порций из шаблонов дня:
 *  - углеводные гарниры (крупа/картофель/паста, флаг adjustable или категория
 *    carb) — шаг 25 г, границы 0.5–2 базовой порции;
 *  - белковые продукты и молочка (курица/рыба/творог/кефир) — шаг 10 г,
 *    границы 0.75–2 базовой порции, яйца — поштучно;
 *  - жиры (масло/орехи/пасты) — шаг 5 г, границы 0.5–2 базовой порции,
 *    авокадо — поштучно.
 *  Овощи и фрукты не трогаем: они дают объём и сытость, а не калории. */
function collectPortionSlots(
  meals: PlannedMeal[],
  ingredients: TemplateIngredient[][],
): PortionSlot[] {
  const slots: PortionSlot[] = [];
  meals.forEach((meal, mi) => {
    const used = new Map(meal.foods.map((f) => [f.food.name, f.amountGrams]));
    for (const ing of ingredients[mi]) {
      const food = FOOD_BY_NAME.get(ing.name);
      if (!food) continue;
      const base = ing.g;
      const grams = used.get(ing.name) ?? base;
      const isPiece = food.unit !== "г";
      let step: number;
      let min: number;
      let max: number;
      if (ing.adjustable || food.category === "carb") {
        if (isPiece) {
          // Хлеб ломтиками: 1–1.5 базовых куска (2 → 3 ломтика максимум).
          const pieces = Math.max(1, Math.round(base / food.servingGrams));
          step = food.servingGrams;
          min = Math.max(food.servingGrams, Math.floor(pieces) * food.servingGrams);
          max = Math.ceil(pieces * 1.5) * food.servingGrams;
        } else {
          step = 25;
          min = base * 0.5;
          max = base * 2;
        }
      } else if (food.category === "protein" || food.category === "dairy") {
        if (isPiece) {
          const pieces = Math.max(1, Math.round(base / food.servingGrams));
          step = food.servingGrams;
          min = Math.max(food.servingGrams, Math.floor(pieces * 0.75) * food.servingGrams);
          max = Math.ceil(pieces * 1.5) * food.servingGrams;
        } else {
          step = 10;
          min = base * 0.75;
          max = base * 2;
        }
      } else if (food.category === "fat") {
        if (isPiece) {
          step = food.servingGrams;
          min = food.servingGrams;
          max = food.servingGrams * 2;
        } else {
          step = 5;
          min = base * 0.5;
          max = base * 2;
        }
      } else {
        continue;
      }
      slots.push({ mealIndex: mi, food, base, grams, step, min, max });
    }
  });
  return slots;
}

/** Подгоняет день к целям КБЖУ, не ломая характер меню:
 *  - жадный поиск: на каждом шаге применяется правка порции, сильнее всего
 *    снижающая суммарное отклонение от целей (калории в приоритете);
 *  - правки реалистичные: гарниры по 25 г, белок по 10 г, жиры по 5 г,
 *    штучные продукты — целыми штуками, порции в пределах 0.5–2 базовой;
 *  - суммарный сдвиг калорий от естественной калорийности ограничен
 *    `ADJUST_CAP` под цель — день не превращается в «500 г курицы». */
function adjustToTarget(
  meals: PlannedMeal[],
  targets: Targets,
  goal: FitnessGoal,
  ingredients: TemplateIngredient[][],
): PlannedMeal[] {
  const naturalCalories = meals.reduce((s, m) => s + m.calories, 0);
  const cap = naturalCalories * ADJUST_CAP[goal];
  const slots = collectPortionSlots(meals, ingredients);

  let drift = 0; // фактический сдвиг калорий от естественной калорийности
  for (let iter = 0; iter < 120; iter++) {
    const currentError = dayError(meals, targets);
    let best: { slot: PortionSlot; grams: number; delta: number } | null = null;

    for (const slot of slots) {
      for (const dir of [1, -1] as const) {
        const next = snapToSlot(slot, slot.grams + dir * slot.step);
        if (next === slot.grams) continue;
        const mi = slot.mealIndex;
        const before = meals[mi].calories;
        const candidateMeal = replaceFoodGrams(meals[mi], slot.food.name, next);
        // Не превышаем допустимый сдвиг калорий от естественной калорийности.
        if (Math.abs(drift + (candidateMeal.calories - before)) > cap) continue;
        const candidate = meals.slice();
        candidate[mi] = candidateMeal;
        const delta = dayError(candidate, targets) - currentError;
        if (delta < -0.001 && (!best || delta < best.delta)) {
          best = { slot, grams: next, delta };
        }
      }
    }

    if (!best) break;
    const mi = best.slot.mealIndex;
    const before = meals[mi].calories;
    meals[mi] = replaceFoodGrams(meals[mi], best.slot.food.name, best.grams);
    drift += meals[mi].calories - before;
    best.slot.grams = best.grams;
  }

  return meals;
}

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/** День недели 0 = понедельник … 6 = воскресенье для даты «YYYY-MM-DD». */
function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/** Жадное распределение шаблонов блюд по 7 дням недели так, чтобы каждый день
 *  был близок к целям КБЖУ ещё до подгонки порций:
 *  - для каждого приёма дня берётся неиспользованный в неделе шаблон, который
 *    сильнее всего снижает «естественную» ошибку дня (сумму отклонений от
 *    целей по калориям, белкам, жирам и углеводам);
 *  - основные приёмы не повторяются (7 шаблонов на тип = 7 дней), перекусы —
 *    не чаще двух раз (9 шаблонов на 7–9 слотов недели);
 *  - детерминировано: порядок перебора фиксирован, при равенстве берётся
 *    первый по порядку шаблон.
 *  Так высококалорийным целям (набор, сила) достаются рисовые и макаронные
 *  обеды, а «лёгким» — супы и запеканки: макросы дня сходятся к цели,
 *  а не «как повезёт» с ротацией. */
function computeWeekAssignments(goal: FitnessGoal, targets: Targets): MealTemplate[][] {
  const usedMains = new Map<MealType, Set<string>>();
  for (const mt of MEAL_ORDER) usedMains.set(mt, new Set<string>());
  const snackUses = new Map<string, number>(); // имя перекуса → использований в неделе

  const pickBest = (pool: MealTemplate[], dayMeals: PlannedMeal[]): MealTemplate => {
    let best: MealTemplate = pool[0];
    let bestError = Infinity;
    for (const candidate of pool) {
      const err = dayError([...dayMeals, mealFromTemplate(candidate, goal)], targets);
      if (err < bestError - 1e-9) {
        bestError = err;
        best = candidate;
      }
    }
    return best;
  };

  const days: MealTemplate[][] = [];
  const mealTypes: MealType[] =
    goal === "gain_muscle" ? [...MEAL_ORDER, "snack"] : MEAL_ORDER;

  for (let d = 0; d < 7; d++) {
    const day: MealTemplate[] = [];
    const dayMeals: PlannedMeal[] = [];

    // Основные приёмы: лучший по «естественной» ошибке среди неиспользованных.
    for (const mt of ["breakfast", "lunch", "dinner"] as const) {
      const pool = TEMPLATES.filter(
        (t) => t.mealType === mt && !usedMains.get(mt)!.has(t.name),
      );
      const chosen = pickBest(pool, dayMeals);
      day.push(chosen);
      usedMains.get(mt)!.add(chosen.name);
      dayMeals.push(mealFromTemplate(chosen, goal));
    }

    // Перекусы (1, а при наборе массы — 2): лучший по ошибке среди тех,
    // что в неделе использованы менее двух раз и ещё не встречались в этом дне
    // (два одинаковых перекуса в один день выглядели бы странно).
    for (const mt of mealTypes) {
      if (mt !== "snack") continue;
      const daySnackNames = new Set(
        day.filter((t) => t.mealType === "snack").map((t) => t.name),
      );
      const candidates = TEMPLATES.filter(
        (t) =>
          t.mealType === "snack" &&
          !daySnackNames.has(t.name) &&
          (snackUses.get(t.name) ?? 0) < 2,
      );
      const chosen = pickBest(candidates, dayMeals);
      snackUses.set(chosen.name, (snackUses.get(chosen.name) ?? 0) + 1);
      day.push(chosen);
      dayMeals.push(mealFromTemplate(chosen, goal));
    }

    days.push(day);
  }

  return refineAssignments(days, goal, targets);
}

/** «Естественная» ошибка дня из шаблонов (до подгонки порций) — критерий
 *  распределения: порции потом доточат, но распределение должно ставить
 *  высококалорийные дни ближе к цели уже на этом этапе. */
function naturalDayError(templates: MealTemplate[], goal: FitnessGoal, targets: Targets): number {
  return dayError(
    templates.map((t) => mealFromTemplate(t, goal)),
    targets,
  );
}

/** Вес дня в общей ошибке недели: «план на сегодня» важнее хвоста недели,
 *  поэтому ближние дни защищены от обмена в пользу дальних. */
const DAY_WEIGHTS = [1, 0.96, 0.92, 0.88, 0.84, 0.8, 0.76] as const;

/** Локальный поиск: жадное распределение выше близоруко — последнему дню
 *  достаются «остатки». Обмениваем шаблоны одного и того же приёма между
 *  парами дней, если взвешенная суммарная ошибка недели уменьшается (ближние
 *  дни весят больше). Перестановка сохраняет мультинабор шаблонов, поэтому
 *  гарантии не ломаются: основные приёмы не повторяются, перекусы — не чаще
 *  двух раз. Детерминировано. */
function refineAssignments(
  days: MealTemplate[][],
  goal: FitnessGoal,
  targets: Targets,
): MealTemplate[][] {
  const dayErrorOf = (d: number) => naturalDayError(days[d], goal, targets);
  const errors = days.map((_, i) => dayErrorOf(i) * DAY_WEIGHTS[i]);

  for (let iter = 0; iter < 25; iter++) {
    let improved = false;
    for (let mi = 0; mi < days[0].length; mi++) {
      for (let d1 = 0; d1 < 7; d1++) {
        for (let d2 = d1 + 1; d2 < 7; d2++) {
          if (days[d1][mi] === days[d2][mi]) continue;
          const before = errors[d1] + errors[d2];
          const t1 = days[d1][mi];
          const t2 = days[d2][mi];
          days[d1][mi] = t2;
          days[d2][mi] = t1;
          const e1 = dayErrorOf(d1) * DAY_WEIGHTS[d1];
          const e2 = dayErrorOf(d2) * DAY_WEIGHTS[d2];
          if (e1 + e2 < before - 1e-9) {
            errors[d1] = e1;
            errors[d2] = e2;
            improved = true;
          } else {
            days[d1][mi] = t1;
            days[d2][mi] = t2;
          }
        }
      }
    }
    if (!improved) break;
  }
  return days;
}

/** Собирает день из заранее распределённых шаблонов и подгоняет порции
 *  к целям КБЖУ. */
function buildAssignedDay(
  goal: FitnessGoal,
  targets: Targets,
  templates: MealTemplate[],
): GeneratedPlan {
  const ingredients = templates.map((t) => t.ingredients);
  const meals = templates.map((t) => mealFromTemplate(t, goal));
  const adjusted = adjustToTarget(meals, targets, goal, ingredients);
  return {
    meals: adjusted,
    calories: adjusted.reduce((s, m) => s + m.calories, 0),
    protein: Math.round(adjusted.reduce((s, m) => s + m.protein, 0) * 10) / 10,
    carbs: Math.round(adjusted.reduce((s, m) => s + m.carbs, 0) * 10) / 10,
    fat: Math.round(adjusted.reduce((s, m) => s + m.fat, 0) * 10) / 10,
  };
}

/** Недельное меню на 7 дней (с сегодняшнего) под цель пользователя. Блюда
 *  распределены по дням так, чтобы каждый день был близок к КБЖУ (см.
 *  computeWeekAssignments), порции адаптированы под цель (см. PORTION_SCALE). */
export function generateWeeklyMealPlan(
  goal: FitnessGoal,
  targets: Targets,
): WeeklyMealPlan {
  const assignments = computeWeekAssignments(goal, targets);
  const days: WeeklyDay[] = [];

  for (let d = 0; d < 7; d++) {
    const dateKey = toDateKey(addDays(new Date(), d));
    const weekday = weekdayOf(dateKey);
    days.push({ dateKey, weekday, ...buildAssignedDay(goal, targets, assignments[d]) });
  }
  return { goal, days };
}

/** Дневной план на конкретную дату — тот же механизм, что и недельное меню
 *  (день даты отображается на позицию в неделе от сегодняшнего), поэтому
 *  «план на сегодня» совпадает с первым днём недельного меню. */
export function generateMealPlan(
  dateKey: string,
  goal: FitnessGoal,
  targets: Targets,
): GeneratedPlan {
  const assignments = computeWeekAssignments(goal, targets);
  const todayWeekday = weekdayOf(toDateKey(new Date()));
  const dayIndex = (weekdayOf(dateKey) - todayWeekday + 7) % 7;
  return buildAssignedDay(goal, targets, assignments[dayIndex]);
}

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

/** Короткие названия дней недели для недельного меню (0 = понедельник). */
export const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
