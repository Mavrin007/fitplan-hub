/** Генератор плана тренировок — подбирает структурированный недельный план
 *  исходя из полного профиля: цели, уровня подготовки, антропометрии
 *  (рост/вес/ИМТ), пола, возраста, повседневной активности, целевого веса,
 *  доступного инвентаря, ограничений/травм и предпочитаемого числа тренировок
 *  в неделю. Понимает, какие упражнения подходят конкретному пользователю
 *  (приоритеты и замены с объяснением причин), назначает стартовые рабочие
 *  веса под профиль, темп выполнения, разминку и раскладывает план на цикл
 *  из 4 недель с автоматической прогрессией нагрузки.
 *
 *  Данные (пулы упражнений, правила антропометрии/травм/инвентаря, справочные
 *  веса, темп, подсказки) вынесены в `workoutData.ts`; здесь — вся логика.
 */

import type {
  ExperienceLevel,
  FitnessGoal,
  Limitation,
  TrainingStyle,
} from "./nutrition";
import {
  ACTIVITY_LABELS,
  EXPERIENCE_LABELS,
  GENDER_LABELS,
  LIMITATION_LABELS,
  TRAINING_STYLE_LABELS,
} from "./nutrition";
import {
  ANTHRO_RULES,
  ARMS,
  BARBELL_BAR_WEIGHT_KG,
  BODYWEIGHT_NAMES,
  CARDIO_DAY,
  CIRCUIT,
  ENDURANCE_CIRCUIT,
  ENDURANCE_HIIT,
  EQUIPMENT_ALTERNATIVES,
  EQUIPMENT_KEYS,
  EQUIPMENT_PRESETS,
  EXERCISE_EQUIPMENT,
  EXERCISE_TIPS,
  FULL_BODY_A,
  FULL_BODY_B,
  HIIT,
  INJURY_RULES,
  LEGS,
  LOWER_BODY_NAMES,
  PLAN_WEEKS,
  PROGRESSION_PHASES,
  PULL,
  PUSH,
  REFERENCE_WEIGHTS,
  STRENGTH_FULLBODY_A,
  STRENGTH_FULLBODY_B,
  STRENGTH_LEGS,
  STRENGTH_PULL,
  STRENGTH_PUSH,
  STYLE_RULES,
  TEMPO_BY_GOAL,
  type BodyBuild,
  type Equipment,
  type Exercise,
  type ProgressionWeek,
  type TrainingProfile,
  type WorkoutDay,
  type WorkoutTemplate,
} from "./workoutData";
import { EQUIPMENT_LABELS, WEEKDAYS } from "./i18n";

// Обратная совместимость: данные и типы пере-экспортируются, чтобы старые
// импорты «из @/lib/workoutLibrary» продолжали работать.
export {
  BARBELL_BAR_WEIGHT_KG,
  EQUIPMENT_KEYS,
  EQUIPMENT_PRESETS,
  EXERCISE_TIPS,
  PLAN_WEEKS,
  type BodyBuild,
  type Equipment,
  type Exercise,
  type ProgressionWeek,
  type TrainingProfile,
  type WorkoutDay,
  type WorkoutTemplate,
};
export { EQUIPMENT_LABELS, WEEKDAYS };

/** Отбрасывает неизвестные ключи из сырого списка инвентаря. */
export function normalizeEquipment(raw: string[] | undefined): Equipment[] {
  if (!raw) return [];
  return raw.filter((e): e is Equipment =>
    EQUIPMENT_KEYS.includes(e as Equipment),
  );
}

/** Отбрасывает неизвестные ключи из сырого списка ограничений. */
export function normalizeLimitations(raw: string[] | undefined): Limitation[] {
  if (!raw) return [];
  const known: Limitation[] = ["lower_back", "knees", "shoulders"];
  return raw.filter((l): l is Limitation => (known as string[]).includes(l));
}

/** Человекочитаемый список инвентаря: «штанга, гантели» или «без инвентаря». */
export function equipmentSummary(equipment?: string[]): string {
  const list = normalizeEquipment(equipment);
  if (list.length === 0) return "без инвентаря";
  return list.map((e) => EQUIPMENT_LABELS[e].toLowerCase()).join(", ");
}

/** Штанговые упражнения: их вес считается общим (гриф включён). */
export function isBarbellExercise(name: string): boolean {
  return EXERCISE_EQUIPMENT[name]?.includes("barbell") ?? false;
}

/** Сессия-«семя»: упражнения без дня недели — день назначается при сборке. */
interface SessionSeed {
  name: string; // название фокуса («Фулбоди A»)
  exercises: Exercise[];
}

