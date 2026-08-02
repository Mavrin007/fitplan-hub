import { describe, expect, it } from "vitest";
import {
  applyProgression,
  equipmentSummary,
  generateWorkoutTemplate,
  normalizeEquipment,
  normalizeLimitations,
  PLAN_WEEKS,
  profileSignature,
  warmUpSets,
  type TrainingProfile,
} from "./workoutLibrary";

/** Базовый «нейтральный» профиль — без особенностей антропометрии и травм. */
function baseProfile(overrides: Partial<TrainingProfile> = {}): TrainingProfile {
  return {
    gender: "male",
    age: 30,
    heightCm: 178,
    weightKg: 78,
    activityLevel: "moderate",
    fitnessGoal: "gain_muscle",
    experienceLevel: "intermediate",
    equipment: ["barbell", "dumbbell", "machine", "cable", "kettlebell", "bodyweight"],
    limitations: [],
    preferredTrainingDays: 3,
    ...overrides,
  };
}

/** Плоский список названий упражнений во всех днях плана. */
function allExerciseNames(plan: ReturnType<typeof generateWorkoutTemplate>): string[] {
  return plan.days.flatMap((d) => d.exercises.map((e) => e.name));
}

describe("generateWorkoutTemplate — антропометрия", () => {
  it("высокому пользователю (≥185 см) заменяет становую тягу на румынскую", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({ heightCm: 195, fitnessGoal: "gain_muscle", experienceLevel: "intermediate" }),
    );
    const names = allExerciseNames(plan);
    expect(names).toContain("Румынская тяга");
    expect(names).not.toContain("Становая тяга");
    // В заметках дня объяснена причина замены.
    const notes = plan.days.flatMap((d) => d.notes ?? []);
    expect(notes.some((n) => n.includes("длинные рычаги"))).toBe(true);
  });

  it("высокому пользователю заменяет приседания со штангой на гоблет-приседания", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({ heightCm: 190, fitnessGoal: "gain_muscle", experienceLevel: "intermediate" }),
    );
    const names = allExerciseNames(plan);
    expect(names).not.toContain("Приседания со штангой");
    expect(names).toContain("Гоблет-приседания");
  });

  it("пользователю с избыточным ИМТ (≥27) убирает прыжки — заменяет запрыгивания на степ-ап", () => {
    // ИМТ = 105 / 1.70² ≈ 36 → heavy
    const plan = generateWorkoutTemplate(
      baseProfile({
        heightCm: 170,
        weightKg: 105,
        fitnessGoal: "lose_weight",
        experienceLevel: "intermediate",
      }),
    );
    const names = allExerciseNames(plan);
    expect(names).not.toContain("Запрыгивания на тумбу");
    expect(names).toContain("Степ-ап с весом");
  });

  it("помечает приоритетные упражнения для высокого роста (румынская тяга)", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({ heightCm: 192, fitnessGoal: "gain_muscle", experienceLevel: "intermediate" }),
    );
    const rdl = plan.days
      .flatMap((d) => d.exercises)
      .find((e) => e.name === "Румынская тяга");
    expect(rdl?.priority).toBe(true);
  });
});

describe("generateWorkoutTemplate — возраст и восстановление", () => {
  it("пользователю 50+ добавляет +30 с отдыха", () => {
    const young = generateWorkoutTemplate(
      baseProfile({ age: 28, fitnessGoal: "maintain", experienceLevel: "intermediate" }),
    );
    const senior = generateWorkoutTemplate(
      baseProfile({ age: 55, fitnessGoal: "maintain", experienceLevel: "intermediate" }),
    );
    // Сравниваем одинаковые упражнения: у старшего отдых больше минимум на 20 с.
    const rest = (plan: typeof young) =>
      plan.days.flatMap((d) => d.exercises.map((e) => e.restSeconds));
    const youngRests = rest(young);
    const seniorRests = rest(senior);
    for (let i = 0; i < youngRests.length; i++) {
      expect(seniorRests[i]).toBeGreaterThanOrEqual(youngRests[i] + 20);
    }
  });

  it("пользователю 50+ заменяет прыжки на низкоударные аналоги", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({
        age: 62,
        fitnessGoal: "lose_weight",
        experienceLevel: "beginner",
      }),
    );
    const names = allExerciseNames(plan);
    expect(names).not.toContain("Джампинг-джек");
    expect(names).toContain("Марш с подъёмом коленей");
  });
});

