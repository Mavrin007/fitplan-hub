/** Авторегуляция нагрузки по субъективной оценке усилия (RPE).
 *
 *  После каждой тренировки пользователь отвечает «насколько тяжело было» —
 *  лёгко / норм / тяжело. При пересборке плана стартовые веса следующего
 *  цикла отталкиваются от последних фактически поднятых весов и УСРЕДНЁННОЙ
 *  оценки за последние 2–3 тренировки (чтобы одна тяжёлая или лёгкая сессия
 *  не переворачивала план):
 *  - лёгко  → вес следующего цикла выше последнего поднятого (+2.5 кг);
 *  - норм   → стартуем ровно с последнего поднятого веса (прогрессию даёт
 *    сам цикл: +1 повтор, затем +2.5 кг на пике);
 *  - тяжело → вес ниже последнего (−2.5 кг), щадящий старт для восстановления.
 *  Без оценки (старые логи / не отвечали) веса остаются из профиля как есть.
 *  Для штанговых упражнений вес не опускается ниже грифа (20 кг) — пустой
 *  гриф это минимально возможная нагрузка на штанге. */

import type { WorkoutTemplate } from "./workoutLibrary";
import { BARBELL_BAR_WEIGHT_KG, isBarbellExercise } from "./workoutLibrary";

export type Effort = "easy" | "normal" | "hard";

export const EFFORT_LABELS: Record<Effort, string> = {
  easy: "Легко",
  normal: "Норм",
  hard: "Тяжело",
};

export const EFFORT_HINTS: Record<Effort, string> = {
  easy: "веса можно поднять",
  normal: "оставить как есть",
  hard: "не поднимать веса",
};

export const EFFORT_COLORS: Record<Effort, string> = {
  easy: "bg-emerald-500",
  normal: "bg-amber-500",
  hard: "bg-red-500",
};

/** Сколько последних тренировок учитываем при усреднении оценки. */
export const EFFORT_WINDOW = 3;

/** Числовые веса для усреднения: лёгко = 1 … тяжело = 3. */
const EFFORT_SCORE: Record<Effort, number> = {
  easy: 1,
  normal: 2,
  hard: 3,
};

/** Обратное преобразование среднего балла в метку усилия. */
function scoreToEffort(avg: number): Effort {
  if (avg < 1.5) return "easy";
  if (avg <= 2.5) return "normal";
  return "hard";
}

/** Лог тренировки в минимальном виде — всё, что нужно для расчёта. */
interface EffortLog {
  date: string;
  effort?: string | null;
  exercises: { name: string; weightKg: number }[];
}

/** Округляет вес до ближайших 2.5 кг (под «блины»). Минимум — `minKg`
 *  (2.5 кг по умолчанию; для штанговых упражнений — вес грифа 20 кг). */
function roundToPlate(kg: number, minKg = 2.5): number {
  return Math.max(minKg, Math.round(kg / 2.5) * 2.5);
}

/** По каждому упражнению — усреднённая оценка усилия за последние `window`
 *  тренировок (по умолчанию 3) и последний фактически поднятый вес. */
export function lastEffortByExercise(
  logs: EffortLog[],
  window: number = EFFORT_WINDOW,
): Map<string, { effort: Effort; weightKg: number }> {
  // Промежуточное накопление: баллы усилия и вес из самого свежего лога.
  const acc = new Map<string, { scores: number[]; weightKg: number }>();
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));

  for (const log of sorted) {
    const effort = log.effort;
    if (!effort || !(effort in EFFORT_SCORE)) continue;
    for (const ex of log.exercises) {
      if (ex.weightKg <= 0) continue;
      const cur = acc.get(ex.name);
      if (cur) {
        // Собираем баллы, пока не набрали окно из последних тренировок.
        if (cur.scores.length < window) {
          cur.scores.push(EFFORT_SCORE[effort as Effort]);
        }
      } else {
        // Самый свежий лог с этим упражнением — он же даёт последний вес.
        acc.set(ex.name, {
          scores: [EFFORT_SCORE[effort as Effort]],
          weightKg: ex.weightKg,
        });
      }
    }
  }

  const result = new Map<string, { effort: Effort; weightKg: number }>();
  for (const [name, { scores, weightKg }] of acc) {
    const avg = scores.reduce((s, x) => s + x, 0) / scores.length;
    result.set(name, { effort: scoreToEffort(avg), weightKg });
  }
  return result;
}

/** Корректирует стартовые веса плана по усреднённой оценке усилия.
 *  Штанговые упражнения не опускаются ниже веса грифа (20 кг). */
export function applyEffortAdjustment(
  template: WorkoutTemplate,
  logs: EffortLog[],
): WorkoutTemplate {
  const effort = lastEffortByExercise(logs);
  if (effort.size === 0) return template;

  const days = template.days.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const info = effort.get(ex.name);
      if (!info) return ex;
      const delta =
        info.effort === "easy" ? 2.5 : info.effort === "hard" ? -2.5 : 0;
      return {
        ...ex,
        weightKg: roundToPlate(
          info.weightKg + delta,
          isBarbellExercise(ex.name) ? BARBELL_BAR_WEIGHT_KG : 2.5,
        ),
        // Помечаем, что вес скорректирован по прошлым тренировкам.
        weightNote: ex.weightNote
          ? `${ex.weightNote} · по усилию: ${EFFORT_LABELS[info.effort].toLowerCase()}`
          : `по усилию: ${EFFORT_LABELS[info.effort].toLowerCase()}`,
      };
    }),
  }));

  return { ...template, days };
}

/** Сколько упражнений в плане будет скорректировано по усилию (для тостов). */
export function effortAdjustedCount(template: WorkoutTemplate): number {
  return template.days.reduce(
    (s, d) =>
      s +
      d.exercises.filter((ex) => ex.weightNote?.includes("по усилию")).length,
    0,
  );
}
