/**
 * Юнит-тесты чистой логики недельной сводки (src/lib/digest.ts) — без
 * Convex-рантайма, как effort/projection/export: агрегация строк в
 * WeeklyDigest и рендер текста/HTML письма. Реальные запросы к БД и
 * отправку покрывает src/convex/digest.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  buildWeeklyDigest,
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