describe("generateWorkoutTemplate — ограничения/травмы", () => {
  it("при проблемах с коленями убирает глубокие приседания и выпады", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({
        limitations: ["knees"],
        fitnessGoal: "gain_muscle",
        experienceLevel: "intermediate",
      }),
    );
    const names = allExerciseNames(plan);
    expect(names).not.toContain("Приседания со штангой");
    expect(names).not.toContain("Выпады в ходьбе");
    expect(names).toContain("Гоблет-приседания");
    expect(names).toContain("Степ-ап с весом");
  });

  it("при проблемах с поясницей заменяет становую тягу", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({
        limitations: ["lower_back"],
        fitnessGoal: "gain_muscle",
        experienceLevel: "intermediate",
      }),
    );
    const names = allExerciseNames(plan);
    expect(names).not.toContain("Становая тяга");
    expect(names).toContain("Румынская тяга");
  });

  it("при проблемах с плечами убирает жим стоя", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({
        limitations: ["shoulders"],
        fitnessGoal: "gain_muscle",
        experienceLevel: "intermediate",
      }),
    );
    const names = allExerciseNames(plan);
    expect(names).not.toContain("Жим стоя");
    expect(names).toContain("Жим гантелей под наклоном");
  });
});

describe("generateWorkoutTemplate — инвентарь", () => {
  it("без инвентаря заменяет упражнения с отягощением на собственный вес", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({
        equipment: ["bodyweight"],
        fitnessGoal: "gain_muscle",
        experienceLevel: "beginner",
      }),
    );
    const names = allExerciseNames(plan);
    expect(names).not.toContain("Тяга верхнего блока");
    expect(names).toContain("Тяга гантели в наклоне");
  });

  it("equipmentSummary корректно описывает инвентарь", () => {
    expect(equipmentSummary(["barbell", "dumbbell"])).toBe("штанга, гантели");
    expect(equipmentSummary([])).toBe("без инвентаря");
  });

  it("normalizeEquipment отбрасывает неизвестные ключи", () => {
    expect(normalizeEquipment(["barbell", "hoverboard"])).toEqual(["barbell"]);
    expect(normalizeLimitations(["knees", "carpal_tunnel"])).toEqual(["knees"]);
  });
});

describe("generateWorkoutTemplate — пол и стартовые веса", () => {
  it("у женщин стартовые веса ниже, чем у мужчин (для жима лёжа)", () => {
    const male = generateWorkoutTemplate(
      baseProfile({ gender: "male", weightKg: 78 }),
    );
    const female = generateWorkoutTemplate(
      baseProfile({ gender: "female", weightKg: 78 }),
    );
    const weight = (plan: typeof male, name: string) =>
      plan.days
        .flatMap((d) => d.exercises)
        .find((e) => e.name === name)?.weightKg ?? 0;
    expect(weight(female, "Жим лёжа")).toBeLessThan(weight(male, "Жим лёжа"));
  });

  it("у новичка веса ниже, чем у среднего уровня", () => {
    const beginner = generateWorkoutTemplate(
      baseProfile({ experienceLevel: "beginner" }),
    );
    const intermediate = generateWorkoutTemplate(
      baseProfile({ experienceLevel: "intermediate" }),
    );
    const weight = (plan: typeof beginner, name: string) =>
      plan.days
        .flatMap((d) => d.exercises)
        .find((e) => e.name === name)?.weightKg ?? 0;
    expect(weight(beginner, "Жим лёжа")).toBeLessThan(
      weight(intermediate, "Жим лёжа"),
    );
  });
});

