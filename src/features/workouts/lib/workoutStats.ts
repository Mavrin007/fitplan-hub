/**
 * Чистые агрегаты статистики «Тренировок»: недельный тоннаж и личные
 * рекорды. Вынесены из Workouts.tsx, покрыты тестами.
 */

import type { Doc } from "@/convex/_generated/dataModel";
import { shortDate } from "@/lib/dates";
import { weekStart } from "./workoutFormatting";

export type WorkoutLog = Doc<"workoutLogs">;

export interface TonnagePoint {
  label: string;
  tonnage: number;
  // Совместимость с форматом данных SVGBarChart (Record<string, string | number>).
  [key: string]: string | number;
}

export interface PersonalRecord {
  name: string;
  weightKg: number;
  date: string;
  sets: number;
  reps: number;
}

/** Недельный тоннаж: вес × повторы × подходы по всем упражнениям за неделю. */
export function tonnageByWeek(logs: WorkoutLog[]): TonnagePoint[] {
  const byWeek = new Map<string, number>();
  for (const log of logs) {
    let sum = 0;
    for (const ex of log.exercises) {
      if (ex.weightKg > 0) sum += ex.weightKg * ex.reps * ex.sets;
    }
    if (sum === 0) continue;
    const wk = weekStart(log.date);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + sum);
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-10)
    .map(([wk, tonnage]) => ({ label: shortDate(wk), tonnage: Math.round(tonnage) }));
}

/** Личные рекорды: максимальный вес по каждому упражнению (до 8 записей). */
export function personalRecords(logs: WorkoutLog[]): PersonalRecord[] {
  const best = new Map<
    string,
    { weightKg: number; date: string; sets: number; reps: number }
  >();
  for (const log of logs) {
    for (const ex of log.exercises) {
      if (ex.weightKg <= 0) continue;
      const cur = best.get(ex.name);
      if (!cur || ex.weightKg > cur.weightKg) {
        best.set(ex.name, {
          weightKg: ex.weightKg,
          date: log.date,
          sets: ex.sets,
          reps: ex.reps,
        });
      }
    }
  }
  return [...best.entries()]
    .sort((a, b) => b[1].weightKg - a[1].weightKg)
    .slice(0, 8)
    .map(([name, p]) => ({ name, ...p }));
}