/** Пулы сессий по цели и уровню подготовки + тип сплита. */
function buildSessionPool(
  goal: FitnessGoal,
  experience: ExperienceLevel,
): { splitType: string; pool: SessionSeed[] } {
  if (goal === "strength") {
    if (experience === "beginner") {
      return {
        splitType: "Силовой фулбоди",
        pool: [
          { name: "Силовой фулбоди A", exercises: STRENGTH_FULLBODY_A },
          { name: "Силовой фулбоди B", exercises: STRENGTH_FULLBODY_B },
        ],
      };
    }
    return {
      splitType: "Силовой сплит",
      pool: [
        { name: "Силовые ноги", exercises: STRENGTH_LEGS },
        { name: "Силовой жим", exercises: STRENGTH_PUSH },
        { name: "Силовая тяга", exercises: STRENGTH_PULL },
      ],
    };
  }
  if (goal === "improve_endurance") {
    return {
      splitType: "Круги на выносливость",
      pool: [
        { name: "Круговая", exercises: ENDURANCE_CIRCUIT },
        { name: "Метаболический круг", exercises: ENDURANCE_HIIT },
        { name: "Лёгкое кардио", exercises: CARDIO_DAY },
      ],
    };
  }
  if (goal === "gain_muscle") {
    if (experience === "beginner") {
      return {
        splitType: "Фулбоди",
        pool: [
          { name: "Фулбоди A", exercises: FULL_BODY_A },
          { name: "Фулбоди B", exercises: FULL_BODY_B },
        ],
      };
    }
    return {
      splitType: "Жим/Тяга/Ноги",
      pool: [
        { name: "Жимовая", exercises: PUSH },
        { name: "Тяговая", exercises: PULL },
        { name: "Ноги", exercises: LEGS },
        // 4+ тренировок: полноценный сплит вместо повторов жимового дня.
        { name: "Плечи и руки", exercises: ARMS },
      ],
    };
  }
  if (goal === "lose_weight") {
    if (experience === "beginner") {
      return {
        splitType: "Круговая + силовая",
        pool: [
          { name: "Круговая", exercises: CIRCUIT },
          { name: "Фулбоди B", exercises: FULL_BODY_B },
          { name: "Лёгкое кардио", exercises: CARDIO_DAY },
        ],
      };
    }
    return {
      splitType: "Силовая + HIIT",
      pool: [
        { name: "Ноги", exercises: LEGS },
        { name: "HIIT", exercises: HIIT },
        { name: "Жимовая", exercises: PUSH },
        { name: "Тяговая", exercises: PULL },
      ],
    };
  }
  // Поддержание веса / общей формы
  if (experience === "beginner") {
    return {
      splitType: "Фулбоди",
      pool: [
        { name: "Фулбоди A", exercises: FULL_BODY_A },
        { name: "Фулбоди B", exercises: FULL_BODY_B },
      ],
    };
  }
  return {
    splitType: "Верх/Низ",
    pool: [
      { name: "Жимовая", exercises: PUSH },
      { name: "Ноги", exercises: LEGS },
      { name: "Тяговая", exercises: PULL },
    ],
  };
}

/** Сколько тренировок в неделю задаёт цель и уровень по умолчанию. */
function defaultSessions(goal: FitnessGoal, experience: ExperienceLevel): number {
  if (goal === "strength")
    return experience === "beginner" ? 3 : 4;
  if (goal === "improve_endurance") return experience === "beginner" ? 3 : 4;
  if (goal === "gain_muscle")
    return experience === "beginner" ? 3 : experience === "advanced" ? 5 : 4;
  if (goal === "lose_weight")
    return experience === "beginner" ? 3 : experience === "advanced" ? 5 : 4;
  return experience === "beginner" ? 2 : 3;
}

/** Классифицирует профиль по антропометрии и ИМТ. */
function classifyProfile(profile: TrainingProfile): {
  build: BodyBuild;
  heavy: boolean;
  bmi: number;
} {
  const bmi = profile.weightKg / Math.pow(profile.heightCm / 100, 2);
  const build: BodyBuild =
    profile.heightCm >= 185
      ? "tall"
      : profile.heightCm <= 170
        ? "short"
        : "average";
  return { build, heavy: bmi >= 27, bmi };
}

/** Применяет персональные правила к дню плана: заменяет неподходящие
 *  упражнения, помечает приоритетные и собирает заметки с причинами. */
function adaptDay(
  day: WorkoutDay,
  ctx: {
    build: BodyBuild;
    heavy: boolean;
    female: boolean;
    senior: boolean;
  },
): { day: WorkoutDay; notes: string[] } {
  const notes: string[] = [];
  const exercises = day.exercises.map((exercise) => {
    const rule =
      (ctx.senior ? ANTHRO_RULES[exercise.name]?.senior : undefined) ??
      (ctx.heavy ? ANTHRO_RULES[exercise.name]?.heavy : undefined) ??
      ANTHRO_RULES[exercise.name]?.[ctx.build] ??
      (ctx.female ? ANTHRO_RULES[exercise.name]?.female : undefined);

    if (!rule) {
      // Без замен, но возрастное правило отдыха всё равно применяется.
      return ctx.senior
        ? { ...exercise, restSeconds: exercise.restSeconds + 30 }
        : exercise;
    }

    const restSeconds =
      exercise.restSeconds + (rule.restBonus ?? (ctx.senior ? 30 : 0));

    if (rule.alternative) {
      notes.push(`«${exercise.name}» → «${rule.alternative}»: ${rule.reason}.`);
      return {
        ...exercise,
        name: rule.alternative,
        restSeconds,
        priority: rule.priority,
      };
    }
    if (rule.priority) {
      notes.push(`«${exercise.name}» — ${rule.reason}.`);
      return { ...exercise, restSeconds, priority: true };
    }
    return { ...exercise, restSeconds };
  });
  return { day: { ...day, exercises }, notes };
}

