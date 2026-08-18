/**
 * Чистые утилиты страницы «Тренировки»: оформление, группировка недель,
 * сводка изменений плана. Вынесены из Workouts.tsx, чтобы страница оставалась
 * тонкой и утилиты покрывались тестами без рендера.
 */

import {
  ArrowUpDown,
  Bike,
  Dumbbell,
  Flame,
  Footprints,
  MoveUp,
  Repeat,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  ACTIVITY_LABELS,
  EXPERIENCE_LABELS,
  GENDER_LABELS,
  GOAL_LABELS,
  TRAINING_STYLE_LABELS,
} from "@/lib/i18n";
import {
  equipmentSummary,
  normalizeEquipment,
  normalizeLimitations,
  type TrainingProfile,
  type WorkoutTemplate,
} from "@/lib/workoutLibrary";
import type { TrainingStyle } from "@/lib/nutrition";

/** Placeholder-иллюстрация тренировки (M3: градиент + иконка фокуса,
 *  единый стиль с карточками приёмов на «Питании»). */
export const WORKOUT_ART: Record<string, { icon: LucideIcon; gradient: string }> = {
  "Фулбоди A": { icon: Dumbbell, gradient: "to-primary-container/50" },
  "Фулбоди B": { icon: Dumbbell, gradient: "to-primary-container/50" },
  "Жимовая": { icon: MoveUp, gradient: "to-tertiary-container/40" },
  "Тяговая": { icon: ArrowUpDown, gradient: "to-primary-container/40" },
  "Ноги": { icon: Footprints, gradient: "to-tertiary-container/50" },
  "Плечи и руки": { icon: MoveUp, gradient: "to-tertiary-container/50" },
  "Круговая": { icon: Repeat, gradient: "to-primary-container/60" },
  HIIT: { icon: Zap, gradient: "to-tertiary-container/60" },
  "Метаболический круг": { icon: Flame, gradient: "to-primary-container/40" },
  "Лёгкое кардио": { icon: Bike, gradient: "to-tertiary-container/40" },
};

/** Арт по имени фокуса с запасным вариантом. */
export function workoutArt(focus: string): { icon: LucideIcon; gradient: string } {
  return (
    WORKOUT_ART[focus] ?? { icon: Dumbbell, gradient: "to-primary-container/50" }
  );
}

/** Понедельник недели для даты «YYYY-MM-DD» — по нему группируем тоннаж. */
export function weekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const offset = (dt.getDay() + 6) % 7; // Пн = 0
  dt.setDate(dt.getDate() - offset);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Собирает краткий итог того, что изменилось при пересборке плана:
 *  какие поля профиля обновились (по старой сигнатуре) и сколько
 *  упражнений было заменено под новый профиль. */
export function planChangeSummary(
  oldPlan: {
    name: string;
    days: { day: number; exercises: { name: string }[] }[];
  } | null,
  oldSignature: string | null,
  template: WorkoutTemplate,
  profile: TrainingProfile,
): string {
  const parts: string[] = [];

  // Что изменилось в данных профиля (порядок полей совпадает с profileSignature).
  if (oldSignature) {
    const s = oldSignature.split("|");
    if (s.length >= 8) {
      const [gender, age, height, weight, target, activity, goal, experience] = s;
      if (gender !== profile.gender)
        parts.push(`пол: ${GENDER_LABELS[profile.gender].toLowerCase()}`);
      if (age !== String(profile.age)) parts.push(`возраст: ${profile.age} лет`);
      if (height !== String(profile.heightCm))
        parts.push(`рост: ${profile.heightCm} см`);
      if (weight !== String(profile.weightKg))
        parts.push(`вес: ${profile.weightKg} кг`);
      if (target !== String(profile.targetWeightKg ?? 0))
        parts.push(`целевой вес: ${profile.targetWeightKg ?? "—"} кг`);
      if (activity !== profile.activityLevel)
        parts.push(`активность: ${ACTIVITY_LABELS[profile.activityLevel].toLowerCase()}`);
      if (goal !== profile.fitnessGoal)
        parts.push(`цель: ${GOAL_LABELS[profile.fitnessGoal].toLowerCase()}`);
      if (experience !== profile.experienceLevel)
        parts.push(`опыт: ${EXPERIENCE_LABELS[profile.experienceLevel].toLowerCase()}`);
      // 9-й сегмент (с версии с инвентарём) — отсортированные ключи инвентаря.
      const oldEquip = s[8] ?? "";
      const newEquip = normalizeEquipment(profile.equipment).slice().sort().join(",");
      if (oldEquip !== newEquip) parts.push(`инвентарь: ${equipmentSummary(profile.equipment)}`);
      // 10-й сегмент — ограничения, 11-й — предпочитаемые дни в неделю.
      const oldLimits = s[9] ?? "";
      const newLimits = normalizeLimitations(profile.limitations)
        .slice()
        .sort()
        .join(",");
      if (oldLimits !== newLimits) parts.push("учтены новые ограничения");
      if (s.length >= 11) {
        const oldDays = s[10] ?? "";
        const newDays = String(profile.preferredTrainingDays ?? "");
        if (oldDays !== newDays && newDays) parts.push(`дней в неделю: ${newDays}`);
      }
      // 12-й сегмент (с версии со стилем тренировок) — предпочтение стиля.
      if (s.length >= 12) {
        const oldStyle = s[11] ?? "";
        const newStyle = profile.trainingStyle ?? "";
        if (oldStyle !== newStyle && newStyle) {
          parts.push(`стиль: ${TRAINING_STYLE_LABELS[newStyle as TrainingStyle].toLowerCase()}`);
        }
      }
    }
  }

  // Изменения структуры плана: число тренировок и замены упражнений.
  if (oldPlan && template) {
    if (oldPlan.days.length !== template.days.length) {
      parts.push(`тренировок: ${oldPlan.days.length} → ${template.days.length}`);
    }
    let substitutions = 0;
    for (const day of template.days) {
      const oldDay = oldPlan.days.find((d) => d.day === day.day);
      if (!oldDay) continue;
      const oldNames = new Set(oldDay.exercises.map((e) => e.name));
      for (const exercise of day.exercises) {
        if (!oldNames.has(exercise.name)) substitutions++;
      }
    }
    if (substitutions > 0) parts.push(`${substitutions} замен упражнений`);
  }

  return parts.slice(0, 3).join(" · ");
}
