/** Тесты генератора меню: недельные планы под обе цели, реалистичность
 *  сочетаний и порций (никаких «креветок с картофелем на завтрак» и
 *  «0.75 батончика»), разнообразие недели и сходимость к цели. */

import { describe, expect, it } from "vitest";
import {
  FOOD_LIBRARY,
  formatAmount,
  generateMealPlan,
  generateWeeklyMealPlan,
  PORTION_SCALE,
  type MealType,
  type PlannedMeal,
} from "./mealLibrary";
import { computeTargets } from "./nutrition";
import { todayKey } from "./dates";

/** Два типичных профиля: худеющая женщина и набирающий массу мужчина. */
const cutTargets = computeTargets({
  age: 30,
  gender: "female",
  heightCm: 168,
  weightKg: 70,
  activityLevel: "moderate",
  fitnessGoal: "lose_weight",
});

const bulkTargets = computeTargets({
  age: 30,
  gender: "male",
  heightCm: 182,
  weightKg: 84,
  activityLevel: "moderate",
  fitnessGoal: "gain_muscle",
});

/** Профиль «поддержание веса» из превью: мужчина 30 лет, 175 см, 75 кг,
 *  умеренная активность — именно у него недельное меню раньше не добирало
 *  углеводы (Вс–Ср были на 71–80% от цели). */
const maintainTargets = computeTargets({
  age: 30,
  gender: "male",
  heightCm: 175,
  weightKg: 75,
  activityLevel: "moderate",
  fitnessGoal: "maintain",
});

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/** «Ужинные» белки, которых не должно быть в завтраках и перекусах. */
const DINNER_PROTEINS = [
  "Лосось (запечённый)",
  "Креветки",
  "Постная говядина (вырезка)",
  "Тунец (консервы в воде)",
  "Треска (запечённая)",
];

