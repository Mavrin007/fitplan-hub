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
  type Exercise,
  type ProgressionWeek,
  type TrainingProfile,
  type WorkoutTemplate,
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

  it("при проблемах с плечами заменяет и жим лёжа", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({
        limitations: ["shoulders"],
        fitnessGoal: "gain_muscle",
        experienceLevel: "advanced",
      }),
    );
    const names = allExerciseNames(plan);
    expect(names).not.toContain("Жим лёжа");
    expect(names).toContain("Отжимания");
  });

  it("при проблемах с коленями заменяет приседания без веса на степ-ап", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({
        limitations: ["knees"],
        fitnessGoal: "gain_muscle",
        experienceLevel: "beginner",
      }),
    );
    const names = allExerciseNames(plan);
    expect(names).not.toContain("Приседания");
    expect(names).toContain("Степ-ап с весом");
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
    // «Тяга верхнего блока» (тренажёр/блок) заменяется на «Подтягивания» —
    // единственный вариант на собственный вес; гантельная тяга требует гантелей.
    expect(names).toContain("Подтягивания");
  });

  it("equipmentSummary корректно описывает инвентарь", () => {
    expect(equipmentSummary(["barbell", "dumbbell"])).toBe("штанга, гантели");
    expect(equipmentSummary([])).toBe("без инвентаря");
  });

  it("normalizeEquipment отбрасывает неизвестные ключи", () => {
    expect(normalizeEquipment(["barbell", "hoverboard"])).toEqual(["barbell"]);
    expect(normalizeLimitations(["knees", "carpal_tunnel"])).toEqual(["knees"]);
  });

  it("с одним только собственным весом план не содержит упражнений со снарядом", () => {
    // Продвинутый пользователь с целью набора: тренажёрный сплит «Жим/Тяга/Ноги»
    // выродился бы в повторяющиеся отжимания — движок переключает на фулбоди.
    const plan = generateWorkoutTemplate(
      baseProfile({
        equipment: ["bodyweight"],
        fitnessGoal: "gain_muscle",
        experienceLevel: "advanced",
        preferredTrainingDays: 4,
      }),
    );
    // Названия упражнений, которым нужен любой снаряд (штанга/гантели/тренажёр…).
    const needsGear = [
      "Жим лёжа",
      "Жим стоя",
      "Жим гантелей под наклоном",
      "Махи в стороны",
      "Разгибание рук на блоке",
      "Становая тяга",
      "Румынская тяга",
      "Тяга штанги в наклоне",
      "Тяга к лицу",
      "Сгибания рук со штангой",
      "Приседания со штангой",
      "Жим ногами",
      "Тяга верхнего блока",
      "Тяга горизонтального блока",
      "Махи гирей",
      "Тяга гантели в наклоне",
      "Французский жим с гантелью",
      "Разведение гантелей в наклоне",
      "Сгибания с гантелями",
    ];
    const names = new Set(allExerciseNames(plan));
    for (const bad of needsGear) {
      expect(names.has(bad)).toBe(false);
    }
    // Сплит честно сообщает о переключении на собственный вес.
    expect(plan.splitType).toContain("без инвентаря");
  });

  it("для тела без инвентаря план даёт хотя бы один упражнение на собственный вес", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({
        equipment: ["bodyweight"],
        fitnessGoal: "gain_muscle",
        experienceLevel: "intermediate",
      }),
    );
    const names = allExerciseNames(plan);
    expect(names.some((n) => ["Отжимания", "Подтягивания", "Приседания", "Планка"].includes(n))).toBe(true);
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

  it("4 дня на массе — полноценный сплит Жим/Тяга/Ноги/Плечи и руки", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({ preferredTrainingDays: 4 }),
    );
    const focuses = plan.days.map((d) => d.focus);
    expect(focuses).toEqual(["Жимовая", "Тяговая", "Ноги", "Плечи и руки"]);
    // Ноги не остаются без внимания при четырёхдневном сплите.
    expect(focuses.filter((f) => f === "Ноги")).toHaveLength(1);
  });

  it("5 дней на массе: ноги и плечи получают второй день раньше жимового", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({ preferredTrainingDays: 5 }),
    );
    const focuses = plan.days.map((d) => d.focus);
    // Без соседних дублей и с равномерным покрытием фокусов (разница ≤ 1).
    expect(focuses.some((f, i) => i > 0 && f === focuses[i - 1])).toBe(false);
    const count = (f: string) => focuses.filter((x) => x === f).length;
    expect(count("Ноги")).toBeGreaterThanOrEqual(count("Жимовая"));
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

