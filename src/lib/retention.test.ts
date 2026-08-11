import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  computeRetentionMetrics,
  dayKey,
  isActivated,
  type AnalyticsEvent,
} from "./retention";

const DAY = 86_400_000;
// Полдень 2026-07-01 UTC — опорная точка; события со смещением «.5 дня»,
// чтобы не попадать ровно на границы окон DAU/WAU/MAU.
const T0 = Date.UTC(2026, 6, 1, 12, 0, 0);

function ev(userId: string, name: string, dayOffset: number): AnalyticsEvent {
  // Дробная часть даёт полдень/полночь смещения: 34.5 дня = день 34 + 12ч,
  // чтобы не попадать ровно на границы окон DAU/WAU/MAU.
  return { userId, name, ts: T0 + dayOffset * DAY };
}

describe("dayKey / addDaysToKey", () => {
  it("переводит ts в ключ дня и обратно", () => {
    expect(dayKey(T0)).toBe("2026-07-01");
    expect(addDaysToKey("2026-07-01", 7)).toBe("2026-07-08");
  });
});

describe("isActivated", () => {
  it("активация = онбординг + первое полезное действие", () => {
    const events = [
      ev("u1", "onboarding_completed", 0),
      ev("u1", "workout_completed", 0),
      ev("u2", "onboarding_completed", 0),
      ev("u2", "today_opened", 0),
      ev("u3", "meal_added", 0),
    ];
    expect(isActivated(events, "u1")).toBe(true);
    // Онбординг без полезного действия — не активация.
    expect(isActivated(events, "u2")).toBe(false);
    // Полезное действие без онбординга — не активация.
    expect(isActivated(events, "u3")).toBe(false);
  });
});

describe("computeRetentionMetrics", () => {
  // «Сейчас» — 2026-08-05 12:00 UTC (35 полных дней от T0).
  const now = T0 + 35 * DAY;

  it("считает DAU/WAU/MAU по уникальным пользователям", () => {
    const events = [
      ev("u1", "today_opened", 34.5), // вчера — в DAU/WAU/MAU
      ev("u2", "meal_added", 5.5), // в MAU, вне WAU
      ev("u3", "workout_completed", 0.5), // вне всех окон (в прошлом)
    ];
    const m = computeRetentionMetrics(events, now);
    expect(m.dau).toBe(1);
    expect(m.wau).toBe(1);
    expect(m.mau).toBe(2);
  });

  it("считает активацию по доле активированных", () => {
    const events = [
      ev("u1", "onboarding_completed", 0),
      ev("u1", "meal_added", 0),
      ev("u2", "onboarding_completed", 0),
      ev("u2", "today_opened", 0),
      ev("u3", "today_opened", 0),
    ];
    const m = computeRetentionMetrics(events, now);
    expect(m.activated).toBe(1);
    expect(m.totalUsers).toBe(3);
    expect(m.activationRate).toBeCloseTo(1 / 3);
  });

  it("когортный retention: возврат на D1/D7 по первому дню активности", () => {
    const events = [
      // u1: старт в день 0, вернулся в день 1 и день 7.
      ev("u1", "today_opened", 0),
      ev("u1", "today_opened", 1),
      ev("u1", "meal_added", 7),
      // u2: старт в день 0, не вернулся.
      ev("u2", "today_opened", 0),
    ];
    const m = computeRetentionMetrics(events, now);
    // Когорта дня 0 = {u1, u2}: D1 = 1/2, D7 = 1/2.
    expect(m.retention.d1).toBeCloseTo(0.5);
    expect(m.retention.d7).toBeCloseTo(0.5);
    // D14/D30 когорты созрели, никто не вернулся.
    expect(m.retention.d14).toBe(0);
    expect(m.retention.d30).toBe(0);
  });

  it("несозревшие когорты дают null (окно короче оффсета)", () => {
    const events = [ev("u1", "today_opened", 0)];
    const m = computeRetentionMetrics(events, T0 + 2 * DAY);
    // D1: цель (день 1) уже наступила → 0; D3+ ещё не созрели → null.
    expect(m.retention.d1).toBe(0);
    expect(m.retention.d3).toBeNull();
    expect(m.retention.d7).toBeNull();
    expect(m.retention.d30).toBeNull();
  });

  it("activated→D7: только активированные в знаменателе (главный KPI)", () => {
    const events = [
      // Активирован (онбординг + тренировка) и вернулся на D7.
      ev("u1", "onboarding_completed", 0),
      ev("u1", "workout_completed", 0),
      ev("u1", "today_opened", 7),
      // Активирован (онбординг + еда), но на D7 не вернулся.
      ev("u2", "onboarding_completed", 0),
      ev("u2", "meal_added", 0),
      // Не активирован (только открытия), но вернулся на D7 — в KPI не входит.
      ev("u3", "today_opened", 0),
      ev("u3", "today_opened", 7),
    ];
    const m = computeRetentionMetrics(events, now);
    // Общий D7 = 2/3, а вот «активация → привычка» = 1/2.
    expect(m.retention.d7).toBeCloseTo(2 / 3);
    expect(m.activatedD7).toBeCloseTo(0.5);
  });

  it("activated→D7: null, пока когорта не созрела", () => {
    const events = [
      ev("u1", "onboarding_completed", 0),
      ev("u1", "meal_added", 0),
    ];
    const m = computeRetentionMetrics(events, T0 + 2 * DAY);
    expect(m.activated).toBe(1);
    expect(m.activatedD7).toBeNull();
  });

  it("activated→D7: без активированных — null", () => {
    const events = [ev("u1", "today_opened", 0), ev("u1", "today_opened", 7)];
    const m = computeRetentionMetrics(events, now);
    expect(m.activated).toBe(0);
    expect(m.activatedD7).toBeNull();
  });
});
