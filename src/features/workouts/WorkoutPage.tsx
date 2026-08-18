/**
 * Страница «Тренировки» (/dashboard/workouts) — тонкая композиция фичи
 * src/features/workouts: логика в useWorkoutPlan/useWorkoutStats, JSX — в
 * компонентах, чистая математика — в lib/. Вынесена из src/pages/Workouts.tsx.
 */

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Separator } from "@/components/ui/separator";
import { PageAurora } from "@/components/page-aurora";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { FitnessHero } from "@/components/illustrations";
import { Dumbbell } from "lucide-react";
import { normalizeEquipment } from "@/lib/workoutLibrary";
import { useTrack } from "@/hooks/use-track";
import { WorkoutMode } from "./WorkoutMode";
import { useWorkoutPlan } from "./hooks/useWorkoutPlan";
import { WorkoutPlanCard } from "./components/WorkoutPlanCard";
import { WorkoutDayCard } from "./components/WorkoutDayCard";
import { WorkoutStats } from "./components/WorkoutStats";
import { WorkoutHistory } from "./components/WorkoutHistory";
import { LogDetailsDialog } from "./components/LogDetailsDialog";

export default function WorkoutPage() {
  const w = useWorkoutPlan();
  const track = useTrack();
  const { profile, plan, logs } = w;

  if (w.loading) {
    return <PageLoading />;
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="label-overline text-muted-foreground">Тренировки</p>
          <h1 className="m3-headline-large mt-2">Тренировки</h1>
        </header>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Настройте профиль, чтобы получить план тренировок под вашу цель.
          </p>
          <Button asChild className="mt-4">
            <a href="/dashboard/profile">Перейти в профиль</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate mx-auto max-w-4xl space-y-10">
      <PageAurora />
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="label-overline text-muted-foreground">Тренировки</p>
          <h1 className="m3-headline-large mt-2">План тренировок</h1>
          <div
            aria-hidden
            className="mt-3 h-1 w-14 rounded-full bg-gradient-to-r from-brand to-brand-deep dark:from-brand-soft dark:to-brand"
          />
        </div>
        <FitnessHero className="hidden h-24 w-32 shrink-0 sm:block" />
      </header>

      {/* Сводная карточка плана */}
      <WorkoutPlanCard
        profile={profile}
        plan={plan ?? null}
        equipmentText={w.equipmentText}
        sessionsText={w.sessionsText}
        cycleWeeks={w.cycleWeeks}
        generating={w.generating}
        onGenerate={() => void w.handleGenerate(false)}
      />

      {/* План по неделям */}
      {plan ? (
        <section className="space-y-5">
          {/* Переключатель недель цикла — M3 чипы */}
          {w.weeks && w.currentWeek && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-1 text-xs font-medium text-muted-foreground">
                  Неделя цикла
                </p>
                {w.weeks.map((week, i) => (
                  <Chip
                    key={week.week}
                    selected={i === w.safeWeekIdx}
                    onClick={() => w.setWeekIdx(i)}
                    ariaLabel={`Неделя ${week.week} цикла`}
                  >
                    Неделя {week.week}
                  </Chip>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {w.currentWeek.label}
                </span>
                {w.currentWeek.weightNote && (
                  <span className="ml-1.5">· {w.currentWeek.weightNote}</span>
                )}
              </p>
            </div>
          )}

          {w.visibleDays
            .slice()
            .sort((a, b) => a.day - b.day)
            .map((day, idx) => (
              <WorkoutDayCard
                key={day.day}
                day={day}
                index={idx}
                tipsOpen={w.tipsOpen}
                onToggleTip={(key) =>
                  w.setTipsOpen((t) => ({ ...t, [key]: !t[key] }))
                }
                onStart={() => {
                  track("workout_started", { focus: day.focus });
                  w.setTrainingDay(day);
                }}
              />
            ))}
        </section>
      ) : (
        <EmptyState
          icon={Dumbbell}
          illustration={<FitnessHero className="h-24 w-32" />}
          title="Плана тренировок пока нет"
          description={
            <>
              Сгенерируйте 4-недельный цикл с прогрессией нагрузки: база → те же
              веса +1 повтор → +2.5 кг → разгрузка. Упражнения подбираются под
              весь профиль — рост, вес, пол, возраст, цель, опыт, инвентарь и
              ограничения — а стартовые веса следующего цикла автоматически
              подстраиваются под ваши прошлые тренировки и оценку усилия
              («легко / норм / тяжело»).
            </>
          }
          action={
            <Button onClick={() => void w.handleGenerate(false)} disabled={w.generating}>
              <Dumbbell className="size-4" />
              {w.generating ? "Генерация…" : "Сгенерировать план"}
            </Button>
          }
        />
      )}

      <Separator />

      {/* Статистика: тоннаж и рекорды */}
      <WorkoutStats tonnageData={w.tonnageData} prs={w.prs} />

      <Separator />

      {/* Recent logs — клик по записи открывает детали */}
      <WorkoutHistory
        logs={logs}
        onView={(l) => w.setViewingLog(l)}
        onDelete={(id) => void w.handleDeleteLog(id)}
      />

      {/* Режим тренировки — полноэкранный оверлей */}
      {w.trainingDay && (
        <WorkoutMode
          day={w.trainingDay}
          planName={plan?.name ?? ""}
          weekLabel={w.currentWeek?.label}
          logs={(logs ?? []).map((l) => ({
            date: l.date,
            effort: l.effort ?? undefined,
            exercises: l.exercises.map((e) => ({
              name: e.name,
              weightKg: e.weightKg,
              reps: e.reps,
              rpe: e.rpe,
              ...(e.setDetails ? { setDetails: e.setDetails } : {}),
            })),
          }))}
          // Инвентарь — для фильтра замен упражнения («Заменить на: …»).
          equipment={profile ? normalizeEquipment(profile.equipment) : undefined}
          saving={w.savingLog}
          onClose={() => w.setTrainingDay(null)}
          onSave={w.handleSaveTraining}
        />
      )}

      {/* Детали выполненной тренировки */}
      <LogDetailsDialog
        log={w.viewingLog}
        onClose={() => w.setViewingLog(null)}
        onDelete={(id) => void w.handleDeleteLog(id)}
      />
    </div>
  );
}
