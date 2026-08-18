/**
 * Сводная карточка плана: сплит, частота, цикл, профиль, под который собран
 * план, и блок «как этот план рассчитан». Вынесена из Workouts.tsx.
 */

import { Button } from "@/components/ui/button";
import { Dumbbell, Info, RefreshCw } from "lucide-react";
import {
  ACTIVITY_LABELS,
  EXPERIENCE_LABELS,
  GENDER_LABELS,
  GOAL_LABELS,
  LIMITATION_LABELS,
  TRAINING_STYLE_LABELS,
} from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Doc } from "@/convex/_generated/dataModel";

type PlanDoc = Doc<"workoutPlans">;

interface WorkoutPlanCardProps {
  profile: Doc<"profiles">;
  plan: PlanDoc | null;
  equipmentText: string;
  sessionsText: string | number;
  cycleWeeks: number | undefined;
  generating: boolean;
  onGenerate: () => void;
}

export function WorkoutPlanCard({
  profile,
  plan,
  equipmentText,
  sessionsText,
  cycleWeeks,
  generating,
  onGenerate,
}: WorkoutPlanCardProps) {
  return (
    <section className="card-lift rounded-xl border bg-card p-6 shadow-elev-1 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="label-overline text-muted-foreground">Текущий план</p>
          <h2 className="m3-title-large mt-1">{plan?.name ?? "Плана пока нет"}</h2>
          {plan ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {plan.splitType ? `${plan.splitType} · ` : ""}
              {sessionsText} тренировок в неделю
              {cycleWeeks ? ` · цикл ${cycleWeeks} недели` : ""} ·{" "}
              {GOAL_LABELS[plan.goal ?? profile.fitnessGoal].toLowerCase()}
              {profile.trainingStyle && profile.trainingStyle !== "balanced"
                ? ` · стиль: ${TRAINING_STYLE_LABELS[profile.trainingStyle].toLowerCase()}`
                : ""}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Для {EXPERIENCE_LABELS[profile.experienceLevel].toLowerCase()} ·{" "}
              {GOAL_LABELS[profile.fitnessGoal].toLowerCase()}
              {profile.trainingStyle && profile.trainingStyle !== "balanced"
                ? ` · стиль: ${TRAINING_STYLE_LABELS[profile.trainingStyle].toLowerCase()}`
                : ""}
            </p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            {GENDER_LABELS[profile.gender].toLowerCase()}, {profile.age} лет ·{" "}
            {profile.heightCm} см / {profile.weightKg} кг ·{" "}
            {ACTIVITY_LABELS[profile.activityLevel].toLowerCase()} · инвентарь:{" "}
            {equipmentText}
            {profile.limitations && profile.limitations.length > 0 ? (
              <> · ограничения:{" "}
                {profile.limitations.map((l) => LIMITATION_LABELS[l]).join(", ")}
              </>
            ) : null}
          </p>
          {plan?.adaptedFor && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <Info className="size-3.5 shrink-0" />
              {plan.adaptedFor}
            </p>
          )}
          {generating && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="size-3.5 animate-spin" />
              Пересобираем план под обновлённые данные профиля…
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {plan && (
            <Button variant="outline" onClick={onGenerate} disabled={generating}>
              <RefreshCw className={cn("size-4", generating && "animate-spin")} />
              {generating ? "Пересборка…" : "Сгенерировать заново"}
            </Button>
          )}
          {!plan && (
            <Button onClick={onGenerate} disabled={generating}>
              <Dumbbell className="size-4" />
              {generating ? "Генерация…" : "Сгенерировать план"}
            </Button>
          )}
        </div>
      </div>

      {/* Как считается этот план */}
      {plan?.howCalculated && plan.howCalculated.length > 0 && (
        <div className="mt-5 rounded-md bg-secondary/40 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Info className="size-3.5 text-primary" />
            Как этот план рассчитан
          </p>
          <ul className="mt-2 space-y-1.5">
            {plan.howCalculated.map((bullet, i) => (
              <li
                key={i}
                className="flex gap-2 text-xs leading-5 text-muted-foreground"
              >
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/60" />
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
