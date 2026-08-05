import { describe, expect, it } from "vitest";
import {
  computeBmr,
  computeTargets,
  computeTdee,
  GOAL_ADJUSTMENTS,
  waterGoal,
  type ProfileInput,
} from "./nutrition";

function p(overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    age: 30,
    gender: "male",
    heightCm: 180,
    weightKg: 80,
    activityLevel: "moderate",
    fitnessGoal: "maintain",
    ...overrides,
  };
}

describe("computeBmr — Миффлин–Сан Жеор", () => {
  it("мужчина: 10×вес + 6.25×рост − 5×возраст + 5", () => {
    // 10×80 + 6.25×180 − 5×30 + 5 = 800 + 1125 − 150 + 5 = 1780
    expect(computeBmr(p())).toBeCloseTo(1780, 0);
  });

  it("женщина: −161 вместо +5", () => {
    // 800 + 1125 − 150 − 161 = 1614
    expect(computeBmr(p({ gender: "female" }))).toBeCloseTo(1614, 0);
  });
});

describe("computeTdee — множитель активности", () => {
  it("умеренная активность ×1.55", () => {
    expect(computeTdee(p())).toBeCloseTo(1780 * 1.55, 0);
  });

  it("сидячий образ жизни ×1.2", () => {
    expect(computeTdee(p({ activityLevel: "sedentary" }))).toBeCloseTo(
      1780 * 1.2,
      0,
    );
  });
});

describe("computeTargets — дефицит/профицит по цели", () => {
  it("похудение: −15% от TDEE", () => {
    const t = computeTargets(p({ fitnessGoal: "lose_weight" }));
    const tdee = computeTdee(p({ fitnessGoal: "lose_weight" }));
    expect(t.calories).toBeCloseTo(tdee * (1 + GOAL_ADJUSTMENTS.lose_weight), 0);
  });

  it("набор массы: +10% от TDEE", () => {
    const t = computeTargets(p({ fitnessGoal: "gain_muscle" }));
    const tdee = computeTdee(p({ fitnessGoal: "gain_muscle" }));
    expect(t.calories).toBeCloseTo(tdee * (1 + GOAL_ADJUSTMENTS.gain_muscle), 0);
  });

  it("поддержание: калории = TDEE", () => {
    const t = computeTargets(p());
    expect(t.calories).toBeCloseTo(t.bmr * 1.55, 0);
  });

  it("белки при наборе — 2 г/кг, при похудении — 1.9 г/кг", () => {
    const gain = computeTargets(p({ fitnessGoal: "gain_muscle", weightKg: 80 }));
    expect(gain.protein).toBe(160); // 2 × 80
    const lose = computeTargets(p({ fitnessGoal: "lose_weight", weightKg: 80 }));
    expect(lose.protein).toBe(152); // 1.9 × 80
  });

  it("сила: калории на поддержании, белки 1.8 г/кг", () => {
    const t = computeTargets(p({ fitnessGoal: "strength", weightKg: 80 }));
    expect(t.protein).toBe(144); // 1.8 × 80
    const tdee = computeTdee(p({ fitnessGoal: "strength", weightKg: 80 }));
    expect(t.calories).toBeCloseTo(tdee, 0); // GOAL_ADJUSTMENTS.strength = 0
  });

  it("макросы согласованы с калориями (4+4+9 ккал/г)", () => {
    const t = computeTargets(p());
    const fromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    // Из-за округлений допускаем небольшую погрешность.
    expect(Math.abs(fromMacros - t.calories)).toBeLessThanOrEqual(30);
  });
});

describe("waterGoal", () => {
  it("80 кг → 2750 мл (round(80·33/250)·250)", () => {
    expect(waterGoal(80)).toBe(2750);
  });

  it("95 кг → round(95·33/250)·250 = round(12.54)·250 = 3250 мл", () => {
    expect(waterGoal(95)).toBe(3250);
  });

  it("маленький вес не опускается ниже минимума 1500 мл", () => {
    // 40 кг → round(40·33/250)·250 = 1250 < 1500 → 1500.
    expect(waterGoal(40)).toBe(1500);
    // Экстремальный случай тоже.
    expect(waterGoal(1)).toBe(1500);
  });

  it("всегда кратно 250", () => {
    for (const w of [55, 62.5, 77.3, 100, 120]) {
      expect(waterGoal(w) % 250).toBe(0);
    }
  });
});