/** Применяет правила ограничений/травм: рискованные движения заменяются на
 *  безопасные аналоги, причины попадают в заметки дня. */
function adaptForInjuries(
  day: WorkoutDay,
  limitations: Limitation[],
): { day: WorkoutDay; notes: string[] } {
  if (limitations.length === 0) return { day, notes: [] };

  const notes: string[] = [];
  const exercises = day.exercises.map((exercise) => {
    for (const limitation of limitations) {
      const rule = INJURY_RULES[limitation]?.[exercise.name];
      if (!rule) continue;
      notes.push(
        `По ограничению «${LIMITATION_LABELS[limitation].toLowerCase()}»: «${exercise.name}» → «${rule.alternative}» — ${rule.reason}.`,
      );
      return { ...exercise, name: rule.alternative, priority: rule.priority };
    }
    return exercise;
  });
  return { day: { ...day, exercises }, notes };
}

/** Подстраивает день под доступный инвентарь: упражнения, которые нельзя
 *  выполнить с выбранным оборудованием, заменяются на аналоги (с теми же
 *  подходами/повторами), а причины попадают в заметки дня. Из нескольких
 *  подходящих замен предпочитается та, которой ещё нет в этом дне — чтобы
 *  несколько упражнений не превращались в одинаковые строки.
 *  У каждого отягощённого движения есть вариант на собственный вес, поэтому
 *  план остаётся выполнимым даже с минимальным инвентарём. */
function adaptForEquipment(
  day: WorkoutDay,
  available: Set<Equipment>,
): { day: WorkoutDay; notes: string[] } {
  // Инвентарь не выбран — считаем, что есть всё (полный зал по умолчанию).
  if (available.size === 0) return { day, notes: [] };

  const notes: string[] = [];
  const used = new Set<string>(); // финальные имена уже обработанных упражнений
  const exercises = day.exercises.map((exercise) => {
    const required = EXERCISE_EQUIPMENT[exercise.name];
    if (!required || required.some((e) => available.has(e))) {
      used.add(exercise.name);
      return exercise; // подходит для доступного инвентаря
    }
    const options = EQUIPMENT_ALTERNATIVES[exercise.name] ?? [];
    const fitting = options.filter((o) =>
      o.equipment.some((e) => available.has(e)),
    );
    // Сначала — подходящая замена, которой нет в этом дне; если таких нет —
    // берём первую подходящую (повтор допустим, но лучше, чем невозможный
    // снаряд).
    const alt = fitting.find((o) => !used.has(o.name)) ?? fitting[0];
    if (!alt) {
      used.add(exercise.name);
      return exercise; // нет подходящей замены — оставляем как есть
    }

    used.add(alt.name);
    notes.push(
      `«${exercise.name}» → «${alt.name}»: нет нужного инвентаря (${equipmentSummary([...required])}).`,
    );
    return { ...exercise, name: alt.name };
  });
  return { day: { ...day, exercises }, notes };
}

/** Округляет вес до ближайших 2.5 кг (под «блины»). Минимум — `minKg`:
 *  2.5 кг по умолчанию; для штанговых упражнений — вес грифа 20 кг
 *  (пустой гриф — минимально возможная нагрузка на штанге). */
function roundToPlate(kg: number, minKg = 2.5): number {
  return Math.max(minKg, Math.round(kg / 2.5) * 2.5);
}

/** Минимальный вес упражнения: для штанги — вес грифа (общий вес снаряда
 *  не может быть меньше пустого грифа), для остальных — 2.5 кг. */
function minWeightFor(exerciseName: string): number {
  return isBarbellExercise(exerciseName) ? BARBELL_BAR_WEIGHT_KG : 2.5;
}

/** Считает стартовый рабочий вес упражнения под профиль:
 *  женщины — ниже (на ноги разница меньше), возраст 50+ — −20%,
 *  новички — −35% (техника важнее веса), собственный вес — поправка
 *  относительно эталонных 75 кг (ограничена 0.7–1.3).
 *  Штанговые упражнения не опускаются ниже веса грифа (20 кг). */
function computeStartWeight(
  exercise: Exercise,
  profile: TrainingProfile,
): number | undefined {
  const reference = REFERENCE_WEIGHTS[exercise.name];
  if (reference === undefined) return undefined; // собственный вес / кардио

  let factor = 1;
  if (profile.gender === "female") {
    factor *= LOWER_BODY_NAMES.has(exercise.name) ? 0.75 : 0.6;
  }
  if (profile.experienceLevel === "beginner") factor *= 0.65;
  if (profile.age >= 50) factor *= 0.8;
  factor *= Math.min(1.3, Math.max(0.7, profile.weightKg / 75));

  return roundToPlate(reference * factor, minWeightFor(exercise.name));
}

/** Собирает разминку дня под профиль: базовое кардио + суставная гимнастика +
 *  активация под пол, возраст и ограничения. */
