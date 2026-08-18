import { describe, expect, it } from "vitest";
import {
  buildWorkoutSummary,
  loadEquipmentFor,
  parseRepsRange,
  recommendLoad,
  shiftAvailableWeight,
  type LastExerciseEntry,
} from "./workoutIntelligence";

describe("loadEquipmentFor", () => {
  it("определяет оборудование из каталога, при вариантах — отягощённый снаряд", () => {
    expect(loadEquipmentFor("Приседания со штангой")).toBe("barbell");
    expect(loadEquipmentFor("Жим лёжа")).toBe("barbell"); // barbell + dumbbell → штанга
    expect(loadEquipmentFor("Жим гантелей под наклоном")).toBe("dumbbell");
    expect(loadEquipmentFor("Махи гирей")).toBe("kettlebell");
    expect(loadEquipmentFor("Жим ногами")).toBe("machine");
    expect(loadEquipmentFor("Тяга верхнего блока")).toBe("machine"); // machine + cable → тренажёр
    expect(loadEquipmentFor("Отжимания")).toBe("bodyweight");
    expect(loadEquipmentFor("Неизвестное упражнение")).toBe("unknown");
  });
});

describe("shiftAvailableWeight", () => {
  it("гантели шагают по реальному ряду: 20 → 22.5, 22.5 → 20", () => {
    expect(shiftAvailableWeight("dumbbell", 20, 1, 2.5)).toBe(22.5);
    expect(shiftAvailableWeight("dumbbell", 22.5, -1, 2.5)).toBe(20);
  });

  it("гири шагают по стандартному ряду: 20 → 24, 24 → 20", () => {
    expect(shiftAvailableWeight("kettlebell", 20, 1, 2.5)).toBe(24);
    expect(shiftAvailableWeight("kettlebell", 24, -1, 2.5)).toBe(20);
  });

  it("штанга шагает по 2.5 кг и не опускается ниже грифа", () => {
    expect(shiftAvailableWeight("barbell", 70, 1, 20)).toBe(72.5);
    expect(shiftAvailableWeight("barbell", 21, -1, 20)).toBe(20);
  });

  it("собственный вес не меняется, направление 0 возвращает текущий вес", () => {
    expect(shiftAvailableWeight("bodyweight", 70, 1, 2.5)).toBeUndefined();
    expect(shiftAvailableWeight("dumbbell", 20, 0, 2.5)).toBe(20);
  });
});

describe("parseRepsRange", () => {
  it("разбирает диапазон и одинарное число", () => {
    expect(parseRepsRange("8-12")).toEqual([8, 12]);
    expect(parseRepsRange("8–12")).toEqual([8, 12]);
    expect(parseRepsRange("10")).toEqual([8, 10]);
  });

  it("возвращает null для повторов «на время»", () => {
    expect(parseRepsRange("30s")).toBeNull();
  });
});

