/**
 * Статистика «Тренировок»: недельный тоннаж и личные рекорды — мемоизированные
 * обёртки над чистыми функциями lib/workoutStats. Вынесено из Workouts.tsx.
 */

import { useMemo } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import { personalRecords, tonnageByWeek } from "../lib/workoutStats";

export function useWorkoutStats(
  logs: Doc<"workoutLogs">[] | undefined,
): {
  tonnageData: ReturnType<typeof tonnageByWeek>;
  prs: ReturnType<typeof personalRecords>;
} {
  const tonnageData = useMemo(() => tonnageByWeek(logs ?? []), [logs]);
  const prs = useMemo(() => personalRecords(logs ?? []), [logs]);
  return { tonnageData, prs };
}