function buildWarmup(
  profile: TrainingProfile,
  ctx: { female: boolean; senior: boolean; mid: boolean },
  limitations: Limitation[],
): string[] {
  const lines: string[] = [
    "5–7 мин лёгкого кардио (ходьба, велосипед, эллипс)",
    "Суставная разминка: вращения плеч, таза, коленей",
  ];
  if (ctx.female) {
    lines.push("Активация ягодиц: ягодичный мостик 2×12");
  }
  if (ctx.mid) {
    lines.push("Подвижность: планка 2×20–30 с, глубокий присед с опорой");
  }
  if (ctx.senior) {
    lines.push("Удлинённая разминка: 8–10 мин, темп плавный");
  }
  if (limitations.includes("lower_back")) {
    lines.push("Поясница: птица-собака 2×10, ягодичный мостик 2×12");
  }
  if (limitations.includes("knees")) {
    lines.push("Колени: приседания без веса 2×10, ходьба на месте");
  }
  if (limitations.includes("shoulders")) {
    lines.push("Плечи: вращения рук, тяга к лицу лёгкой резинкой 2×15");
  }
  return lines;
}

/** Собирает пункты «как считается этот план» — короткие объяснения решений. */
function buildHowCalculated(
  profile: TrainingProfile,
  ctx: {
    build: BodyBuild;
    heavy: boolean;
    bmi: number;
    female: boolean;
    senior: boolean;
    mid: boolean;
    underweight: boolean;
  },
  limitations: Limitation[],
  sessions: number,
  splitType: string,
): string[] {
  const bullets: string[] = [];

  if (profile.heightCm >= 185) {
    bullets.push(
      `При росте ${profile.heightCm} см длинные рычаги нагружают суставы — тяги и приседания со штангой заменены на безопасные варианты (румынская тяга, гоблет-приседания).`,
    );
  }
  if (ctx.heavy) {
    bullets.push(
      `ИМТ ${ctx.bmi.toFixed(1)} выше 27 — упор на низкоударные и тренажёрные упражнения, прыжки исключены.`,
    );
  }
  if (ctx.underweight) {
    bullets.push(
      `ИМТ ${ctx.bmi.toFixed(1)} ниже 18.5 — фокус на гипертрофию: умеренный объём, полное восстановление, прогрессивная перегрузка.`,
    );
  }
  if (ctx.female) {
    bullets.push(
      "Акцент на заднюю цепь (ягодицы, бицепс бедра) и кор — приоритетные упражнения отмечены бейджем «приоритет».",
    );
  }
  if (profile.age < 30) {
    bullets.push(
      "Возраст до 30 — допускается высокий объём и частота тренировок.",
    );
  } else if (profile.age <= 50) {
    bullets.push(
      "Возраст 30–50 — умеренный объём, обязательная разминка и подвижность.",
    );
  } else {
    bullets.push(
      "Возраст 50+ — щадящий режим: больше отдыха (+30 с), без осевой и ударной нагрузки.",
    );
  }
  if (limitations.length > 0) {
    bullets.push(
      `Учтены ограничения: ${limitations.map((l) => LIMITATION_LABELS[l].toLowerCase()).join(", ")} — рискованные движения заменены на безопасные аналоги.`,
    );
  }

  const equipment = normalizeEquipment(profile.equipment);
  if (equipment.length > 0 && equipment.every((e) => e === "bodyweight")) {
    bullets.push(
      "Инвентарь: только собственный вес — сплит переключён на фулбоди/круги, отягощения заменены на упражнения с весом тела.",
    );
  }

  const goalBullets: Record<FitnessGoal, string> = {
    gain_muscle:
      "Цель «набор массы»: 3–4 подхода × 6–12 повторов, темп 3-1-1, отдых 90–120 с на базовых упражнениях.",
    lose_weight:
      "Цель «похудение»: силовые + метаболические круги, 8–15 повторов, отдых 60–90 с.",
    maintain:
      "Цель «поддержание»: сбалансированные тренировки на всё тело, сила + мобильность.",
    improve_endurance:
      "Цель «выносливость»: круги с собственным весом, 12–20 повторов, короткий отдых 30–45 с.",
    strength:
      "Цель «сила»: базовые движения, 3–6 повторов, отдых 2–4 мин, прогрессия рабочих весов — в приоритете.",
  };
  bullets.push(goalBullets[profile.fitnessGoal]);

  const style = profile.trainingStyle ?? "balanced";
  const styleBullets: Partial<Record<TrainingStyle, string>> = {
    power: "Стиль «силовой»: повторы сдвинуты вниз (3–6), отдых увеличен — база на максимуме силы.",
    hypertrophy:
      "Стиль «объёмный»: повторы сдвинуты вверх (10–15), отдых сокращён — больше работы на мышцу.",
    functional:
      "Стиль «функциональный»: короткий отдых 30–45 с, комбинированная нагрузка.",
  };
  // Дефолтный стиль не объясняем — это и есть «классический» план.
  const styleBullet = styleBullets[style];
  if (styleBullet) bullets.push(styleBullet);

  bullets.push(
    `Тренировок в неделю: ${sessions}${profile.preferredTrainingDays ? " (по вашему выбору)" : ""} — выбрана схема «${splitType}».`,
  );
  bullets.push(
    "Прогрессия: +2.5 кг или +1–2 повтора, когда дойдёте до верхней границы диапазона. Цикл: база → +1 повтор → +2.5 кг → разгрузка.",
  );

  return bullets.slice(0, 8);
}

