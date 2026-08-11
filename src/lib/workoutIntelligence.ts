/**
 * «Рекомендация KILO» и сводка завершённой тренировки.
 *
 * Чистые функции без React: из последнего лога упражнения (вес, повторы,
 * RPE/усилие) и цели плана выводятся две вещи — что делать в этом подходе
 * (рекомендуемая нагрузка) и что получилось после тренировки (объём, дельта
 * к прошлой сессии, личные рекорды).
 *
 * Load Intelligence v2: шаг нагрузки зависит от ОБОРУДОВАНИЯ упражнения, а
 * не от универсальных +2.5 кг:
 *  - штанга / тренажёр / блок — шаг 2.5 кг (блины/пины);
 *  - гантели — следующий реально доступный вес из набора (2 кг до 10,
 *    далее 2.5: 20 → 22.5);
 *  - гири — стандартный ряд гирь (16 → 20 → 24 → 28…);
 *  - собственный вес — вес не меняется, прогресс через повторы.
 *
 * ВАЖНО: это рекомендация, а не медицинское предписание. При недостатке
 * данных рекомендация не выдаётся («new»), чтобы не выдумывать цифры.
 */

import { BARBELL_BAR_WEIGHT_KG, isBarbellExercise } from "./workoutLibrary";
import { EXERCISE_EQUIPMENT, type Equipment } from "./workoutData";
import type { Effort } from "./effort";

/** Последняя запись упражнения из истории тренировок. */
export interface LastExerciseEntry {
  weightKg: number;
  /** Фактически выполненные повторы (из лога). */
  reps?: number;
  /** Субъективная оценка подхода по шкале 1–10 (RPE), если заполнена. */
  rpe?: number;
}

export type LoadKind = "new" | "up" | "keep" | "down";

/** Оборудование упражнения с точки зрения доступного шага веса. */
export type LoadEquipment = Equipment | "unknown";

export interface LoadRecommendation {
  kind: LoadKind;
  /** Рекомендуемый вес; undefined для собственного веса (вес не меняется). */
  weightKg?: number;
  /** Диапазон повторов из плана; null — «на время» (напр. «30s»). */
  repsMin: number | null;
  repsMax: number | null;
  /** Почему такая рекомендация — человекочитаемо. */
  reasoning: string;
  /** Короткая подпись для бейджа: «добавь 2.5 кг», «следующий вес гантелей»… */
  stepLabel?: string;
  /** Оборудование, по которому выбран шаг. */
  equipment: LoadEquipment;
}

export interface RecommendLoadInput {
  name: string;
  /** Стартовый вес из плана (фолбэк для новых упражнений). */
  planWeightKg?: number;
  /** Цель плана: «8-12», «8», «30s». */
  planReps: string;
  /** Самая свежая запись этого упражнения. */
  last?: LastExerciseEntry;
  /** Усреднённое усилие за последние тренировки (фолбэк, если RPE нет). */
  effort?: Effort;
}

/** Главное оборудование упражнения: при нескольких вариантах предпочитаем
 *  отягощённый снаряд (штанга > гантели > гиря > тренажёр > блок > вес тела). */
export function loadEquipmentFor(name: string): LoadEquipment {
  const list = EXERCISE_EQUIPMENT[name];
  if (!list || list.length === 0) return "unknown";
  const preference: Equipment[] = [
    "barbell",
    "kettlebell",
    "dumbbell",
    "machine",
    "cable",
    "bodyweight",
  ];
  for (const eq of preference) {
    if (list.includes(eq)) return eq;
  }
  return "unknown";
}

/** Реальные доступные веса гантелей: 2 кг до 10, далее 2.5 кг (20 → 22.5). */
const DUMBBELL_LADDER = [
  2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40,
  42.5, 45, 47.5, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
];

/** Стандартный ряд гирь: шаг 2 кг до 16, далее 4 кг. */
const KETTLEBELL_LADDER = [
  4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60,
];