describe("generateWeeklyMealPlan", () => {
  it("даёт 7 дней: похудение — 4 приёма, набор массы — 5 (второй перекус)", () => {
    const cut = generateWeeklyMealPlan("lose_weight", cutTargets);
    const bulk = generateWeeklyMealPlan("gain_muscle", bulkTargets);
    for (const day of cut.days) {
      expect(day.meals.map((m) => m.mealType)).toEqual(MEAL_TYPES);
      expect(day.meals.every((m) => m.foods.length > 0)).toBe(true);
    }
    for (const day of bulk.days) {
      expect(day.meals.map((m) => m.mealType)).toEqual([...MEAL_TYPES, "snack"]);
      expect(day.meals.every((m) => m.foods.length > 0)).toBe(true);
    }
  });

  it("основные приёмы не повторяются в течение недели, перекусы — не чаще двух раз", () => {
    const week = generateWeeklyMealPlan("lose_weight", cutTargets);
    const mains = week.days.flatMap((d) =>
      d.meals.filter((m) => m.mealType !== "snack").map((m) => m.name),
    );
    expect(mains).toHaveLength(21);
    expect(new Set(mains).size).toBe(21);

    const snacks = week.days.flatMap((d) =>
      d.meals.filter((m) => m.mealType === "snack").map((m) => m.name),
    );
    const counts = new Map<string, number>();
    for (const s of snacks) counts.set(s, (counts.get(s) ?? 0) + 1);
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(2);
  });

  it("в дне с двумя перекусами (набор массы) перекусы разные", () => {
    const week = generateWeeklyMealPlan("gain_muscle", bulkTargets);
    for (const day of week.days) {
      const snacks = day.meals
        .filter((m) => m.mealType === "snack")
        .map((m) => m.name);
      expect(new Set(snacks).size, `${day.dateKey}: ${snacks.join(", ")}`).toBe(
        snacks.length,
      );
    }
  });

  it("у каждого дня целые штучные порции — никаких 0.75 батончика", () => {
    for (const goal of ["lose_weight", "gain_muscle"] as const) {
      const week = generateWeeklyMealPlan(goal, goal === "lose_weight" ? cutTargets : bulkTargets);
      for (const day of week.days) {
        for (const meal of day.meals) {
          for (const f of meal.foods) {
            if (f.food.unit !== "г") {
              expect(
                f.amountGrams % f.food.servingGrams,
                `${f.food.name}: ${f.amountGrams} г = ${f.amountGrams / f.food.servingGrams} шт`,
              ).toBe(0);
            }
          }
        }
      }
    }
  });

  it("калории: неделя сходится к цели, отдельные дни — в пределах 18%", () => {
    for (const [goal, targets] of [
      ["lose_weight", cutTargets],
      ["gain_muscle", bulkTargets],
    ] as const) {
      const week = generateWeeklyMealPlan(goal, targets);
      for (const day of week.days) {
        const drift = Math.abs(day.calories - targets.calories) / targets.calories;
        // Лёгкие дни (например два творога + фруктовый перекус) могут быть
        // заметно ниже цели — это нормальная дневная вариативность.
        expect(drift, `${goal}: день ${day.dateKey} = ${day.calories}, цель ${targets.calories}`).toBeLessThan(0.18);
      }
      const avg = week.days.reduce((s, d) => s + d.calories, 0) / week.days.length;
      const avgDrift = Math.abs(avg - targets.calories) / targets.calories;
      expect(avgDrift, `${goal}: среднее за неделю ${avg} vs цель ${targets.calories}`).toBeLessThan(0.08);
    }
  });

  it("порции адаптируются под цель: набор — больше углеводов и белка, похудение — меньше", () => {
    // Прямая проверка единой точки правды по порциям: при наборе массы
    // крупы/гарниры и белок растут, при похудении углеводы и жиры ужаты.
    expect(PORTION_SCALE.gain_muscle.carb).toBeGreaterThan(PORTION_SCALE.lose_weight.carb);
    expect(PORTION_SCALE.gain_muscle.protein).toBeGreaterThan(PORTION_SCALE.lose_weight.protein);
    expect(PORTION_SCALE.lose_weight.carb).toBeLessThan(1);
    expect(PORTION_SCALE.lose_weight.fat).toBeLessThan(1);
    expect(PORTION_SCALE.lose_weight.protein).toBe(1);
  });

  it("меню на цель «сила» генерируется и сходится к цели", () => {
    const targets = computeTargets({
      age: 30,
      gender: "male",
      heightCm: 178,
      weightKg: 78,
      activityLevel: "moderate",
      fitnessGoal: "strength",
    });
    const week = generateWeeklyMealPlan("strength", targets);
    expect(week.days).toHaveLength(7);
    for (const day of week.days) {
      expect(day.meals.length).toBeGreaterThan(0);
    }
    const avg =
      week.days.reduce((s, d) => s + d.calories, 0) / week.days.length;
    // Меню «сила» держит калории на поддержании (TDEE), а шаблоны блюд
    // спроектированы плотнее — неделя сходится в пределах ~10%, как и
    // допустимо для повседневного меню (дневная вариативность до 18%).
    expect(Math.abs(avg - targets.calories) / targets.calories).toBeLessThan(0.1);
  });

  it("порции на силу: белка чуть больше, чем при поддержании", () => {
    expect(PORTION_SCALE.strength.protein).toBeGreaterThan(1);
    expect(PORTION_SCALE.strength.protein).toBeLessThan(PORTION_SCALE.gain_muscle.protein);
  });

  it("при одной цели меню похудения в среднем не калорийнее меню набора", () => {
    const avg = (goal: "lose_weight" | "gain_muscle") => {
      const week = generateWeeklyMealPlan(goal, cutTargets);
      return week.days.reduce((s, d) => s + d.calories, 0) / week.days.length;
    };
    expect(avg("lose_weight")).toBeLessThanOrEqual(avg("gain_muscle") + 1);
  });

  it("в завтраках и перекусах нет «ужинных» белков (лосось, креветки, говядина…)", () => {
    const week = generateWeeklyMealPlan("lose_weight", cutTargets);
    for (const day of week.days) {
      for (const meal of day.meals) {
        if (meal.mealType === "breakfast" || meal.mealType === "snack") {
          const names = meal.foods.map((f) => f.food.name);
          for (const heavy of DINNER_PROTEINS) {
            expect(names, `${meal.name} содержит ${heavy}`).not.toContain(heavy);
          }
        }
      }
    }
  });

  it("в каждом дне есть белок в каждом приёме и адекватный дневной белок", () => {
    const week = generateWeeklyMealPlan("gain_muscle", bulkTargets);
    for (const day of week.days) {
      for (const meal of day.meals) {
        const protein = meal.foods.reduce((s, f) => s + f.protein, 0);
        // Перекус может быть фруктово-ореховым (4 г белка — нормально),
        // основные приёмы пищи — с полноценным белком.
        const floor = meal.mealType === "snack" ? 3 : 8;
        expect(protein, `${meal.name} без белка`).toBeGreaterThanOrEqual(floor);
      }
      expect(day.protein).toBeGreaterThanOrEqual(bulkTargets.protein * 0.7);
    }
  });

  it("неделя «поддержания»: все 7 дней ≥90% по каждому макросу КБЖУ", () => {
    // Регрессия: углеводы цели поддержания — самые объёмные (374 г при
    // 2633 ккал), и без высокоуглеводных блюд в пуле жаждущий распределитель
    // оставлял дни Вс–Ср на 71–80% углеводов. Теперь в пуле достаточно
    // углеводных завтраков/ужинов, а веса ошибки подчёркивают углеводы —
    // каждый день недели дотягивает до 90%+ по всем четырём метрикам.
    const week = generateWeeklyMealPlan("maintain", maintainTargets);
    expect(week.days).toHaveLength(7);
    for (const day of week.days) {
      const pct = (key: "calories" | "protein" | "carbs" | "fat") =>
        (day[key] / maintainTargets[key]) * 100;
      expect(
        pct("calories"),
        `${day.dateKey}: калории ${day.calories} / ${maintainTargets.calories}`,
      ).toBeGreaterThanOrEqual(90);
      expect(
        pct("protein"),
        `${day.dateKey}: белки ${day.protein} / ${maintainTargets.protein}`,
      ).toBeGreaterThanOrEqual(90);
      expect(
        pct("carbs"),
        `${day.dateKey}: углеводы ${day.carbs} / ${maintainTargets.carbs}`,
      ).toBeGreaterThanOrEqual(90);
      expect(
        pct("fat"),
        `${day.dateKey}: жиры ${day.fat} / ${maintainTargets.fat}`,
      ).toBeGreaterThanOrEqual(90);
    }
  });
});