/** Строит сводку «под кого собран план»: пол, возраст, рост/вес, активность,
 *  цель, целевой вес, инвентарь, ограничения и количество замен.
 *  `hasWeighted`/`hasBarbell` — реальное наличие отягощений в финальном плане:
 *  для планов на собственном весе не пишем «стартовые веса рассчитаны» и
 *  «штанга — общий вес с грифом». */
function buildAdaptedFor(
  profile: TrainingProfile,
  substitutions: number,
  limitations: Limitation[],
  hasWeighted: boolean,
  hasBarbell: boolean,
): string {
  const parts: string[] = [];

  parts.push(
    `${GENDER_LABELS[profile.gender].toLowerCase()}, ${profile.age} лет, ` +
      `${profile.heightCm} см / ${profile.weightKg} кг`,
  );

  if (profile.fitnessGoal === "lose_weight") {
    parts.push("фокус на жиросжигание с сохранением мышц");
  } else if (profile.fitnessGoal === "gain_muscle") {
    parts.push("фокус на набор мышечной массы");
  } else if (profile.fitnessGoal === "improve_endurance") {
    parts.push("фокус на выносливость и работоспособность");
  } else if (profile.fitnessGoal === "strength") {
    parts.push("фокус на силовые показатели");
  } else {
    parts.push("поддержание формы");
  }

  if (profile.trainingStyle && profile.trainingStyle !== "balanced") {
    parts.push(
      `стиль: ${TRAINING_STYLE_LABELS[profile.trainingStyle].toLowerCase()}`,
    );
  }

  const activity =
    profile.activityLevel === "sedentary"
      ? "низкая повседневная активность"
      : ACTIVITY_LABELS[profile.activityLevel].toLowerCase();
  parts.push(`активность: ${activity}`);

  if (profile.targetWeightKg) {
    const direction =
      profile.targetWeightKg < profile.weightKg
        ? "дефицит"
        : profile.targetWeightKg > profile.weightKg
          ? "профицит"
          : "удержание";
    parts.push(`цель: ${profile.targetWeightKg} кг (${direction})`);
  }

  if (hasWeighted) parts.push("стартовые веса рассчитаны по профилю");
  // Штанговые упражнения: вес указан общим (гриф 20 кг включён).
  if (hasBarbell) parts.push("штанга — общий вес с грифом 20 кг");
  if (profile.age >= 50) parts.push("щадящий режим с возрастом (+30 с отдыха)");
  if (limitations.length > 0) {
    parts.push(
      `учтены ограничения: ${limitations.map((l) => LIMITATION_LABELS[l].toLowerCase()).join(", ")}`,
    );
  }
  if (substitutions > 0) parts.push(`${substitutions} замен под профиль`);

  const equipment = normalizeEquipment(profile.equipment);
  parts.push(
    equipment.length > 0
      ? `инвентарь: ${equipmentSummary(profile.equipment)}`
      : "инвентарь не выбран (полный зал)",
  );

  return parts.join(" · ");
}

/** Распределяет фокусы пула по числу тренировок в неделю:
 *  - если тренировок не больше фокусов — берём первые `sessions` (для
 *    «Жим/Тяга/Ноги/Плечи и руки» 3 дня = без плечевого дня);
 *  - иначе каждый фокус получает `floor(sessions/n)` дней по кругу, а
 *    остаток раздаётся с конца пула — «Ноги» и «Плечи и руки» получают
 *    второй день раньше, чем «Жимовая». Соседние дни никогда не
 *    дублируются (старт остатка сдвигается от последнего фокуса круга). */
function distributeSessions(pool: SessionSeed[], sessions: number): SessionSeed[] {
  const n = pool.length;
  if (sessions <= n) return pool.slice(0, sessions);

  const base = Math.floor(sessions / n);
  const extra = sessions % n;
  const out: SessionSeed[] = [];
  for (let r = 0; r < base; r++) {
    for (let i = 0; i < n; i++) out.push(pool[i]);
  }
  // Остаток: с конца пула, но не совпадающий с последним фокусом круга.
  const last = out[out.length - 1].name;
  let start = n - 1;
  if (pool[start].name === last) start = n - 2;
  for (let i = 0; i < extra; i++) {
    out.push(pool[(start - i + n) % n]);
  }
  return out;
}

/** Сдвигает диапазон повторов на delta с защитой от вырождения:
 *  «6–8» → «4–6», одиночное «5» → «3–5» (delta<0) или «5–7» (delta>0),
 *  минимум 3 повтора. Тайминги («30с») не трогаем. */
function shiftStyleReps(reps: string, delta: number): string {
  if (delta === 0) return reps;
  const range = reps.match(/^(\d+)\s*[–—-]\s*(\d+)(.*)$/);
  if (range) {
    const lo = Math.max(3, parseInt(range[1], 10) + delta);
    const hi = Math.max(lo, parseInt(range[2], 10) + delta);
    return `${lo}–${hi}${range[3]}`;
  }
  const single = reps.match(/^(\d+)(.*)$/);
  if (single) {
    const n = parseInt(single[1], 10);
    const shifted = Math.max(3, n + delta);
    return delta > 0
      ? `${n}–${shifted}${single[2]}`
      : `${shifted}–${n}${single[2]}`;
  }
  return reps;
}