/** Следующий доступный вес выше `w` (лестница) с запасом на float-ошибки. */
function nextInLadder(ladder: number[], w: number): number {
  return ladder.find((v) => v > w + 1e-9) ?? Math.ceil((w + 2.5) / 2.5) * 2.5;
}

/** Ближайший доступный вес ниже `w` (лестница). */
function prevInLadder(ladder: number[], w: number): number {
  const below = [...ladder].reverse().find((v) => v < w - 1e-9);
  return below ?? Math.max(ladder[0] ?? 2.5, w - 2.5);
}

/** Шаг 2.5 кг: вверх — округление вверх (вес обязан увеличиться), вниз — вниз. */
function stepWeight(w: number, direction: 1 | -1, minKg: number): number {
  const target = w + direction * 2.5;
  const rounded =
    direction > 0
      ? Math.ceil(target / 2.5) * 2.5
      : Math.floor(target / 2.5) * 2.5;
  return Math.max(minKg, rounded);
}

/** Шаг нагрузки по оборудованию: следующий/предыдущий доступный вес.
 *  Публичная обёртка — используется и в рекомендации, и в −/+ рядом с полем
 *  веса в режиме тренировки (тот же «реальный следующий снаряд», что и у
 *  рекомендации: гантели 20 → 22.5, гири 20 → 24, штанга 70 → 72.5). */
export function shiftAvailableWeight(
  equipment: LoadEquipment,
  current: number,
  direction: 1 | 0 | -1,
  minKg: number,
): number | undefined {
  if (equipment === "bodyweight") return undefined; // вес тела не меняется
  if (direction === 0) return current;
  if (equipment === "dumbbell") {
    return direction > 0
      ? nextInLadder(DUMBBELL_LADDER, current)
      : prevInLadder(DUMBBELL_LADDER, current);
  }
  if (equipment === "kettlebell") {
    return direction > 0
      ? nextInLadder(KETTLEBELL_LADDER, current)
      : prevInLadder(KETTLEBELL_LADDER, current);
  }
  return stepWeight(current, direction, minKg);
}

/** Человекочитаемая подпись шага для бейджа «Рекомендация KILO». */
function stepLabelFor(
  equipment: LoadEquipment,
  kind: "up" | "keep" | "down",
): string {
  if (kind === "keep") {
    return equipment === "bodyweight" ? "сохрани подход" : "сохрани вес";
  }
  if (kind === "down") {
    return equipment === "bodyweight" ? "облегчи подход" : "снизь вес";
  }
  if (equipment === "dumbbell") return "следующий вес гантелей";
  if (equipment === "kettlebell") return "следующая гиря";
  if (equipment === "bodyweight") return "добавь повторы";
  return "добавь 2.5 кг";
}

/**
 * Диапазон повторов из строки плана:
 *  «8-12» → [8, 12]; «8» → [6, 8] (буфер чуть ниже планки); «30s» → null.
 */
export function parseRepsRange(planReps: string): [number, number] | null {
  const trimmed = planReps.trim();
  // «30s», «45 сек» — подход на время, диапазон повторов не имеет смысла.
  if (/s$/i.test(trimmed) || /сек/i.test(trimmed)) return null;
  const range = trimmed.match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (range) return [Number(range[1]), Number(range[2])];
  const single = trimmed.match(/\d+/);
  if (!single) return null;
  const n = Number(single[0]);
  return [Math.max(1, n - 2), n];
}

/** RPE 1–10 → направление нагрузки (по заданию: ≤7 — добавить, 8–10 — нет). */
function kindFromRpe(rpe: number): { kind: "up" | "keep"; why: string } {
  if (rpe <= 7) {
    return {
      kind: "up",
      why: "в прошлый раз оставались повторы в запасе — можно прибавить",
    };
  }
  if (rpe === 8) {
    return { kind: "keep", why: "нагрузка была рабочей — вес сохраняем, добираем повторы" };
  }
  if (rpe === 9) {
    return { kind: "keep", why: "было тяжело — вес не поднимаем, цель — те же повторы" };
  }
  return { kind: "keep", why: "подходы шли на пределе — не увеличиваем вес" };
}

