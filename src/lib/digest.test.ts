/**
 * Юнит-тесты чистой логики недельной сводки (src/lib/digest.ts) — без
 * Convex-рантайма, как effort/projection/export: агрегация строк в
 * WeeklyDigest и рендер текста/HTML письма. Реальные запросы к БД и
 * отправку покрывает src/convex/digest.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  buildNextWeekPlan,
  buildWeeklyDigest,
  buildWeeklyInsight,
  digestLines,
  renderDigestHtml,
  renderDigestText,
  type DigestInput,
} from "./digest";

function input(over: Partial<DigestInput> = {}): DigestInput {
  return {
    weightRows: [],
    mealRows: [],
    workoutRows: [],
    waterRows: [],
    calorieTarget: 2200,
    ...over,
  };
}

describe("buildWeeklyDigest", () => {
  it("пустое окно: hasData=false, все средние null, счётчики 0", () => {
    const d = buildWeeklyDigest(input());
    expect(d.hasData).toBe(false);
    expect(d.trackedDays).toBe(0);
    expect(d.weightDeltaKg).toBeNull();
    expect(d.avgCalories).toBeNull();
    expect(d.avgProteinG).toBeNull();
    expect(d.caloriePct).toBeNull();
    expect(d.workoutCount).toBe(0);
    expect(d.tonnageKg).toBe(0);
    expect(d.avgWaterMl).toBeNull();
  });

  it("дельта веса: последняя − первая запись окна, по возрастанию дат", () => {
    const d = buildWeeklyDigest(
      input({
        weightRows: [
          { date: "2026-08-05", weightKg: 84.5 },
          { date: "2026-08-09", weightKg: 83.9 },
          { date: "2026-08-03", weightKg: 85.0 },
        ],
      }),
    );
    expect(d.weightStartKg).toBe(85.0);
    expect(d.weightEndKg).toBe(83.9);
    expect(d.weightDeltaKg).toBeCloseTo(-1.1);
  });

  it("одна запись веса — дельта null (нет с чем сравнить)", () => {
    const d = buildWeeklyDigest(
      input({ weightRows: [{ date: "2026-08-09", weightKg: 84.5 }] }),
    );
    expect(d.weightStartKg).toBe(84.5);
    expect(d.weightEndKg).toBeNull();
    expect(d.weightDeltaKg).toBeNull();
  });

  it("средние калории/белок считаются только по дням с записями", () => {
    const d = buildWeeklyDigest(
      input({
        mealRows: [
          { date: "2026-08-03", calories: 1800, protein: 120 },
          { date: "2026-08-03", calories: 200, protein: 10 },
          { date: "2026-08-05", calories: 2200, protein: 150 },
        ],
      }),
    );
    // Пропущенные дни (4 из 7) не считаются как «0 ккал».
    expect(d.avgCalories).toBeCloseTo(2100);
    expect(d.avgProteinG).toBeCloseTo(140);
    expect(d.caloriePct).toBe(Math.round((2100 / 2200) * 100));
    expect(d.trackedDays).toBe(2);
  });

  it("caloriePct null без цели", () => {
    const d = buildWeeklyDigest(
      input({
        calorieTarget: null,
        mealRows: [{ date: "2026-08-03", calories: 1800, protein: 100 }],
      }),
    );
    expect(d.avgCalories).toBe(1800);
    expect(d.caloriePct).toBeNull();
  });

  it("тренировки: число и суммарный тоннаж", () => {
    const d = buildWeeklyDigest(
      input({
        workoutRows: [
          { date: "2026-08-04", workoutName: "День 1", tonnageKg: 600 },
          { date: "2026-08-06", workoutName: "День 2", tonnageKg: 1200 },
        ],
      }),
    );
    expect(d.workoutCount).toBe(2);
    expect(d.tonnageKg).toBe(1800);
  });

  it("вода: среднее по дням с записями", () => {
    const d = buildWeeklyDigest(
      input({
        waterRows: [
          { date: "2026-08-03", amountMl: 1500 },
          { date: "2026-08-04", amountMl: 2500 },
        ],
      }),
    );
    expect(d.avgWaterMl).toBeCloseTo(2000);
  });

  it("trackedDays — объединение дней всех типов записей", () => {
    const d = buildWeeklyDigest(
      input({
        weightRows: [{ date: "2026-08-03", weightKg: 80 }],
        mealRows: [{ date: "2026-08-03", calories: 1, protein: 1 }],
        workoutRows: [{ date: "2026-08-08", workoutName: "x", tonnageKg: 1 }],
        waterRows: [{ date: "2026-08-09", amountMl: 1 }],
      }),
    );
    expect(d.trackedDays).toBe(3);
    expect(d.hasData).toBe(true);
  });
});

describe("рендер письма", () => {
  const digest = buildWeeklyDigest(
    input({
      weightRows: [
        { date: "2026-08-03", weightKg: 84.5 },
        { date: "2026-08-09", weightKg: 83.9 },
      ],
      mealRows: [{ date: "2026-08-03", calories: 1900, protein: 130 }],
      workoutRows: [{ date: "2026-08-04", workoutName: "День 1", tonnageKg: 600 }],
      waterRows: [{ date: "2026-08-03", amountMl: 2000 }],
    }),
  );

  it("digestLines: осмысленные строки с ru-форматом чисел", () => {
    const lines = digestLines(digest, { name: "Алиса" });
    expect(lines[0]).toBe("Привет, Алиса! Ваша неделя в КИЛО:");
    expect(lines).toContain("⚖️ Вес: −0,6 кг (84,5 → 83,9)");
    expect(lines).toContain("🍽 Калории в среднем: 1900 ккал/день — 86% цели");
    expect(lines).toContain("🥩 Белок в среднем: 130 г/день");
    expect(lines).toContain("🏋️ Тренировок: 1 (тоннаж 600 кг)");
    expect(lines).toContain("💧 Вода в среднем: 2,0 л/день");
    expect(lines).toContain("📅 Активных дней: 3 из 7");
  });

  it("renderDigestText: склейка строк", () => {
    const text = renderDigestText(digest);
    expect(text).toContain("Вес: −0,6 кг");
    expect(text).toContain("Активных дней: 3 из 7");
  });

  it("renderDigestHtml: экранирует имя пользователя", () => {
    const html = renderDigestHtml(
      { ...digest, hasData: true },
      { name: "<script>alert(1)</script>" },
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("buildWeeklyInsight — AI-разбор недели", () => {
  it("пустое окно: призыв начать с малого", () => {
    const d = buildWeeklyDigest(input());
    expect(buildWeeklyInsight(d)).toContain("записей пока нет");
  });

  it("похудение ≥ 0,5 кг: похвала с советом по белку", () => {
    const d = buildWeeklyDigest(
      input({
        weightRows: [
          { date: "2026-08-03", weightKg: 84.5 },
          { date: "2026-08-09", weightKg: 83.8 },
        ],
      }),
    );
    const text = buildWeeklyInsight(d);
    expect(text).toContain("0,7 кг");
    expect(text).toContain("белок");
  });

  it("набор веса ≥ 0,5 кг: без паники, смотреть на тренд", () => {
    const d = buildWeeklyDigest(
      input({
        weightRows: [
          { date: "2026-08-03", weightKg: 83.0 },
          { date: "2026-08-09", weightKg: 84.0 },
        ],
      }),
    );
    expect(buildWeeklyInsight(d)).toContain("1,0 кг");
    expect(buildWeeklyInsight(d)).toContain("тренд");
  });

  it("перебор калорий > 120% цели: совет про перекусы", () => {
    const d = buildWeeklyDigest(
      input({
        mealRows: [{ date: "2026-08-03", calories: 2700, protein: 100 }],
      }),
    );
    const text = buildWeeklyInsight(d);
    expect(text).toContain("123% от цели");
    expect(text).toContain("перекусов");
  });

  it("недобор калорий < 70% цели: про замедление прогресса", () => {
    const d = buildWeeklyDigest(
      input({
        mealRows: [{ date: "2026-08-03", calories: 1400, protein: 90 }],
      }),
    );
    const text = buildWeeklyInsight(d);
    expect(text).toContain("64% от цели");
    expect(text).toContain("недобор");
  });

  it("без тренировок (при питании в норме): призыв к одной сессии", () => {
    const d = buildWeeklyDigest(
      input({
        mealRows: [{ date: "2026-08-03", calories: 1900, protein: 120 }],
      }),
    );
    const text = buildWeeklyInsight(d);
    expect(text).toContain("Тренировок за неделю не было");
    expect(text).toContain("одной короткой сессии");
  });

  it("мало воды (< 70% цели): совет про бутылку на столе", () => {
    const d = buildWeeklyDigest(
      input({
        mealRows: [{ date: "2026-08-03", calories: 1900, protein: 120 }],
        workoutRows: [{ date: "2026-08-04", workoutName: "День 1", tonnageKg: 600 }],
        waterRows: [{ date: "2026-08-03", amountMl: 1000 }],
      }),
    );
    const text = buildWeeklyInsight(d);
    expect(text).toContain("1,0 л/день");
    expect(text).toContain("бутылку на стол");
  });

  it("учитывает кастомную цель по воде из opts", () => {
    // 1500 мл при цели 3000 — это 50%: ветка воды должна сработать,
    // хотя при дефолтной цели 2000 это были бы «нормальные» 75%.
    const d = buildWeeklyDigest(
      input({
        mealRows: [{ date: "2026-08-03", calories: 1900, protein: 120 }],
        workoutRows: [{ date: "2026-08-04", workoutName: "День 1", tonnageKg: 600 }],
        waterRows: [{ date: "2026-08-03", amountMl: 1500 }],
      }),
    );
    expect(buildWeeklyInsight(d, { waterTargetMl: 3000 })).toContain("ниже цели");
  });

  it("мало активных дней: про привычку фиксировать хотя бы воду", () => {
    const d = buildWeeklyDigest(
      input({
        mealRows: [{ date: "2026-08-03", calories: 2000, protein: 120 }],
        workoutRows: [{ date: "2026-08-04", workoutName: "День 1", tonnageKg: 600 }],
        waterRows: [{ date: "2026-08-03", amountMl: 2000 }],
      }),
    );
    const text = buildWeeklyInsight(d);
    expect(text).toContain("Активных дней 2 из 7");
    expect(text).toContain("привычку");
  });

  it("полная неделя: похвала за последовательность", () => {
    const dates = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"];
    const d = buildWeeklyDigest(
      input({
        weightRows: [
          { date: "2026-08-03", weightKg: 84.0 },
          { date: "2026-08-09", weightKg: 83.8 }, // −0,2 кг — вне порога 0,5
        ],
        mealRows: dates.map((date) => ({ date, calories: 2000, protein: 130 })),
        workoutRows: [{ date: "2026-08-05", workoutName: "День 1", tonnageKg: 800 }],
        waterRows: dates.map((date) => ({ date, amountMl: 2000 })),
      }),
    );
    const text = buildWeeklyInsight(d);
    expect(text).toContain("Отличная неделя");
    expect(text).toContain("последовательность");
  });
});

describe("buildNextWeekPlan — следующий шаг недели", () => {
  it("без данных — призыв начать с малого", () => {
    const d = buildWeeklyDigest(input());
    expect(buildNextWeekPlan(d)).toContain("Начните с малого");
  });

  it("вес вырос ≥0,5 кг — лёгкий дефицит и шаги", () => {
    const d = buildWeeklyDigest(
      input({
        weightRows: [
          { date: "2026-07-06", weightKg: 80 },
          { date: "2026-07-12", weightKg: 80.6 },
        ],
      }),
    );
    expect(buildNextWeekPlan(d)).toContain("дефиците");
    expect(buildNextWeekPlan(d)).toContain("8–10 тыс. шагов");
  });

  it("недобор тренировок — план на конкретные дни", () => {
    const d = buildWeeklyDigest(
      input({
        workoutRows: [
          { date: "2026-07-08", workoutName: "Фулбоди", tonnageKg: 4000 },
        ],
      }),
    );
    expect(buildNextWeekPlan(d, { trainingTarget: 3 })).toContain(
      "Проведите 3 тренировки — например, Пн / Ср / Пт",
    );
  });

  it("мало белка при выполненных тренировках — прибавить к среднему", () => {
    const d = buildWeeklyDigest(
      input({
        mealRows: [
          { date: "2026-07-08", calories: 2000, protein: 100 },
        ],
        workoutRows: [
          { date: "2026-07-06", workoutName: "A", tonnageKg: 1000 },
          { date: "2026-07-08", workoutName: "B", tonnageKg: 1000 },
          { date: "2026-07-10", workoutName: "C", tonnageKg: 1000 },
        ],
      }),
    );
    const plan = buildNextWeekPlan(d, { trainingTarget: 3, proteinTargetG: 150 });
    expect(plan).toContain("Увеличьте белок до 150 г в день");
    expect(plan).toContain("+50 г к среднему");
  });

  it("мало воды — цель и текущий средний", () => {
    const d = buildWeeklyDigest(
      input({
        workoutRows: [
          { date: "2026-07-06", workoutName: "A", tonnageKg: 1000 },
          { date: "2026-07-08", workoutName: "B", tonnageKg: 1000 },
          { date: "2026-07-10", workoutName: "C", tonnageKg: 1000 },
        ],
        waterRows: [{ date: "2026-07-08", amountMl: 1500 }],
      }),
    );
    const plan = buildNextWeekPlan(d, { waterTargetMl: 2000 });
    expect(plan).toContain("Пейте 2,0 л воды в день");
    expect(plan).toContain("сейчас в среднем 1,5 л");
  });

  it("перебор калорий при выполненных тренировках — удержать калории", () => {
    const d = buildWeeklyDigest(
      input({
        mealRows: [{ date: "2026-07-08", calories: 3000, protein: 150 }],
        workoutRows: [
          { date: "2026-07-06", workoutName: "A", tonnageKg: 1000 },
          { date: "2026-07-08", workoutName: "B", tonnageKg: 1000 },
          { date: "2026-07-10", workoutName: "C", tonnageKg: 1000 },
        ],
      }),
    );
    expect(buildNextWeekPlan(d, { trainingTarget: 3 })).toContain(
      "Удержите калории в цели",
    );
  });

  it("всё в порядке — удержать темп", () => {
    const d = buildWeeklyDigest(
      input({
        mealRows: [{ date: "2026-07-08", calories: 2100, protein: 140 }],
        workoutRows: [
          { date: "2026-07-06", workoutName: "A", tonnageKg: 1000 },
          { date: "2026-07-08", workoutName: "B", tonnageKg: 1000 },
          { date: "2026-07-10", workoutName: "C", tonnageKg: 1000 },
        ],
        waterRows: [{ date: "2026-07-08", amountMl: 2500 }],
      }),
    );
    const plan = buildNextWeekPlan(d, {
      trainingTarget: 3,
      waterTargetMl: 2000,
      proteinTargetG: 140,
    });
    expect(plan).toContain("Удерживайте текущий темп");
  });
});
