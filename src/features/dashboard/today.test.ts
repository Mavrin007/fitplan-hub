import { describe, expect, it } from "vitest";
import {
  buildCoachAdvice,
  buildCoachGreeting,
  buildTodayChecklist,
  clampPct,
  computeTodayScore,
  liters,
  mealsLoggedCount,
  pluralize,
  scoreLabel,
  type TodayInput,
} from "./today";

/** Пустой день с целями из фикстуры профиля (80 кг, похудение). */
const base: TodayInput = {
  calories: 0,
  calorieTarget: 2345,
  protein: 0,
  proteinTarget: 152,
  waterMl: 0,
  waterTarget: 2750,
  workoutsThisWeek: 0,
  trainingTarget: 3,
  workoutToday: false,
  meals: { breakfast: false, lunch: false, dinner: false },
  weightLoggedThisWeek: false,
};

describe("scoreLabel / clampPct / pluralize / liters", () => {
  it("градации оценки: 90+ отлично, 75+ очень хорошо, 55+ неплохо, 30+ начало", () => {
    expect(scoreLabel(90)).toBe("Отличный день");
    expect(scoreLabel(100)).toBe("Отличный день");
    expect(scoreLabel(82)).toBe("Очень хорошо");
    expect(scoreLabel(75)).toBe("Очень хорошо");
    expect(scoreLabel(74)).toBe("Неплохо");
    expect(scoreLabel(55)).toBe("Неплохо");
    expect(scoreLabel(54)).toBe("Начало положено");
    expect(scoreLabel(30)).toBe("Начало положено");
    expect(scoreLabel(29)).toBe("Новый день — начнём");
    expect(scoreLabel(0)).toBe("Новый день — начнём");
  });

  it("clampPct держит диапазон 0..100", () => {
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(150)).toBe(100);
    expect(clampPct(42)).toBe(42);
  });

  it("pluralize: 1 тренировка, 2 тренировки, 5 тренировок, 11 тренировок", () => {
    const forms: [string, string, string] = ["тренировка", "тренировки", "тренировок"];
    expect(pluralize(1, forms)).toBe("тренировка");
    expect(pluralize(2, forms)).toBe("тренировки");
    expect(pluralize(4, forms)).toBe("тренировки");
    expect(pluralize(5, forms)).toBe("тренировок");
    expect(pluralize(11, forms)).toBe("тренировок");
    expect(pluralize(21, forms)).toBe("тренировка");
  });

  it("liters: мл → литры с одним знаком", () => {
    expect(liters(2300)).toBe("2,3");
    expect(liters(2750)).toBe("2,8");
    expect(liters(0)).toBe("0");
    expect(liters(1000)).toBe("1");
  });

  it("mealsLoggedCount считает только три основных приёма", () => {
    expect(mealsLoggedCount({ breakfast: false, lunch: false, dinner: false })).toBe(0);
    expect(mealsLoggedCount({ breakfast: true, lunch: false, dinner: false })).toBe(1);
    expect(mealsLoggedCount({ breakfast: true, lunch: true, dinner: true })).toBe(3);
  });
});