describe("generateWorkoutTemplate — структура плана", () => {
  it("уважает предпочитаемое число тренировок в неделю", () => {
    const plan = generateWorkoutTemplate(baseProfile({ preferredTrainingDays: 4 }));
    expect(plan.sessionsPerWeek).toBe(4);
    expect(plan.days).toHaveLength(4);
  });

  it("добавляет разминку в каждый день", () => {
    const plan = generateWorkoutTemplate(baseProfile());
    for (const day of plan.days) {
      expect(day.warmup && day.warmup.length).toBeGreaterThan(0);
    }
  });

  it("присваивает темп по цели набора массы (3-1-1)", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({ fitnessGoal: "gain_muscle" }),
    );
    const weighted = plan.days
      .flatMap((d) => d.exercises)
      .find((e) => e.weightKg !== undefined);
    expect(weighted?.tempo).toBe("3-1-1");
  });

  it("добавляет объяснение «как считается план»", () => {
    const plan = generateWorkoutTemplate(baseProfile());
    expect(plan.howCalculated && plan.howCalculated.length).toBeGreaterThan(3);
  });
});

describe("applyProgression — 4-недельный цикл", () => {
  it("строит PLAN_WEEKS недель с фазами", () => {
    const plan = generateWorkoutTemplate(baseProfile());
    const weeks = applyProgression(plan);
    expect(weeks).toHaveLength(PLAN_WEEKS);
    expect(weeks.map((w) => w.label)).toEqual([
      "Неделя 1 · База",
      "Неделя 2 · Прогресс",
      "Неделя 3 · Пик",
      "Неделя 4 · Разгрузка",
    ]);
  });

  it("на неделе 3 (пик) вес растёт на +2.5 кг", () => {
    const plan = generateWorkoutTemplate(baseProfile());
    const weeks = applyProgression(plan);
    const bench = (week: (typeof weeks)[number]) =>
      week.days
        .flatMap((d) => d.exercises)
        .find((e) => e.name === "Жим лёжа")?.weightKg ?? 0;
    expect(bench(weeks[2])).toBeGreaterThan(bench(weeks[0]));
    expect(bench(weeks[2]) - bench(weeks[0])).toBeCloseTo(2.5, 1);
  });

  it("на неделе 4 (разгрузка) вес снижается и подходов меньше", () => {
    const plan = generateWorkoutTemplate(baseProfile());
    const weeks = applyProgression(plan);
    const bench = (week: (typeof weeks)[number]) =>
      week.days.flatMap((d) => d.exercises).find((e) => e.name === "Жим лёжа");
    const base = bench(weeks[0])!;
    const deload = bench(weeks[3])!;
    expect(deload.weightKg!).toBeLessThan(base.weightKg!);
    expect(deload.sets).toBeLessThanOrEqual(base.sets);
  });

  it("на неделе 2 добавляет повтор (двойная прогрессия)", () => {
    const plan = generateWorkoutTemplate(baseProfile());
    const weeks = applyProgression(plan);
    const reps = (week: (typeof weeks)[number]) =>
      week.days.flatMap((d) => d.exercises).find((e) => e.name === "Жим лёжа")!
        .reps;
    expect(reps(weeks[1])).not.toBe(reps(weeks[0]));
  });
});

describe("profileSignature и warmUpSets", () => {
  it("сигнатура меняется при изменении данных профиля", () => {
    const a = profileSignature(baseProfile({ weightKg: 78 }));
    const b = profileSignature(baseProfile({ weightKg: 80 }));
    expect(a).not.toBe(b);
  });

  it("разминочная лестница строится от рабочего веса", () => {
    const sets = warmUpSets(100);
    expect(sets).toHaveLength(3);
    expect(sets[0].weightKg).toBeLessThan(sets[2].weightKg);
    expect(sets[2].weightKg).toBeLessThanOrEqual(100);
  });

  it("без веса разминка пустая", () => {
    expect(warmUpSets(undefined)).toHaveLength(0);
  });
});