describe("recommendLoad", () => {
  const last = (over: Partial<LastExerciseEntry> = {}): LastExerciseEntry => ({
    weightKg: 70,
    reps: 10,
    ...over,
  });

  it("не выдаёт рекомендацию без данных прошлой тренировки", () => {
    const rec = recommendLoad({ name: "Приседания со штангой", planReps: "8-10", planWeightKg: 60 });
    expect(rec.kind).toBe("new");
    expect(rec.reasoning).toContain("Нет данных");
  });

  describe("штанга: шаг 2.5 кг", () => {
    it("RPE ≤ 7 → +2.5 кг с обоснованием", () => {
      const rec = recommendLoad({
        name: "Приседания со штангой",
        planReps: "8-10",
        last: last({ rpe: 7 }),
      });
      expect(rec.kind).toBe("up");
      expect(rec.weightKg).toBe(72.5);
      expect(rec.repsMin).toBe(8);
      expect(rec.repsMax).toBe(10);
      expect(rec.stepLabel).toBe("добавь 2.5 кг");
      expect(rec.reasoning).toContain("70 кг × 10");
      expect(rec.reasoning).toContain("RPE 7");
      expect(rec.reasoning).toContain("72.5 кг");
    });

    it("RPE 8 → вес сохраняем", () => {
      const rec = recommendLoad({
        name: "Приседания со штангой",
        planReps: "8-10",
        last: last({ rpe: 8 }),
      });
      expect(rec.kind).toBe("keep");
      expect(rec.weightKg).toBe(70);
      expect(rec.stepLabel).toBe("сохрани вес");
    });

    it("RPE 9–10 → вес не увеличиваем (пример: 80×8 @ RPE 10 → 80)", () => {
      for (const rpe of [9, 10]) {
        const rec = recommendLoad({
          name: "Приседания со штангой",
          planReps: "8",
          last: last({ weightKg: 80, reps: 8, rpe }),
        });
        expect(rec.kind).toBe("keep");
        expect(rec.weightKg).toBe(80);
      }
    });

    it("без RPE фолбэк по усилию: легко → вверх, тяжело → вниз", () => {
      const up = recommendLoad({
        name: "Приседания со штангой",
        planReps: "8-10",
        last: last(),
        effort: "easy",
      });
      expect(up.kind).toBe("up");
      expect(up.weightKg).toBe(72.5);

      const down = recommendLoad({
        name: "Приседания со штангой",
        planReps: "8-10",
        last: last(),
        effort: "hard",
      });
      expect(down.kind).toBe("down");
      expect(down.weightKg).toBe(67.5);
    });

    it("штанговые упражнения не опускаются ниже грифа (20 кг)", () => {
      const rec = recommendLoad({
        name: "Приседания со штангой",
        planReps: "8-10",
        last: last({ weightKg: 20, rpe: 10 }),
        effort: "hard",
      });
      expect(rec.weightKg).toBeGreaterThanOrEqual(20);
    });
  });

  describe("гантели: реальный доступный вес из набора", () => {
    it("20 кг × 12 @ RPE 7 → 22.5 кг (пример пользователя)", () => {
      const rec = recommendLoad({
        name: "Жим гантелей под наклоном",
        planReps: "10-12",
        last: { weightKg: 20, reps: 12, rpe: 7 },
      });
      expect(rec.kind).toBe("up");
      expect(rec.weightKg).toBe(22.5);
      expect(rec.stepLabel).toBe("следующий вес гантелей");
      expect(rec.reasoning).toContain("22.5 кг");
    });

    it("10 кг × 12 @ RPE 9 → 10 кг, вес не поднимаем", () => {
      const rec = recommendLoad({
        name: "Жим гантелей под наклоном",
        planReps: "10-12",
        last: { weightKg: 10, reps: 12, rpe: 9 },
      });
      expect(rec.kind).toBe("keep");
      expect(rec.weightKg).toBe(10);
    });

    it("гантели не прыгают с 10 на 12.5 — в наборе есть 12", () => {
      const rec = recommendLoad({
        name: "Жим гантелей под наклоном",
        planReps: "10-12",
        last: { weightKg: 10, reps: 12, rpe: 7 },
      });
      expect(rec.weightKg).toBe(12);
    });

    it("снижение идёт по лестнице вниз (по усилию, без RPE)", () => {
      const rec = recommendLoad({
        name: "Жим гантелей под наклоном",
        planReps: "10-12",
        last: { weightKg: 22.5, reps: 8 },
        effort: "hard",
      });
      expect(rec.kind).toBe("down");
      expect(rec.weightKg).toBe(20);
    });
  });

  describe("гири: стандартный ряд", () => {
    it("20 кг @ RPE 7 → следующая гиря 24 кг", () => {
      const rec = recommendLoad({
        name: "Махи гирей",
        planReps: "10-15",
        last: { weightKg: 20, reps: 15, rpe: 7 },
      });
      expect(rec.kind).toBe("up");
      expect(rec.weightKg).toBe(24);
      expect(rec.stepLabel).toBe("следующая гиря");
    });
  });

  describe("тренажёр/блок: шаг 2.5 кг", () => {
    it("двойная прогрессия: повторы в середине диапазона → вес сохраняем, +1 повтор", () => {
      const rec = recommendLoad({
        name: "Жим ногами",
        planReps: "10-15",
        last: { weightKg: 80, reps: 12, rpe: 7 },
      });
      // 12 < 15 — «сначала повторы, потом вес»: тот же вес, цель 13–15.
      expect(rec.kind).toBe("keep");
      expect(rec.weightKg).toBe(80);
      expect(rec.repsMin).toBe(13);
      expect(rec.repsMax).toBe(15);
      expect(rec.stepLabel).toBe("сохрани вес");
      expect(rec.reasoning).toContain("добираем повторы");
    });

    it("повторы на верхней планке диапазона → следующий вес по оборудованию", () => {
      const rec = recommendLoad({
        name: "Жим ногами",
        planReps: "10-15",
        last: { weightKg: 80, reps: 15, rpe: 7 },
      });
      expect(rec.kind).toBe("up");
      expect(rec.weightKg).toBe(82.5);
      expect(rec.repsMin).toBe(10);
      expect(rec.repsMax).toBe(15);
    });
  });

  describe("двойная прогрессия: повторы → вес", () => {
    it("RPE 8: 70 × 8 @8 → 70 × 9–10 (добираем повторы на том же весе)", () => {
      const rec = recommendLoad({
        name: "Приседания со штангой",
        planReps: "8-10",
        last: { weightKg: 70, reps: 8, rpe: 8 },
      });
      expect(rec.kind).toBe("keep");
      expect(rec.weightKg).toBe(70);
      expect(rec.repsMin).toBe(9);
      expect(rec.repsMax).toBe(10);
      expect(rec.reasoning).toContain("добираем повторы");
    });

    it("RPE 7 в середине диапазона: 70 × 9 @7 (8-12) → 70 × 10–12", () => {
      const rec = recommendLoad({
        name: "Приседания со штангой",
        planReps: "8-12",
        last: { weightKg: 70, reps: 9, rpe: 7 },
      });
      expect(rec.kind).toBe("keep");
      expect(rec.weightKg).toBe(70);
      expect(rec.repsMin).toBe(10);
      expect(rec.repsMax).toBe(12);
    });

    it("упражнение не получилось: 70 × 7 @10 (план 8-10) → повторяем 70 × 8–10, не штрафуем", () => {
      const rec = recommendLoad({
        name: "Приседания со штангой",
        planReps: "8-10",
        last: { weightKg: 70, reps: 7, rpe: 10 },
      });
      expect(rec.kind).toBe("keep");
      expect(rec.weightKg).toBe(70);
      // Цель — диапазон плана, а не «70 × 7»: подход повторяется без штрафа.
      expect(rec.repsMin).toBe(8);
      expect(rec.repsMax).toBe(10);
      expect(rec.reasoning).toContain("повторяем результат");
    });

    it("RPE 9 на плане «8»: 80 × 8 @9 → 80 × 8 (цель — фактический результат)", () => {
      const rec = recommendLoad({
        name: "Приседания со штангой",
        planReps: "8",
        last: { weightKg: 80, reps: 8, rpe: 9 },
      });
      expect(rec.kind).toBe("keep");
      expect(rec.weightKg).toBe(80);
      expect(rec.repsMin).toBe(8);
      expect(rec.repsMax).toBe(8);
    });
  });

  describe("собственный вес: вес не меняется, прогресс через повторы", () => {
    it("отжимания 12 повторов @ RPE 7 → вес не указываем, повторы +1", () => {
      const rec = recommendLoad({
        name: "Отжимания",
        planReps: "10-12",
        last: { weightKg: 0, reps: 12, rpe: 7 },
      });
      expect(rec.kind).toBe("up");
      expect(rec.weightKg).toBeUndefined();
      expect(rec.stepLabel).toBe("добавь повторы");
      expect(rec.repsMin).toBe(11);
      expect(rec.repsMax).toBe(13);
      expect(rec.reasoning).toContain("повтор");
    });

    it("bodyweight без веса в логе всё равно даёт рекомендацию по повторам", () => {
      const rec = recommendLoad({
        name: "Планка",
        planReps: "30s",
        last: { weightKg: 0 },
        effort: "normal",
      });
      expect(rec.kind).toBe("keep");
      expect(rec.weightKg).toBeUndefined();
    });

    it("тяжело → облегчить подход, вес не меняется", () => {
      const rec = recommendLoad({
        name: "Отжимания",
        planReps: "10-12",
        last: { weightKg: 0, reps: 12, rpe: 10 },
        effort: "hard",
      });
      expect(rec.kind).toBe("keep");
      expect(rec.stepLabel).toBe("сохрани подход");
    });
  });

  it("одинарный диапазон повторов даёт буфер ниже планки", () => {
    const rec = recommendLoad({
      name: "Приседания со штангой",
      planReps: "10",
      last: last({ rpe: 7 }),
    });
    expect(rec.repsMin).toBe(8);
    expect(rec.repsMax).toBe(10);
  });
});

