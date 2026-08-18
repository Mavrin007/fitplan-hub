/**
 * Карточка тренировки дня: арт фокуса, разминка, персональные заметки,
 * упражнения с подсказками по технике и кнопка «Начать тренировку».
 * Вынесена из Workouts.tsx.
 */

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  Clock,
  Dumbbell,
  Flame,
  Info,
  Play,
  Timer,
} from "lucide-react";
import { WEEKDAYS } from "@/lib/i18n";
import { EXERCISE_TIPS, estimateSessionMinutes, type WorkoutDay } from "@/lib/workoutLibrary";
import { cn } from "@/lib/utils";
import { workoutArt } from "../lib/workoutFormatting";

interface WorkoutDayCardProps {
  day: WorkoutDay;
  index: number;
  tipsOpen: Record<string, boolean>;
  onToggleTip: (key: string) => void;
  onStart: () => void;
}

export function WorkoutDayCard({ day, index, tipsOpen, onToggleTip, onStart }: WorkoutDayCardProps) {
  const art = workoutArt(day.focus);
  const ArtIcon = art.icon;
  // Длительность сессии считаем из подходов и отдыха (хранимые в БД планы
  // могут быть старой версии, без approxMinutes).
  const minutes = estimateSessionMinutes(day as WorkoutDay);

  return (
    <motion.div
      key={day.day}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut", delay: index * 0.06 }}
      className="card-lift overflow-hidden rounded-xl border bg-card shadow-elev-1"
    >
      {/* Placeholder-иллюстрация тренировки */}
      <div
        className={cn(
          "relative h-20 overflow-hidden bg-gradient-to-br from-secondary-container/80",
          art.gradient,
        )}
      >
        <ArtIcon className="absolute -right-2 -bottom-3 size-24 rotate-[-8deg] text-on-primary-container/25" />
        <div className="absolute inset-0 flex items-end justify-between p-3">
          <span className="label-overline text-on-secondary-container">
            {WEEKDAYS[day.day]} · {day.focus}
          </span>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="gap-1 bg-background/50">
              <Clock className="size-3" />
              ≈ {minutes} мин
            </Badge>
            <Badge className="gap-1">
              <Dumbbell className="size-3" />
              {day.exercises.length} упражнений
            </Badge>
          </div>
        </div>
      </div>

      {/* Разминка дня */}
      {day.warmup && day.warmup.length > 0 && (
        <div className="border-b bg-secondary/40 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Flame className="size-3 text-primary" />
            Разминка
          </p>
          <ul className="mt-1.5 space-y-1">
            {day.warmup.map((w, i) => (
              <li
                key={i}
                className="flex gap-2 text-xs leading-5 text-muted-foreground"
              >
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-secondary-foreground/30" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Персональные заметки (замены под профиль) */}
      {day.notes && day.notes.length > 0 && (
        <div className="space-y-1.5 border-b bg-secondary/40 px-4 py-3">
          {day.notes.map((n, i) => (
            <p
              key={i}
              className="flex gap-2 text-xs leading-5 text-muted-foreground"
            >
              <Info className="mt-0.5 size-3 shrink-0" />
              {n}
            </p>
          ))}
        </div>
      )}

      {/* Упражнения — чипы в стиле приёмов пищи */}
      <div className="p-4">
        <ul className="space-y-2">
          {day.exercises.map((ex) => {
            const tipKey = `${day.day}-${ex.name}`;
            const tip = EXERCISE_TIPS[ex.name];
            const tipOpen = !!tipsOpen[tipKey];
            return (
              <li key={tipKey}>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{ex.name}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5">
                      {ex.priority && (
                        <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                          приоритет
                        </span>
                      )}
                      {ex.tempo && (
                        <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                          темп {ex.tempo}
                        </span>
                      )}
                      {ex.weightNote && (
                        <span className="rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          {ex.weightNote}
                        </span>
                      )}
                      {tip && (
                        <button
                          type="button"
                          onClick={() => onToggleTip(tipKey)}
                          aria-expanded={tipOpen}
                          aria-label={
                            tipOpen
                              ? `Скрыть технику для ${ex.name}`
                              : `Показать технику для ${ex.name}`
                          }
                          className={cn(
                            "flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                            tipOpen
                              ? "bg-foreground/10 text-foreground"
                              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                          )}
                        >
                          <Info className="size-3" />
                          техника
                          <ChevronDown
                            className={cn(
                              "size-2.5 transition-transform",
                              tipOpen && "rotate-180",
                            )}
                          />
                        </button>
                      )}
                    </p>
                  </div>
                  {/* Подходы × повторы + отдых с иконкой — видно и на мобильных */}
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium num">
                      {ex.weightKg != null ? `${ex.weightKg} кг · ` : ""}
                      {ex.sets} × {ex.reps}
                    </p>
                    <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-muted-foreground">
                      <Timer className="size-3" />
                      {ex.restSeconds > 0 ? `${ex.restSeconds} с` : "—"}
                    </p>
                  </div>
                </div>
                {tip && tipOpen && (
                  <p className="mt-1.5 flex gap-2 rounded-md bg-secondary/40 px-2.5 py-2 text-xs leading-5 text-muted-foreground">
                    <Info className="mt-0.5 size-3 shrink-0" />
                    {tip}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {/* Главное действие — filled M3 кнопка */}
        <Button className="mt-3 w-full" onClick={onStart}>
          <Play className="size-4" />
          Начать тренировку
        </Button>
      </div>
    </motion.div>
  );
}
