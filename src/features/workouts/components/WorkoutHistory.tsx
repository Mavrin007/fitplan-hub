/**
 * История выполненных тренировок: клик по записи открывает детали, рядом —
 * удаление. Вынесена из Workouts.tsx.
 */

import { Dumbbell } from "lucide-react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EFFORT_LABELS } from "@/lib/effort";
import { shortDate } from "@/lib/dates";
import type { WorkoutLog } from "../lib/workoutStats";

interface WorkoutHistoryProps {
  logs: WorkoutLog[] | undefined;
  onView: (log: WorkoutLog) => void;
  onDelete: (id: WorkoutLog["_id"]) => void;
}

export function WorkoutHistory({ logs, onView, onDelete }: WorkoutHistoryProps) {
  return (
    <section className="space-y-4">
      <div>
        <p className="label-overline text-muted-foreground">История</p>
        <h2 className="m3-title-large mt-1">Выполненные тренировки</h2>
      </div>

      {(logs ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Пока нет записей — нажмите «Начать тренировку» у любой сессии выше.
        </p>
      ) : (
        <div className="card-lift overflow-hidden rounded-xl border bg-card shadow-elev-1">
          <div className="divide-y">
            {(logs ?? []).slice(0, 12).map((l) => (
              <div key={l._id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <button
                  type="button"
                  onClick={() => onView(l)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity hover:opacity-75"
                  aria-label={`Открыть детали тренировки от ${shortDate(l.date)}`}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Dumbbell className="size-4 text-muted-foreground" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{l.workoutName}</span>
                    <span className="block text-xs text-muted-foreground num">
                      {shortDate(l.date)} · {l.exercises.length} упражнений ·{" "}
                      {l.exercises.reduce((s, e) => s + e.sets, 0)} подходов
                      {l.effort ? ` · ${EFFORT_LABELS[l.effort].toLowerCase()}` : ""}
                    </span>
                  </span>
                </button>
                <ConfirmDelete
                  iconOnly
                  busy={false}
                  onConfirm={() => void onDelete(l._id)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