describe("buildWorkoutSummary", () => {
  it("считает упражнения, подходы, объём и дельту к прошлой тренировке", () => {
    const summary = buildWorkoutSummary({
      exercises: [
        { name: "Приседания", sets: 3, reps: 10, weightKg: 70 },
        { name: "Жим", sets: 3, reps: 8, weightKg: 40 },
      ],
      prevLogs: [
        {
          date: "2026-07-20",
          exercises: [
            { name: "Приседания", sets: 3, reps: 10, weightKg: 60 },
          ],
        },
      ],
      planMinutes: 45,
    });

    expect(summary.exerciseCount).toBe(2);
    expect(summary.setCount).toBe(6);
    expect(summary.totalReps).toBe(18);
    // 70*10*3 + 40*8*3 = 2100 + 960 = 3060
    expect(summary.tonnage).toBe(3060);
    // Прошлая: 60*10*3 = 1800 → +70%
    expect(summary.tonnageDeltaPct).toBeCloseTo(70);
    expect(summary.minutes).toBe(45);
    // Приседания — новый максимум (70 > 60), жима в истории нет.
    expect(summary.prs).toEqual(["Приседания"]);
  });

  it("без прошлых тренировок сравнения не выдумываются", () => {
    const summary = buildWorkoutSummary({
      exercises: [{ name: "Приседания", sets: 3, reps: 10, weightKg: 70 }],
      prevLogs: [],
    });
    expect(summary.tonnageDeltaPct).toBeNull();
    expect(summary.prs).toEqual([]);
  });
});