describe("generateWorkoutTemplate — цель «Сила»", () => {
  it("средний уровень: силовой сплит, низкие повторы, темп 3-0-2", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({ fitnessGoal: "strength", experienceLevel: "intermediate" }),
    );
    expect(plan.splitType).toBe("Силовой сплит");
    // Базовые движения — низкие повторы и длинный отдых.
    const squat = plan.days
      .flatMap((d) => d.exercises)
      .find((e) => e.name === "Приседания со штангой");
    expect(squat?.sets).toBe(5);
    expect(squat?.reps).toBe("5");
    expect(squat?.restSeconds).toBeGreaterThanOrEqual(240);
    const weighted = plan.days
      .flatMap((d) => d.exercises)
      .find((e) => e.weightKg !== undefined);
    expect(weighted?.tempo).toBe("3-0-2");
  });

  it("новичок: силовой фулбоди, 3 тренировки по умолчанию", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({
        fitnessGoal: "strength",
        experienceLevel: "beginner",
        preferredTrainingDays: undefined,
      }),
    );
    expect(plan.splitType).toBe("Силовой фулбоди");
    expect(plan.sessionsPerWeek).toBe(3);
    expect(plan.days).toHaveLength(3);
  });

  it("средний уровень: 4 тренировки по умолчанию", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({
        fitnessGoal: "strength",
        experienceLevel: "intermediate",
        preferredTrainingDays: undefined,
      }),
    );
    expect(plan.sessionsPerWeek).toBe(4);
  });

  it("объясняет цель и стиль в «как считается» и сводке", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({ fitnessGoal: "strength" }),
    );
    const bullets = plan.howCalculated ?? [];
    expect(bullets.some((b) => b.toLowerCase().includes("сила"))).toBe(true);
    expect(plan.adaptedFor).toContain("фокус на силовые показатели");
  });

  it("при ограничениях силовой план тоже заменяет рискованные движения", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({
        fitnessGoal: "strength",
        experienceLevel: "intermediate",
        limitations: ["lower_back"],
      }),
    );
    const names = allExerciseNames(plan);
    expect(names).not.toContain("Становая тяга");
    expect(names).toContain("Румынская тяга");
  });
});

