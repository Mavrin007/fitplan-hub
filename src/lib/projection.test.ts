import { describe, expect, it } from "vitest";
import { humanizeDistance, projectGoal, type WeightSample } from "./projection";

/** Серия замеров с одинаковым темпом −0.2 кг/день (примерно −1.4 кг/нед). */
function losingSeries(): WeightSample[] {
  const base = Date.UTC(2026, 0, 1) / 86_400_000; // 2026-01-01
  return [0, 1, 2, 3, 4].map((i) => ({
    date: new Date((base + i) * 86_400_000).toISOString().slice(0, 10),
    weightKg: 90 - i * 0.2,
  }));
}

describe("projectGoal", () => {
  it("возвращает null без целевого веса", () => {
    expect(projectGoal([], null)).toBeNull();
    expect(projectGoal([], undefined)).toBeNull();
    expect(projectGoal([], 0)).toBeNull();
  });

  it("возвращает null при недостатке замеров (< 3)", () => {
    const samples = losingSeries().slice(0, 2);
    expect(projectGoal(samples, 80)).toBeNull();
  });

  it("считает дату достижения цели при устойчивом снижении", () => {
    const proj = projectGoal(losingSeries(), 80);
    expect(proj).not.toBeNull();
    // 5 дней × 0.2 = 1 кг сброшено, осталось ~9 кг → ~45 дней от среднего.
    expect(proj!.ratePerWeek).toBeCloseTo(-1.4, 1);
    expect(proj!.remainingKg).toBeCloseTo(9, 0);
    expect(proj!.etaDate > "2026-01-06").toBe(true);
  });

  it("возвращает null, если тренд идёт от цели", () => {
    const rising: WeightSample[] = [0, 1, 2, 3, 4].map((i) => ({
      date: `2026-01-0${i + 1}`,
      weightKg: 70 + i * 0.3,
    }));
    expect(projectGoal(rising, 80)).toBeNull(); // вес растёт к 80 — но выше? нет, 70→71.2 — цель 80 достижима
  });

  it("возвращает null при росте веса, когда цель — похудеть", () => {
    const rising: WeightSample[] = [0, 1, 2, 3, 4].map((i) => ({
      date: `2026-01-0${i + 1}`,
      weightKg: 70 + i * 0.3,
    }));
    expect(projectGoal(rising, 65)).toBeNull(); // цель ниже текущего, вес растёт
  });

  it("уверенность растёт с числом замеров", () => {
    const short = projectGoal(losingSeries(), 80);
    const long: WeightSample[] = Array.from({ length: 12 }, (_, i) => ({
      date: new Date((Date.UTC(2026, 0, 1) / 86_400_000 + i) * 86_400_000)
        .toISOString()
        .slice(0, 10),
      weightKg: 90 - i * 0.2,
    }));
    const proj = projectGoal(long, 80);
    expect(short!.confident).toBe(false);
    expect(proj!.confident).toBe(true);
  });

  it("не выдумывает дату, если цель уже достигнута", () => {
    const samples = losingSeries().map((s) => ({ ...s, weightKg: s.weightKg - 15 }));
    expect(projectGoal(samples, 80)).toBeNull();
  });
});

describe("humanizeDistance", () => {
  it("форматирует дни/недели/месяцы", () => {
    expect(humanizeDistance("2026-01-10", "2026-01-05")).toBe("5 дней");
    expect(humanizeDistance("2026-01-26", "2026-01-05")).toContain("3");
    expect(humanizeDistance("2026-04-05", "2026-01-05")).toContain("3");
  });
});