/** Применяет предпочтение стиля к упражнению: сдвиг повторов и отдыха.
 *  Тайминги («30с») и кардио («30–40 мин») не трогаем — отдых там зашит
 *  в строку или не применим (повторы «мин» нельзя сдвигать по стилю). */
function applyTrainingStyle(exercise: Exercise, style: TrainingStyle): Exercise {
  const rule = STYLE_RULES[style];
  if (rule.repsDelta === 0 && rule.restDelta === 0) return exercise;
  const kind = classifyExercise(exercise);
  if (kind === "timed" || kind === "cardio") return exercise;
  return {
    ...exercise,
    reps: shiftStyleReps(exercise.reps, rule.repsDelta),
    restSeconds: Math.max(
      rule.restMin,
      exercise.restSeconds + rule.restDelta,
    ),
  };
}

/** Есть ли в пуле хоть одно упражнение, требующее снаряда (не только
 *  собственный вес)? По этому признаку решаем, переключать ли сплит для
 *  пользователей без инвентаря. */
function poolNeedsEquipment(pool: SessionSeed[]): boolean {
  return pool.some((s) =>
    s.exercises.some(
      (ex) =>
        !(EXERCISE_EQUIPMENT[ex.name]?.length === 1 &&
          EXERCISE_EQUIPMENT[ex.name][0] === "bodyweight"),
    ),
  );
}

export function generateWorkoutTemplate(
  profile: TrainingProfile,
): WorkoutTemplate {
  const equipmentOnly = normalizeEquipment(profile.equipment);
  // У пользователя ТОЛЬКО собственный вес (без гантелей/штанги/тренажёров).
  const bodyweightOnly =
    equipmentOnly.length > 0 && equipmentOnly.every((e) => e === "bodyweight");

  let { splitType, pool } = buildSessionPool(
    profile.fitnessGoal,
    profile.experienceLevel,
  );
  // Без инвентаря тренажёрный сплит («Жим/Тяга/Ноги», «Верх/Низ») выродился
  // бы в несколько одинаковых отжиманий. Переключаемся на фулбоди/круги,
  // которые почти целиком адаптируются под собственный вес.
  if (bodyweightOnly && poolNeedsEquipment(pool)) {
    const bw = buildSessionPool(profile.fitnessGoal, "beginner");
    splitType = `${bw.splitType} · без инвентаря`;
    pool = bw.pool;
  }
  const sessions = Math.min(
    6,
    Math.max(
      1,
      profile.preferredTrainingDays ??
        defaultSessions(profile.fitnessGoal, profile.experienceLevel),
    ),
  );
  const name = `${splitType} — ${EXPERIENCE_LABELS[profile.experienceLevel].toLowerCase()}`;

  // Сессии для недели: фокусы пула без соседних повторов, дополнительные
  // дни отдаются «Ногам» и «Плечам и рукам» (конец пула), а не жимовому дню.
  const order = distributeSessions(pool, sessions);
  const baseDays: WorkoutDay[] = order.map((seed, i) => {
    const day = sessions === 1 ? 1 : Math.min(6, Math.floor((i * 7) / sessions));
    return { day, focus: seed.name, exercises: seed.exercises };
  });

  const base: WorkoutTemplate = {
    name,
    splitType,
    sessionsPerWeek: sessions,
    durationWeeks: PLAN_WEEKS,
    days: baseDays,
  };

  if (profile.heightCm <= 0 || profile.weightKg <= 0) {
    return {
      ...base,
      howCalculated: buildHowCalculated(
        profile,
        {
          build: "average",
          heavy: false,
          bmi: 0,
          female: profile.gender === "female",
          senior: profile.age >= 50,
          mid: profile.age > 30 && profile.age < 50,
          underweight: false,
        },
        normalizeLimitations(profile.limitations),
        sessions,
        splitType,
      ),
    };
  }

  const { build, heavy, bmi } = classifyProfile(profile);
  const limitations = normalizeLimitations(profile.limitations);
  const ctx = {
    build,
    heavy,
    bmi,
    female: profile.gender === "female",
    senior: profile.age >= 50,
    mid: profile.age > 30 && profile.age < 50,
    underweight: bmi < 18.5,
  };
  const availableEquipment = new Set(normalizeEquipment(profile.equipment));

  let substitutions = 0;
  const days = baseDays.map((d) => {
    // Сначала антропометрия, потом ограничения, потом инвентарь — замены
    // применяются к итоговым именам.
    const anthrop = adaptDay(d, ctx);
    const injured = adaptForInjuries(anthrop.day, limitations);
    const equipped = adaptForEquipment(injured.day, availableEquipment);
    substitutions += injured.notes.length + equipped.notes.length;
    const notes = [...anthrop.notes, ...injured.notes, ...equipped.notes];

    const withWeights: WorkoutDay = {
      ...equipped.day,
      warmup: buildWarmup(profile, ctx, limitations),
      exercises: equipped.day.exercises.map((exercise) => {
        // Стиль тренировок (повторы/отдых) применяется после замен —
        // к итоговым именам упражнений.
        const styled = applyTrainingStyle(
          exercise,
          profile.trainingStyle ?? "balanced",
        );
        return {
          ...styled,
          weightKg: computeStartWeight(styled, profile),
          // Темп только для отягощённых упражнений.
          tempo: REFERENCE_WEIGHTS[styled.name] !== undefined
            ? TEMPO_BY_GOAL[profile.fitnessGoal]
            : undefined,
        };
      }),
    };
    const withMinutes: WorkoutDay = {
      ...withWeights,
      approxMinutes: estimateSessionMinutes(withWeights),
    };
    return notes.length > 0 ? { ...withMinutes, notes } : withMinutes;
  });

  const finalExercises = days.flatMap((d) => d.exercises);
  const hasWeighted = finalExercises.some((e) => e.weightKg !== undefined);
  const hasBarbell = finalExercises.some((e) => isBarbellExercise(e.name));

  return {
    name,
    adaptedFor: buildAdaptedFor(
      profile,
      substitutions,
      limitations,
      hasWeighted,
      hasBarbell,
    ),
    splitType,
    sessionsPerWeek: sessions,
    durationWeeks: PLAN_WEEKS,
    howCalculated: buildHowCalculated(profile, ctx, limitations, sessions, splitType),
    days,
  };
}

