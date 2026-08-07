/** Генератор планов питания на основе кураторских шаблонов блюд.
 *
 *  Данные (база продуктов, шаблоны блюд, цель-зависимые порции) вынесены в
 *  `mealData.ts`; здесь — вся логика: подгонка порций под цель, жадное
 *  распределение блюд по неделе, локальный поиск и дневной план.
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
import {
  FOOD_LIBRARY,
  PORTION_SCALE,
  TEMPLATES,
  type FoodItem,
  type GeneratedPlan,
  type MealTemplate,
  type MealType,
  type PlannedFood,
  type PlannedMeal,
  type TemplateIngredient,
  type WeeklyDay,
  type WeeklyMealPlan,
} from "./mealData";
import { MEAL_TYPE_LABELS, WEEKDAY_SHORT } from "./i18n";

// Обратная совместимость: данные и типы пере-экспортируются из mealData,
// чтобы старые импорты «из @/lib/mealLibrary» продолжали работать.
export {
  FOOD_LIBRARY,
  PORTION_SCALE,
  TEMPLATES,
  type FoodItem,
  type GeneratedPlan,
  type MealTemplate,
  type MealType,
  type PlannedFood,
  type PlannedMeal,
  type TemplateIngredient,
  type WeeklyDay,
  type WeeklyMealPlan,
};
export { MEAL_TYPE_LABELS, WEEKDAY_SHORT };

/** Быстрый доступ к продуктам по имени. */
const FOOD_BY_NAME = new Map(FOOD_LIBRARY.map((f) => [f.name, f]));

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

/* ------------------------------------------------------------------ */
/* Цель-зависимые порции                                               */
/* ------------------------------------------------------------------ */

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
  // Поддержание: углеводная цель высокая (остаток калорий), а «естественные»
  // порции шаблонов её не добирают — правка до 30% позволяет догнать КБЖУ,
  // не превращая день в «500 г курицы» (порции по-прежнему 0.5–2 базовой).
  maintain: 0.3,
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
 *  энергии), углеводы — чуть тяжелее белков и жиров: углеводная цель обычно
 *  самая объёмная (374 г против 120 г белка), и без этого веса жадный
 *  распределитель оставляет «лёгким» дням низкоуглеводные блюда — углеводы
 *  проседают до 70-80% от цели, хотя белки и жиры в норме. «Близко к КБЖУ»
 *  означает сходимость по всем четырём метрикам сразу, а не только по
 *  калориям. */
const MACRO_WEIGHTS = { calories: 2, protein: 1, carbs: 2.2, fat: 1 } as const;

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