/**
 * Рекомендуемая нагрузка на сегодня для упражнения (Load Intelligence v2):
 *  - RPE ≤ 7    → следующий доступный вес по оборудованию;
 *  - RPE 8–10   → вес сохраняем (8 — добираем повторы, 9–10 — не поднимаем);
 *  - RPE нет    → фолбэк по усилию «легко/норм/тяжело»;
 *  - собственный вес → вес не меняется, прогресс через повторы;
 *  - данных нет → рекомендация не выдаётся («new»).
 *
 * «Доступный вес» — не абстрактные +2.5 кг, а реальный следующий снаряд:
 * гантели 20 → 22.5, гири 20 → 24, штанга/тренажёр 70 → 72.5.
 */
export function recommendLoad(input: RecommendLoadInput): LoadRecommendation {
  const last = input.last;
  const equipment = loadEquipmentFor(input.name);
  const range = parseRepsRange(input.planReps);
  const [repsMin, repsMax] = range ?? [null, null];

  // Недостаточно данных — рекомендация не даётся (не выдумываем цифры).
  // Для упражнений с собственным весом вес не нужен — достаточно повторов.
  const isBodyweight = equipment === "bodyweight";
  if (!last || (!isBodyweight && last.weightKg <= 0)) {
    return {
      kind: "new",
      repsMin,
      repsMax,
      equipment,
      reasoning: input.planWeightKg
        ? `Нет данных прошлой тренировки — начните с веса плана (${input.planWeightKg} кг), ориентируйтесь по самочувствию.`
        : "Нет данных прошлой тренировки — ориентируйтесь по самочувствию.",
    };
  }

  const prev = isBodyweight
    ? `${last.reps ?? "—"} повторов`
    : `${last.weightKg} кг × ${last.reps ?? "—"}`;
  let kind: LoadKind;
  let why: string;

  const rpe = last.rpe;
  if (rpe !== undefined && rpe >= 1 && rpe <= 10) {
    const byRpe = kindFromRpe(rpe);
    kind = byRpe.kind;
    why = `в прошлый раз ${prev} при RPE ${rpe} — ${byRpe.why}`;
  } else if (input.effort) {
    if (input.effort === "easy") {
      kind = "up";
      why = `в прошлый раз ${prev} и было легко — можно прибавить`;
    } else if (input.effort === "hard") {
      kind = "down";
      why = `тренировка была тяжёлой — снизьте нагрузку и добейте повторы`;
    } else {
      kind = "keep";
      why = `в прошлый раз ${prev} — нагрузку сохраняем, ориентир по самочувствию`;
    }
  } else {
    kind = "keep";
    why = `в прошлый раз ${prev} — сохраните нагрузку, ориентир по самочувствию`;
  }

  // Собственный вес: снаряд не меняется — двигаем повторы (up) или советуем
  // облегчить подход (down), вес в рекомендации не указываем.
  if (isBodyweight) {
    const shifted = kind === "up" && repsMin !== null && repsMax !== null;
    return {
      kind,
      equipment,
      repsMin: shifted ? repsMin + 1 : repsMin,
      repsMax: shifted ? repsMax + 1 : repsMax,
      stepLabel: stepLabelFor(equipment, kind),
      reasoning:
        kind === "up"
          ? `${why} — добавьте 1–2 повтора в каждом подходе`
          : why,
    };
  }

  const minKg = isBarbellExercise(input.name) ? BARBELL_BAR_WEIGHT_KG : 2.5;
  const direction = kind === "up" ? 1 : kind === "down" ? -1 : 0;
  const weightKg = shiftAvailableWeight(equipment, last.weightKg, direction, minKg);
  if (weightKg === undefined) {
    // Практически недостижимо для не-bodyweight, но TS требует ветку.
    return { kind, repsMin, repsMax, equipment, reasoning: why };
  }

  // В обоснование вплетаем конкретный доступный вес: «можно взять 22.5 кг».
  const deltaNote =
    kind === "up"
      ? ` — следующий доступный вес: ${weightKg} кг`
      : kind === "down"
        ? ` — доступный вес ниже: ${weightKg} кг`
        : "";
  return {
    kind,
    weightKg,
    repsMin,
    repsMax,
    equipment,
    stepLabel: stepLabelFor(equipment, kind),
    reasoning: `${why}${deltaNote}`,
  };
}