/** Слепок профиля — по нему определяется, устарел ли сохранённый план. */
export function profileSignature(profile: TrainingProfile): string {
  return [
    profile.gender,
    profile.age,
    profile.heightCm,
    profile.weightKg,
    profile.targetWeightKg ?? 0,
    profile.activityLevel,
    profile.fitnessGoal,
    profile.experienceLevel,
    normalizeEquipment(profile.equipment).slice().sort().join(","),
    normalizeLimitations(profile.limitations).slice().sort().join(","),
    profile.preferredTrainingDays ?? "",
    profile.trainingStyle ?? "",
  ].join("|");
}

/** Разминочные подходы: нарастающий процент от рабочего веса. */
export interface WarmUpSet {
  weightKg: number;
  reps: string;
}

/** Строит разминочную лестницу от рабочего веса: 40% → 60% → 80%,
 *  округлённую до блинов по 2.5 кг. `minKg` — нижняя граница веса
 *  (для штанговых упражнений — вес грифа 20 кг: разминочный подход на
 *  штанге не может быть легче пустого грифа). Без веса (собственный
 *  вес/кардио) возвращает пустой список — разминка не нужна.
 *  При малых весах несколько ступеней могут округлиться к одному весу —
 *  повторы с одинаковым весом схлопываются в один подход (не показываем
 *  «20 кг × 8, 20 кг × 6, 20 кг × 4»). */
export function warmUpSets(
  weightKg: number | undefined,
  minKg = 0,
): WarmUpSet[] {
  if (weightKg === undefined || !Number.isFinite(weightKg) || weightKg <= 0) {
    return [];
  }
  const steps = [
    { factor: 0.4, reps: "8–10" },
    { factor: 0.6, reps: "6–8" },
    { factor: 0.8, reps: "4–6" },
  ];
  const unique: WarmUpSet[] = [];
  for (const step of steps) {
    const weight = Math.min(weightKg, roundToPlate(weightKg * step.factor, minKg));
    const last = unique[unique.length - 1];
    if (!last || last.weightKg !== weight) {
      unique.push({ weightKg: weight, reps: step.reps });
    }
  }
  return unique;
}

type ExerciseKind = "weighted" | "bodyweight" | "timed" | "cardio";

function classifyExercise(ex: Exercise): ExerciseKind {
  if (ex.reps.includes("мин")) return "cardio";
  if (ex.reps.includes("с")) return "timed";
  if (BODYWEIGHT_NAMES.has(ex.name)) return "bodyweight";
  return "weighted";
}

/** Сдвигает диапазон повторений на delta: «6–8» → «7–9», «5» → «5–6»,
 *  «10–12 / нога» → «11–13 / нога». Строки без чисел возвращает как есть. */
function shiftReps(reps: string, delta: number): string {
  const range = reps.match(/^(\d+)\s*[–—-]\s*(\d+)(.*)$/);
  if (range) {
    return `${parseInt(range[1], 10) + delta}–${parseInt(range[2], 10) + delta}${range[3]}`;
  }
  const single = reps.match(/^(\d+)(.*)$/);
  if (single) {
    return `${parseInt(single[1], 10)}–${parseInt(single[1], 10) + delta}${single[2]}`;
  }
  return reps;
}

/** Сдвигает время/секунды: «30–45с» → «35–50с», «20с / 40с отдых» → «25с / 40с отдых». */
function shiftTime(reps: string, delta: number): string {
  const range = reps.match(/^(\d+)\s*[–—-]\s*(\d+)(.*)$/);
  if (range) {
    return `${parseInt(range[1], 10) + delta}–${parseInt(range[2], 10) + delta}${range[3]}`;
  }
  const single = reps.match(/^(\d+)(.*)$/);
  if (single) {
    return `${parseInt(single[1], 10) + delta}${single[2]}`;
  }
  return reps;
}