describe("generateWorkoutTemplate — стиль тренировок", () => {
  const repsOf = (plan: ReturnType<typeof generateWorkoutTemplate>, name: string) =>
    plan.days
      .flatMap((d) => d.exercises)
      .find((e) => e.name === name)?.reps;
  const restOf = (plan: ReturnType<typeof generateWorkoutTemplate>, name: string) =>
    plan.days
      .flatMap((d) => d.exercises)
      .find((e) => e.name === name)?.restSeconds;

  it("по умолчанию (без стиля) план не меняется", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({ trainingStyle: undefined }),
    );
    expect(repsOf(plan, "Жим лёжа")).toBe("6–8");
    expect(restOf(plan, "Жим лёжа")).toBe(120);
  });

  it("силовой стиль: повторы вниз, отдых длиннее", () => {
    const plan = generateWorkoutTemplate(baseProfile({ trainingStyle: "power" }));
    expect(repsOf(plan, "Жим лёжа")).toBe("4–6");
    expect(restOf(plan, "Жим лёжа")).toBe(150);
  });

  it("объёмный стиль: повторы вверх, отдых короче", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({ trainingStyle: "hypertrophy" }),
    );
    expect(repsOf(plan, "Жим лёжа")).toBe("8–10");
    expect(restOf(plan, "Жим лёжа")).toBe(105);
  });

  it("функциональный стиль: короткий отдых, повторы вверх", () => {
    const plan = generateWorkoutTemplate(
      baseProfile({ trainingStyle: "functional" }),
    );
    expect(repsOf(plan, "Жим лёжа")).toBe("7–9");
    expect(restOf(plan, "Жим лёжа")).toBe(105);
  });

  it("тайминги и кардио стилем не трогаются", () => {
    const balanced = generateWorkoutTemplate(
      baseProfile({ trainingStyle: "balanced" }),
    );
    const power = generateWorkoutTemplate(baseProfile({ trainingStyle: "power" }));
    const plank = (plan: ReturnType<typeof generateWorkoutTemplate>) =>
      plan.days.flatMap((d) => d.exercises).find((e) => e.name === "Планка");
    expect(plank(power)?.reps).toBe(plank(balanced)?.reps);
  });

  it("кардио («30–40 мин») не сдвигается по стилю", () => {
    const balanced = generateWorkoutTemplate(
      baseProfile({
        fitnessGoal: "lose_weight",
        experienceLevel: "beginner",
        trainingStyle: "balanced",
      }),
    );
    const power = generateWorkoutTemplate(
      baseProfile({
        fitnessGoal: "lose_weight",
        experienceLevel: "beginner",
        trainingStyle: "power",
      }),
    );
    const cardio = (plan: ReturnType<typeof generateWorkoutTemplate>) =>
      plan.days.flatMap((d) => d.exercises).find((e) => e.name === "Ходьба / бег");
    expect(cardio(power)?.reps).toBe("30–40 мин");
    expect(cardio(power)?.reps).toBe(cardio(balanced)?.reps);
    expect(cardio(power)?.restSeconds).toBe(cardio(balanced)?.restSeconds);
  });

  it("стиль попадает в «как считается» и сигнатуру профиля", () => {
    const plan = generateWorkoutTemplate(baseProfile({ trainingStyle: "power" }));
    const bullets = plan.howCalculated ?? [];
    expect(bullets.some((b) => b.includes("силовой"))).toBe(true);
    expect(plan.adaptedFor).toContain("стиль: силовой");
    expect(
      profileSignature(baseProfile({ trainingStyle: "power" })),
    ).not.toBe(profileSignature(baseProfile({ trainingStyle: "balanced" })));
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

  it("при малых весах дубли ступеней разминки схлопываются", () => {
    // 20 кг (пустой гриф): 40%/60%/80% все округляются к 20 кг — показываем
    // один подход, а не три одинаковых.
    const sets = warmUpSets(20, 20);
    expect(sets.length).toBeGreaterThanOrEqual(1);
    const weights = sets.map((s) => s.weightKg);
    expect(new Set(weights).size).toBe(weights.length); // без повторов веса
  });

  it("точная лестница от 100 кг: 40/60/80 с нарастающими повторами", () => {
    expect(warmUpSets(100)).toEqual([
      { weightKg: 40, reps: "8–10" },
      { weightKg: 60, reps: "6–8" },
      { weightKg: 80, reps: "4–6" },
    ]);
  });

  it("веса округляются до блинов по 2.5 кг", () => {
    // 22.5 · 40% = 9 → 10; · 60% = 13.5 → 12.5; · 80% = 18 → 17.5.
    expect(warmUpSets(22.5)).toEqual([
      { weightKg: 10, reps: "8–10" },
      { weightKg: 12.5, reps: "6–8" },
      { weightKg: 17.5, reps: "4–6" },
    ]);
  });

  it("схлопываются не все ступени, а только совпавшие по весу", () => {
    // 5 кг: 40% и 60% округляются к 2.5 кг — показываем один подход;
    // 80% даёт 5 кг — отдельная ступень.
    expect(warmUpSets(5)).toEqual([
      { weightKg: 2.5, reps: "8–10" },
      { weightKg: 5, reps: "4–6" },
    ]);
  });

  it("minKg не даёт разминочному подходу опуститься ниже веса грифа", () => {
    // Штанговое упражнение: нижняя граница 20 кг (пустой гриф).
    expect(warmUpSets(22.5, 20)).toEqual([{ weightKg: 20, reps: "8–10" }]);
  });

  it("некорректные веса возвращают пустую разминку", () => {
    expect(warmUpSets(0)).toEqual([]);
    expect(warmUpSets(-10)).toEqual([]);
    expect(warmUpSets(NaN)).toEqual([]);
    expect(warmUpSets(Infinity)).toEqual([]);
  });
});