describe("computeTodayScore", () => {
  it("пустой день — 0 баллов и самая нижняя градация", () => {
    const r = computeTodayScore(base);
    expect(r.score).toBe(0);
    expect(r.label).toBe("Новый день — начнём");
    expect(r.components).toHaveLength(5);
  });

  it("идеальный день — 100 баллов «Отличный день»", () => {
    const r = computeTodayScore({
      ...base,
      calories: 2345,
      protein: 152,
      waterMl: 2750,
      workoutsThisWeek: 3,
      workoutToday: true,
      meals: { breakfast: true, lunch: true, dinner: true },
      weightLoggedThisWeek: true,
    });
    expect(r.score).toBe(100);
    expect(r.label).toBe("Отличный день");
  });

  it("калории: ровно на цели — 100, в половине — 40, перебор на 50% — 40", () => {
    const at = computeTodayScore({ ...base, calories: 2345 });
    expect(at.components.find((c) => c.key === "calories")!.value).toBe(100);

    const half = computeTodayScore({ ...base, calories: Math.round(2345 * 0.5) });
    expect(half.components.find((c) => c.key === "calories")!.value).toBe(40);

    const over = computeTodayScore({ ...base, calories: Math.round(2345 * 1.5) });
    expect(over.components.find((c) => c.key === "calories")!.value).toBe(40);
  });

  it("вода/белок/тренировки считаются как процент от цели (с потолком 100)", () => {
    const r = computeTodayScore({
      ...base,
      waterMl: 1375, // 50%
      protein: 300, // перебор → 100, не штрафуется
      workoutsThisWeek: 6, // больше цели → 100
    });
    expect(r.components.find((c) => c.key === "water")!.value).toBe(50);
    expect(r.components.find((c) => c.key === "protein")!.value).toBe(100);
    expect(r.components.find((c) => c.key === "workout")!.value).toBe(100);
  });

  it("без цели по тренировкам: любая тренировка = 100, иначе 0", () => {
    const noTarget = { ...base, trainingTarget: 0 };
    expect(computeTodayScore(noTarget).components.find((c) => c.key === "workout")!.value).toBe(0);
    expect(
      computeTodayScore({ ...noTarget, workoutsThisWeek: 1 }).components.find(
        (c) => c.key === "workout",
      )!.value,
    ).toBe(100);
  });
});