/** Рабочий вес упражнения на неделю цикла (индекс 0..3):
 *  база — стартовый, прогресс — тот же, пик — +2.5 кг, разгрузка — −20%.
 *  `minKg` ограничивает снижение: для штанги разгрузка не опускается ниже
 *  веса грифа (пустой гриф — минимальная нагрузка). */
function progressWeight(
  weightKg: number | undefined,
  weekIdx: number,
  minKg = 0,
): number | undefined {
  if (weightKg === undefined) return undefined;
  if (weekIdx === 0 || weekIdx === 1) return weightKg;
  if (weekIdx === 2) return roundToPlate(weightKg + 2.5, minKg);
  return roundToPlate(weightKg * 0.8, minKg);
}

/** Пересчитывает упражнение для конкретной недели цикла (индекс 0..3):
 *  Неделя 1 — база, Неделя 2 — те же веса +1 повтор (двойная прогрессия),
 *  Неделя 3 — +2.5 кг (для безвесовых — +1 подход), повторения к базе,
 *  Неделя 4 — разгрузка: −20% веса / −1 подход (штанга — не ниже грифа). */
function progressExercise(ex: Exercise, weekIdx: number): Exercise {
  const minKg = minWeightFor(ex.name);
  const weightKg = progressWeight(ex.weightKg, weekIdx, minKg);
  if (weekIdx === 0) return ex;

  const kind = classifyExercise(ex);

  // Неделя 2 — двойная прогрессия: та же нагрузка, больше повторений.
  if (weekIdx === 1) {
    if (kind === "weighted") {
      return {
        ...ex,
        weightKg,
        reps: shiftReps(ex.reps, 1),
        weightNote: "те же веса, +1 повтор",
      };
    }
    if (kind === "bodyweight") {
      return { ...ex, reps: shiftReps(ex.reps, 1), weightNote: "+1 повтор" };
    }
    if (kind === "timed") {
      return { ...ex, reps: shiftTime(ex.reps, 5), weightNote: "+5 секунд" };
    }
    return { ...ex, reps: shiftTime(ex.reps, 5), weightNote: "+5 минут" };
  }

  // Неделя 3 — пик: вес вверх, повторения к базе.
  if (weekIdx === 2) {
    if (kind === "weighted") {
      return { ...ex, weightKg, weightNote: "+2.5 кг" };
    }
    if (kind === "bodyweight" || kind === "timed") {
      return { ...ex, sets: ex.sets + 1, weightNote: "+1 подход" };
    }
    return { ...ex, reps: shiftTime(ex.reps, 10), weightNote: "+10 минут" };
  }

  // Неделя 4 — разгрузка: меньше объёма и веса, восстановление.
  if (kind === "cardio") {
    return { ...ex, weightNote: "−30% объёма" };
  }
  return {
    ...ex,
    weightKg,
    sets: Math.max(2, ex.sets - 1),
    weightNote: kind === "weighted" ? "−20% веса" : "лёгкий день",
  };
}

/** Раскладывает недельный шаблон на цикл прогрессии из `weeks` недель
 *  (по умолчанию 4): каждая неделя содержит те же дни, но с пересчитанными
 *  подходами/повторами и рабочими весами. */
export function applyProgression(
  template: WorkoutTemplate,
  weeks: number = PLAN_WEEKS,
): ProgressionWeek[] {
  return Array.from({ length: weeks }, (_, i) => {
    const phase = PROGRESSION_PHASES[i % PROGRESSION_PHASES.length];
    const days = template.days.map((day) => ({
      ...day,
      exercises: day.exercises.map((exercise) =>
        progressExercise(exercise, i),
      ),
    }));
    return {
      week: i + 1,
      label: `Неделя ${i + 1} · ${phase.label}`,
      weightNote: phase.hint,
      days,
    };
  });
}

/** Рабочие секунды одного подхода для `reps` (строки вида «6–8», «30с»,
 *  «20с / 40с отдых», «30–40 мин»). Для повторов — ~2.5 с на повтор,
 *  для секундных интервалов — само время работы, для минут — минуты. */
function workSecondsPerSet(reps: string): number {
  const nums = (reps.match(/\d+/g) ?? []).map(Number);
  const avg = nums.reduce((s, n) => s + n, 0) / Math.max(1, nums.length);
  if (reps.includes("мин")) return avg * 60;
  if (reps.includes("с")) return avg; // «30с» или «20с / 40с отдых» — работа = avg
  return avg * 2.5;
}

/** Примерная длительность тренировки в минутах: разминка + сумма подходов
 *  (работа + отдых). Показывает пользователю, сколько времени заложить. */
export function estimateSessionMinutes(day: WorkoutDay): number {
  const warmup = (day.warmup?.length ?? 0) > 0 ? 6 : 3;
  const training = day.exercises.reduce(
    (s, ex) => s + ex.sets * (workSecondsPerSet(ex.reps) + ex.restSeconds),
    0,
  );
  return Math.max(10, Math.round((warmup + training) / 60));
}