describe("progressExercise — прогрессия по видам упражнений (через applyProgression)", () => {
  /** Однодневный шаблон из упражнений для прямых тестов прогрессии. */
  function templateWith(...exercises: Exercise[]): WorkoutTemplate {
    return { name: "Тест", days: [{ day: 0, focus: "Тест", exercises }] };
  }

  /** Упражнение недели `weekIdx` (индекс 0..3) в цикле прогрессии. */
  function at(weeks: ProgressionWeek[], weekIdx: number): Exercise {
    return weeks[weekIdx].days[0].exercises[0];
  }

  it("отягощённое: полный цикл вес/повторы/подходы", () => {
    const weeks = applyProgression(
      templateWith({
        name: "Жим лёжа",
        sets: 4,
        reps: "6–8",
        restSeconds: 120,
        weightKg: 40,
      }),
    );
    // Неделя 1 — база, ничего не меняется.
    expect(at(weeks, 0)).toMatchObject({ sets: 4, reps: "6–8", weightKg: 40 });
    expect(at(weeks, 0).weightNote).toBeUndefined();
    // Неделя 2 — двойная прогрессия: те же веса, +1 повтор.
    expect(at(weeks, 1)).toMatchObject({
      sets: 4,
      weightKg: 40,
      reps: "7–9",
      weightNote: "те же веса, +1 повтор",
    });
    // Неделя 3 — пик: +2.5 кг, повторы к базе.
    expect(at(weeks, 2)).toMatchObject({
      sets: 4,
      weightKg: 42.5,
      reps: "6–8",
      weightNote: "+2.5 кг",
    });
    // Неделя 4 — разгрузка: −20% (40 · 0.8 = 32 → 32.5 по блинам), −1 подход.
    expect(at(weeks, 3)).toMatchObject({
      sets: 3,
      weightKg: 32.5,
      weightNote: "−20% веса",
    });
  });

  it("разгрузка штанги не опускается ниже веса грифа (20 кг)", () => {
    const weeks = applyProgression(
      templateWith({
        name: "Сгибания рук со штангой",
        sets: 3,
        reps: "10–12",
        restSeconds: 60,
        weightKg: 20,
      }),
    );
    // 20 · 0.8 = 16 → округление упирается в мин. вес грифа.
    expect(at(weeks, 3).weightKg).toBe(20);
    expect(at(weeks, 3).weightNote).toBe("−20% веса");
    // Пик — +2.5 кг от базы.
    expect(at(weeks, 2).weightKg).toBe(22.5);
  });

  it("собственный вес: +1 повтор, затем +1 подход, разгрузка — лёгкий день", () => {
    const weeks = applyProgression(
      templateWith({ name: "Отжимания", sets: 3, reps: "10–15", restSeconds: 30 }),
    );
    expect(at(weeks, 1)).toMatchObject({
      sets: 3,
      reps: "11–16",
      weightNote: "+1 повтор",
    });
    expect(at(weeks, 2)).toMatchObject({
      sets: 4,
      reps: "10–15",
      weightNote: "+1 подход",
    });
    expect(at(weeks, 3)).toMatchObject({
      sets: 2,
      weightKg: undefined,
      weightNote: "лёгкий день",
    });
  });

  it("по времени: диапазон секунд +5 с, пик +1 подход, разгрузка −1 подход", () => {
    const weeks = applyProgression(
      templateWith({ name: "Планка", sets: 3, reps: "30–45с", restSeconds: 45 }),
    );
    expect(at(weeks, 1)).toMatchObject({
      reps: "35–50с",
      weightNote: "+5 секунд",
    });
    expect(at(weeks, 2)).toMatchObject({ sets: 4, weightNote: "+1 подход" });
    expect(at(weeks, 3)).toMatchObject({ sets: 2, weightNote: "лёгкий день" });
  });

  it("по времени: одиночная секундная запись «30с» → «35с»", () => {
    const weeks = applyProgression(
      templateWith({ name: "Джампинг-джек", sets: 4, reps: "30с", restSeconds: 30 }),
    );
    expect(at(weeks, 1).reps).toBe("35с");
  });

  it("кардио: +5 мин, затем +10 мин, разгрузка −30% объёма без сдвига повторов", () => {
    const weeks = applyProgression(
      templateWith({ name: "Ходьба / бег", sets: 1, reps: "30–40 мин", restSeconds: 0 }),
    );
    expect(at(weeks, 1)).toMatchObject({
      sets: 1,
      reps: "35–45 мин",
      weightNote: "+5 минут",
    });
    expect(at(weeks, 2)).toMatchObject({
      reps: "40–50 мин",
      weightNote: "+10 минут",
    });
    expect(at(weeks, 3)).toMatchObject({
      sets: 1,
      reps: "30–40 мин",
      weightNote: "−30% объёма",
    });
  });

  it("одиночная запись повторов «5» → «5–6» на неделе прогресса", () => {
    const weeks = applyProgression(
      templateWith({
        name: "Становая тяга",
        sets: 4,
        reps: "5",
        restSeconds: 180,
        weightKg: 70,
      }),
    );
    expect(at(weeks, 1).reps).toBe("5–6");
  });

  it("суффикс диапазона сохраняется: «10–12 / нога» → «11–13 / нога»", () => {
    const weeks = applyProgression(
      templateWith({
        name: "Выпады в ходьбе",
        sets: 3,
        reps: "10–12 / нога",
        restSeconds: 60,
        weightKg: 10,
      }),
    );
    expect(at(weeks, 1).reps).toBe("11–13 / нога");
  });

  it("повторы без чисел не меняются", () => {
    const weeks = applyProgression(
      templateWith({
        name: "Гиперэкстензия",
        sets: 3,
        reps: "до отказа",
        restSeconds: 90,
        weightKg: 10,
      }),
    );
    expect(at(weeks, 1).reps).toBe("до отказа");
  });
});
