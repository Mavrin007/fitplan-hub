/**
 * Кураторская база продуктов и шаблонов блюд — чистые данные без логики.
 * Генерация планов (подгонка порций, распределение по неделе) живёт в
 * `mealLibrary.ts`; этот модуль — «единая точка правды» по продуктам,
 * блюдам и цель-зависимым порциям.
 */

import type { FitnessGoal } from "./nutrition";

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

/** Ингредиент шаблона блюда. `g` — граммы в базовой порции (для штучных
 *  продуктов — граммы, кратные весу одной штуки). `adjustable` — гарнир/крупа,
 *  порцию которой генератор может подстраивать под цель по калориям. */
export interface TemplateIngredient {
  name: string;
  g: number;
  adjustable?: boolean;
}

export interface MealTemplate {
  name: string;
  mealType: MealType;
  ingredients: TemplateIngredient[];
}

/** Кураторские блюда: обычные, доступные, бюджетные комбинации, которые люди
 *  действительно едят. По 7 шаблонов на приём пищи — по одному на каждый день
 *  недели без повторов. */
export const TEMPLATES: MealTemplate[] = [
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
  { name: "Рисовая каша с молоком, мёдом и бананом", mealType: "breakfast", ingredients: [
    { name: "Белый рис (варёный)", g: 250, adjustable: true },
    { name: "Молоко 2.5%", g: 150 },
    { name: "Мёд", g: 15 },
    { name: "Банан", g: 120 },
  ] },
  { name: "Бутерброды с бананом и арахисовой пастой", mealType: "breakfast", ingredients: [
    { name: "Цельнозерновой хлеб", g: 80 },
    { name: "Банан", g: 120 },
    { name: "Арахисовая паста", g: 20 },
    { name: "Молоко 2.5%", g: 200 },
  ] },
  { name: "Пшённая каша с молоком и мёдом", mealType: "breakfast", ingredients: [
    { name: "Пшено (варёное)", g: 280, adjustable: true },
    { name: "Молоко 2.5%", g: 150 },
    { name: "Мёд", g: 15 },
  ] },
  { name: "Овсянка с бананом и мёдом", mealType: "breakfast", ingredients: [
    { name: "Овсянка (сухая)", g: 80, adjustable: true },
    { name: "Молоко 2.5%", g: 200 },
    { name: "Банан", g: 120 },
    { name: "Мёд", g: 15 },
  ] },
  { name: "Гречневая каша с молоком и яблоком", mealType: "breakfast", ingredients: [
    { name: "Гречка (варёная)", g: 280, adjustable: true },
    { name: "Молоко 2.5%", g: 150 },
    { name: "Яблоко", g: 180 },
  ] },
  { name: "Рисовая каша с яблоком и корицей", mealType: "breakfast", ingredients: [
    { name: "Белый рис (варёный)", g: 300, adjustable: true },
    { name: "Молоко 2.5%", g: 150 },
    { name: "Яблоко", g: 180 },
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
  { name: "Картофельное пюре с куриной котлетой", mealType: "lunch", ingredients: [
    { name: "Картофель (отварной)", g: 300, adjustable: true },
    { name: "Куриная грудка (гриль)", g: 130 },
    { name: "Молоко 2.5%", g: 50 },
    { name: "Огурец", g: 80 },
  ] },

  // Ужины
  { name: "Паста с тунцом и овощами", mealType: "dinner", ingredients: [
    { name: "Паста (варёная)", g: 250, adjustable: true },
    { name: "Тунец (консервы в воде)", g: 120 },
    { name: "Помидор", g: 120 },
    { name: "Болгарский перец", g: 80 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Жареный рис с яйцом и овощами", mealType: "dinner", ingredients: [
    { name: "Белый рис (варёный)", g: 300, adjustable: true },
    { name: "Яйца", g: 100 },
    { name: "Морковь", g: 60 },
    { name: "Болгарский перец", g: 80 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Макароны с курицей и сыром", mealType: "dinner", ingredients: [
    { name: "Паста (варёная)", g: 260, adjustable: true },
    { name: "Куриная грудка (гриль)", g: 130 },
    { name: "Молоко 2.5%", g: 50 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Картофель с куриной грудкой и салатом", mealType: "dinner", ingredients: [
    { name: "Картофель (отварной)", g: 300, adjustable: true },
    { name: "Куриная грудка (гриль)", g: 130 },
    { name: "Салатный микс", g: 80 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Рис с индейкой и овощами", mealType: "dinner", ingredients: [
    { name: "Белый рис (варёный)", g: 280, adjustable: true },
    { name: "Индейка (грудка, ветчина)", g: 120 },
    { name: "Морковь", g: 60 },
    { name: "Болгарский перец", g: 80 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Гречка с тунцом и овощами", mealType: "dinner", ingredients: [
    { name: "Гречка (варёная)", g: 300, adjustable: true },
    { name: "Тунец (консервы в воде)", g: 120 },
    { name: "Салатный микс", g: 80 },
    { name: "Оливковое масло", g: 8 },
  ] },
  { name: "Паста с индейкой и овощами", mealType: "dinner", ingredients: [
    { name: "Паста (варёная)", g: 250, adjustable: true },
    { name: "Индейка (грудка, ветчина)", g: 120 },
    { name: "Болгарский перец", g: 80 },
    { name: "Оливковое масло", g: 8 },
  ] },
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
