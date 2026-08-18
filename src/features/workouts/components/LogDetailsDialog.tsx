/**
 * Детали выполненной тренировки из истории: упражнения, тоннаж, удаление.
 * Вынесен из Workouts.tsx.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EFFORT_LABELS } from "@/lib/effort";
import { prettyDate } from "@/lib/dates";
import type { WorkoutLog } from "../lib/workoutStats";

interface LogDetailsDialogProps {
  log: WorkoutLog | null;
  onClose: () => void;
  onDelete: (id: WorkoutLog["_id"]) => void;
}

export function LogDetailsDialog({ log, onClose, onDelete }: LogDetailsDialogProps) {
  return (
    <Dialog open={log !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {log && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8">{log.workoutName}</DialogTitle>
              <DialogDescription>
                {prettyDate(log.date)}
                {log.effort
                  ? ` · усилие: ${EFFORT_LABELS[log.effort].toLowerCase()}`
                  : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {log.exercises.map((ex) => (
                <div
                  key={`${ex.name}-${ex.sets}-${ex.reps}-${ex.weightKg}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low px-3 py-2.5"
                >
                  <p className="min-w-0 truncate text-sm font-medium">{ex.name}</p>
                  <p className="shrink-0 text-sm text-muted-foreground num">
                    {ex.sets} × {ex.reps}
                    {ex.weightKg > 0 ? ` · ${ex.weightKg} кг` : ""}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Тоннаж:{" "}
                <span className="num font-medium text-foreground">
                  {log.exercises
                    .reduce((s, e) => s + e.weightKg * e.reps * e.sets, 0)
                    .toLocaleString("ru-RU")}{" "}
                  кг
                </span>
              </p>
              <ConfirmDelete
                onConfirm={() => void onDelete(log._id)}
                label="Удалить запись"
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