describe("buildTodayChecklist", () => {
  it("пустой день — все шесть привычек не закрыты, вода с литрами", () => {
    const items = buildTodayChecklist(base);
    expect(items.map((i) => i.id)).toEqual([
      "breakfast",
      "lunch",
      "dinner",
      "water",
      "workout",
      "weight",
    ]);
    for (const item of items) expect(item.done).toBe(false);
    const water = items.find((i) => i.id === "water")!;
    expect(water.detail).toBe("0 / 2,8 л");
  });

  it("закрытые привычки помечаются done, вода показывает прогресс", () => {
    const items = buildTodayChecklist({
      ...base,
      meals: { breakfast: true, lunch: true, dinner: false },
      waterMl: 2000,
      workoutToday: true,
      workoutsThisWeek: 2,
      weightLoggedThisWeek: true,
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get("breakfast")!.done).toBe(true);
    expect(byId.get("lunch")!.done).toBe(true);
    expect(byId.get("dinner")!.done).toBe(false);
    expect(byId.get("water")!.done).toBe(false);
    expect(byId.get("water")!.detail).toBe("2 / 2,8 л");
    expect(byId.get("workout")!.done).toBe(true);
    expect(byId.get("workout")!.detail).toBe("2 за неделю");
    expect(byId.get("weight")!.done).toBe(true);
  });

  it("вода закрыта только при достижении цели", () => {
    const done = buildTodayChecklist({ ...base, waterMl: 2750 });
    expect(done.find((i) => i.id === "water")!.done).toBe(true);
    expect(done.find((i) => i.id === "water")!.detail).toBe("2,8 / 2,8 л");
  });

  it("строки ведут на свои экраны; вода — не ссылка", () => {
    const items = buildTodayChecklist(base);
    expect(items.find((i) => i.id === "breakfast")!.href).toBe("/dashboard/meals");
    expect(items.find((i) => i.id === "workout")!.href).toBe("/dashboard/workouts");
    expect(items.find((i) => i.id === "weight")!.href).toBe("/dashboard/progress");
    expect(items.find((i) => i.id === "water")!.href).toBe("");
  });
});

describe("buildCoachAdvice — приоритетная цепочка", () => {
  it("нет тренировки → совет про тренировку с CTA на тренировки", () => {
    const a = buildCoachAdvice(base);
    expect(a.text).toMatch(/тренировк/);
    expect(a.cta).toEqual({ label: "Перейти к тренировке", to: "/dashboard/workouts" });
  });

  it("тренировка закрыта, вода < 70% → совет про воду с кнопкой +250 мл", () => {
    const a = buildCoachAdvice({
      ...base,
      workoutToday: true,
      workoutsThisWeek: 3,
      waterMl: 1000,
    });
    expect(a.text).toContain("воде");
    expect(a.cta).toEqual({ label: "Добавить 250 мл", action: "water" });
  });

  it("вода ок, белок < 70% → совет про белок с CTA на еду", () => {
    const a = buildCoachAdvice({
      ...base,
      workoutToday: true,
      workoutsThisWeek: 3,
      waterMl: 2500,
      protein: 80,
    });
    expect(a.text).toContain("белка");
    expect(a.cta).toEqual({ label: "Записать еду", to: "/dashboard/meals" });
  });

  it("мало калорий → совет про приёмы пищи", () => {
    const a = buildCoachAdvice({
      ...base,
      workoutToday: true,
      workoutsThisWeek: 3,
      waterMl: 2500,
      protein: 152,
      calories: 800,
    });
    expect(a.text).toContain("нормы");
    expect(a.cta).toEqual({ label: "Записать еду", to: "/dashboard/meals" });
  });

  it("дневник неполный → совет «осталось N приёмов»", () => {
    const a = buildCoachAdvice({
      ...base,
      workoutToday: true,
      workoutsThisWeek: 3,
      waterMl: 2500,
      protein: 152,
      calories: 2000,
      meals: { breakfast: true, lunch: true, dinner: false },
    });
    expect(a.text).toContain("Осталось 1 приём");
    expect(a.cta).toEqual({ label: "Записать еду", to: "/dashboard/meals" });
  });

  it("всё закрыто кроме веса → совет про замер веса", () => {
    const a = buildCoachAdvice({
      ...base,
      workoutToday: true,
      workoutsThisWeek: 3,
      waterMl: 2750,
      protein: 152,
      calories: 2345,
      meals: { breakfast: true, lunch: true, dinner: true },
    });
    expect(a.text).toContain("вес");
    expect(a.cta).toEqual({ label: "Записать вес", to: "/dashboard/progress" });
  });

  it("всё закрыто → похвала и предложение ассистента", () => {
    const a = buildCoachAdvice({
      ...base,
      workoutToday: true,
      workoutsThisWeek: 3,
      waterMl: 2750,
      protein: 152,
      calories: 2345,
      meals: { breakfast: true, lunch: true, dinner: true },
      weightLoggedThisWeek: true,
    });
    expect(a.text).toContain("Отличный день");
    expect(a.cta).toEqual({ label: "Спросить ассистента", action: "assistant" });
  });

  it("всё закрыто — призыв спросить ассистента", () => {
    const a = buildCoachAdvice({
      ...base,
      workoutToday: true,
      workoutsThisWeek: 3,
      waterMl: 2750,
      protein: 152,
      calories: 2345,
      meals: { breakfast: true, lunch: true, dinner: true },
      weightLoggedThisWeek: true,
    });
    expect(a.text).toContain("Отличный день");
    expect(a.cta).toEqual({ label: "Спросить ассистента", action: "assistant" });
  });
});

describe("buildCoachGreeting — контекстное приветствие для чата", () => {
  it("собирает цифры дня: калории, воду, тренировку и приёмы пищи", () => {
    const g = buildCoachGreeting({
      ...base,
      calories: 1450,
      waterMl: 1800,
      workoutsThisWeek: 1,
      meals: { breakfast: true, lunch: true, dinner: false },
    });
    expect(g).toContain("Я вижу твой прогресс за сегодня:");
    // ru-RU форматирует числа с неразрывными пробелами — матчим их как \s.
    expect(g).toMatch(/1\s?450 из 2\s?345 ккал/);
    expect(g).toContain("1,8 л воды");
    expect(g).toContain("тренировка ещё впереди");
    expect(g).toContain("записано 2 из 3 приёмов пищи");
  });

  it("тренировка закрыта — приветствие говорит об этом", () => {
    const g = buildCoachGreeting({
      ...base,
      workoutToday: true,
      calorieTarget: 0,
      waterTarget: 0,
    });
    expect(g).toContain("тренировка закрыта");
    // Без целей калории и воду просто не перечисляет.
    expect(g).not.toContain("ккал");
    expect(g).not.toContain("л воды");
  });

  it("полностью пустой день — честно говорит об этом", () => {
    const g = buildCoachGreeting({
      ...base,
      calorieTarget: 0,
      waterTarget: 0,
      trainingTarget: 0,
    });
    expect(g).toContain("день пока пуст");
  });
});