describe("близость к целям КБЖУ", () => {
  /** Относительное отклонение от цели. */
  const drift = (actual: number, target: number) =>
    Math.abs(actual - target) / target;

  it("план на сегодня близок к целям: каждый макрос в пределах 12%", () => {
    for (const [goal, targets] of [
      ["lose_weight", cutTargets],
      ["gain_muscle", bulkTargets],
    ] as const) {
      const plan = generateMealPlan(todayKey(), goal, targets);
      expect(drift(plan.calories, targets.calories), `${goal}: калории`).toBeLessThan(0.12);
      expect(drift(plan.protein, targets.protein), `${goal}: белки`).toBeLessThan(0.12);
      expect(drift(plan.fat, targets.fat), `${goal}: жиры`).toBeLessThan(0.12);
      expect(drift(plan.carbs, targets.carbs), `${goal}: углеводы`).toBeLessThan(0.12);
    }
  });

  it("среднее за неделю по каждому макросу в пределах 12% от целей", () => {
    for (const [goal, targets] of [
      ["lose_weight", cutTargets],
      ["gain_muscle", bulkTargets],
    ] as const) {
      const week = generateWeeklyMealPlan(goal, targets);
      const avg = (key: "calories" | "protein" | "carbs" | "fat") =>
        week.days.reduce((s, d) => s + d[key], 0) / week.days.length;
      expect(drift(avg("calories"), targets.calories), `${goal}: калории`).toBeLessThan(0.12);
      expect(drift(avg("protein"), targets.protein), `${goal}: белки`).toBeLessThan(0.12);
      expect(drift(avg("fat"), targets.fat), `${goal}: жиры`).toBeLessThan(0.12);
      expect(drift(avg("carbs"), targets.carbs), `${goal}: углеводы`).toBeLessThan(0.12);
    }
  });

  it("в плане на сегодня штучные продукты тоже целые", () => {
    for (const [goal, targets] of [
      ["lose_weight", cutTargets],
      ["gain_muscle", bulkTargets],
    ] as const) {
      const plan = generateMealPlan(todayKey(), goal, targets);
      for (const meal of plan.meals) {
        for (const f of meal.foods) {
          if (f.food.unit !== "г") {
            expect(
              f.amountGrams % f.food.servingGrams,
              `${f.food.name}: ${f.amountGrams} г = ${f.amountGrams / f.food.servingGrams} шт`,
            ).toBe(0);
          }
        }
      }
    }
  });

  it("правки порций не превращают день в абсурд: не больше 6 штук любого продукта", () => {
    // «Вменяемое состояние»: хлеб/яйца крутятся целыми ломтиками/штуками и
    // не раздуваются до 10 бутербродов — максимум ~6 штук на приём (например
    // 4 рисовых хлебца — это нормальная база перекуса).
    for (const [goal, targets] of [
      ["lose_weight", cutTargets],
      ["gain_muscle", bulkTargets],
    ] as const) {
      const plan = generateMealPlan(todayKey(), goal, targets);
      for (const meal of plan.meals) {
        for (const f of meal.foods) {
          if (f.food.unit !== "г") {
            const pieces = f.amountGrams / f.food.servingGrams;
            expect(pieces, `${f.food.name}: ${pieces} шт`).toBeLessThanOrEqual(6);
          }
        }
      }
    }
  });
});