/** Упражнение из завершённой тренировки (минимальная форма для расчётов). */
export interface SummaryExercise {
  name: string;
  sets: number;
  reps: number;
  weightKg: number;
  /** Фактические подходы (вес × повторы × RPE) — объём и повторы считаются
   *  по ним, когда они есть; иначе фолбэк на агрегат sets × reps. */
  setDetails?: { weightKg: number; reps: number; rpe?: number }[];
}

export interface SummaryLog {
  date: string;
  exercises: SummaryExercise[];
}

export interface WorkoutSummaryInput {
  /** Что сделано в только что завершённой тренировке. */
  exercises: SummaryExercise[];
  /** История тренировок (для сравнения объёма и рекордов). */
  prevLogs: SummaryLog[];
  /** Плановая длительность сессии (мин), если известна. */
  planMinutes?: number;
}

export interface WorkoutSummary {
  exerciseCount: number;
  setCount: number;
  totalReps: number;
  /** Тоннаж = вес × повторы × подходы (кг). */
  tonnage: number;
  /** Плановая длительность (мин) или null. */
  minutes: number | null;
  /** Δ объёма к ближайшей прошлой тренировке, %; null — сравнивать не с чем. */
  tonnageDeltaPct: number | null;
  /** Упражнения, где сегодня установлен личный рекорд по весу. */
  prs: string[];
}

function tonnageOf(exercises: SummaryExercise[]): number {
  return exercises.reduce((s, e) => {
    if (e.setDetails && e.setDetails.length > 0) {
      // Реальный тоннаж: сумма весов × повторов по каждому подходу.
      return s + e.setDetails.reduce((ss, d) => ss + d.weightKg * d.reps, 0);
    }
    return s + e.weightKg * e.reps * e.sets;
  }, 0);
}

/**
 * Сводка завершённой тренировки: упражнения, подходы, объём, сравнение с
 * прошлой сессией и личные рекорды. Без данных прошлых тренировок сравнения
 * не выдумываются — только факты текущей сессии.
 */
export function buildWorkoutSummary(input: WorkoutSummaryInput): WorkoutSummary {
  const tonnage = tonnageOf(input.exercises);
  const sorted = [...input.prevLogs].sort((a, b) => b.date.localeCompare(a.date));
  const prev = sorted[0];
  const prevTonnage = prev ? tonnageOf(prev.exercises) : 0;
  const tonnageDeltaPct =
    prev && prevTonnage > 0 ? ((tonnage - prevTonnage) / prevTonnage) * 100 : null;

  // Личный рекорд: сегодняшний вес выше максимального исторического — только
  // если по упражнению уже есть история (первый раз рекордом не считается).
  const maxByExercise = new Map<string, number>();
  for (const log of sorted) {
    for (const ex of log.exercises) {
      const cur = maxByExercise.get(ex.name);
      if (cur === undefined || ex.weightKg > cur) {
        maxByExercise.set(ex.name, ex.weightKg);
      }
    }
  }
  const prs = input.exercises
    .filter((e) => {
      const best = maxByExercise.get(e.name);
      return best !== undefined && e.weightKg > 0 && e.weightKg > best;
    })
    .map((e) => e.name);

  return {
    exerciseCount: input.exercises.length,
    setCount: input.exercises.reduce((s, e) => s + e.sets, 0),
    // Сумма повторов по подходам (по setDetails — точно, иначе агрегат).
    totalReps: input.exercises.reduce((s, e) => {
      if (e.setDetails && e.setDetails.length > 0) {
        return s + e.setDetails.reduce((ss, d) => ss + d.reps, 0);
      }
      return s + e.reps;
    }, 0),
    tonnage,
    minutes: input.planMinutes ?? null,
    tonnageDeltaPct,
    prs,
  };
}