describe("generateMealPlan", () => {
  it("детерминирован для той же даты и цели", () => {
    const a = generateMealPlan("2026-08-10", "lose_weight", cutTargets);
    const b = generateMealPlan("2026-08-10", "lose_weight", cutTargets);
    expect(a).toEqual(b);
  });

  it("план «на сегодня» совпадает с первым днём недельного меню", () => {
    // todayKey() — локальная дата, как и в generateWeeklyMealPlan (не UTC).
    const daily = generateMealPlan(todayKey(), "gain_muscle", bulkTargets);
    const week = generateWeeklyMealPlan("gain_muscle", bulkTargets);
    expect(daily.meals.map((m) => m.name)).toEqual(week.days[0].meals.map((m) => m.name));
  });

  it("разные даты дают разные блюда (разнообразие по дням)", () => {
    const monday = generateMealPlan("2026-08-10", "lose_weight", cutTargets);
    const tuesday = generateMealPlan("2026-08-11", "lose_weight", cutTargets);
    const names = (p: { meals: PlannedMeal[] }) => p.meals.map((m) => m.name);
    expect(names(tuesday)).not.toEqual(names(monday));
  });
});

describe("formatAmount", () => {
  it("форматирует штучные продукты целыми штуками, а не дробями", () => {
    const bar = FOOD_LIBRARY.find((f) => f.name === "Протеиновый батончик")!;
    expect(formatAmount(bar, 60)).toBe("1 шт");
    expect(formatAmount(bar, 120)).toBe("2 шт");
    const bread = FOOD_LIBRARY.find((f) => f.name === "Цельнозерновой хлеб")!;
    expect(formatAmount(bread, 80)).toBe("2 ломтик");
  });

  it("форматирует граммы без дробей", () => {
    const rice = FOOD_LIBRARY.find((f) => f.name === "Белый рис (варёный)")!;
    expect(formatAmount(rice, 250)).toBe("250 г");
  });

  it("в библиотеке есть все продукты, на которые ссылаются шаблоны", () => {
    // Уже проверяется косвенно — генерация не должна бросать, но держим
    // явную проверку на предмет ухода имени из FOOD_LIBRARY.
    const week = generateWeeklyMealPlan("lose_weight", cutTargets);
    const used = new Set(
      week.days.flatMap((d) => d.meals.flatMap((m) => m.foods.map((f) => f.food.name))),
    );
    const known = new Set(FOOD_LIBRARY.map((f) => f.name));
    for (const name of used) expect(known.has(name), `нет в FOOD_LIBRARY: ${name}`).toBe(true);
  });
});
