/**
 * Статистика «Тренировок»: недельный тоннаж (график) и личные рекорды.
 * Вынесена из Workouts.tsx.
 */

import { Dumbbell, Trophy } from "lucide-react";
import { ChartCard, LegendChip } from "@/components/chart-card";
import { EmptyState } from "@/components/empty-state";
import { FitnessHero } from "@/components/illustrations";
import { SVGBarChart } from "@/lib/charts";
import { shortDate } from "@/lib/dates";
import type { PersonalRecord } from "../lib/workoutStats";

interface WorkoutStatsProps {
  /** Формат данных SVGBarChart: Record<string, string | number>[] */
  tonnageData: Record<string, string | number>[];
  prs: PersonalRecord[];
}

export function WorkoutStats({ tonnageData, prs }: WorkoutStatsProps) {
  return (
    <section className="space-y-4">
      <div>
        <p className="label-overline text-muted-foreground">Статистика</p>
        <h2 className="m3-title-large mt-1">Объём и рекорды</h2>
      </div>

      <ChartCard
        title="Недельный тоннаж"
        subtitle="Тоннаж = вес × повторы × подходы. Рост тоннажа по неделям — признак прогресса в силе и массе."
        legend={<LegendChip color="var(--accent-activity)" label="Тоннаж (кг)" />}
      >
        {tonnageData.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center">
            <EmptyState
              compact
              icon={Dumbbell}
              illustration={<FitnessHero className="h-20 w-24" />}
              title="Пока нет графика объёма"
              description="Запишите пару тренировок в режиме «Начать тренировку» — недельный тоннаж появится здесь."
            />
          </div>
        ) : (
          <SVGBarChart
            key={`tonnage-${tonnageData.length}`}
            data={tonnageData}
            xKey="label"
            series={[
              { key: "tonnage", name: "Тоннаж", fill: "var(--accent-activity)" },
            ]}
            height={200}
            labelInterval={Math.max(0, Math.floor(tonnageData.length / 6) - 1)}
            maxBarSize={36}
            yTickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(1)}т` : `${v}`
            }
            tooltipFormatter={(value: number) =>
              `${Number(value).toLocaleString("ru-RU")} кг`
            }
          />
        )}
      </ChartCard>

      {/* Личные рекорды */}
      <div className="card-lift rounded-xl border bg-card p-6 shadow-elev-1">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-amber-500" />
          <h2 className="m3-title-small">Личные рекорды</h2>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Максимальный рабочий вес по каждому упражнению. Например: жим лёжа —
          40 кг × 10, приседания — 60 кг × 8.
        </p>
        {prs.length === 0 ? (
          <EmptyState
            compact
            icon={Trophy}
            title="Рекордов пока нет"
            description="Они появятся после первых записанных тренировок — максимальный рабочий вес по каждому упражнению."
            className="mt-4"
          />
        ) : (
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {prs.map((pr) => (
              <div
                key={pr.name}
                className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{pr.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground num">
                    {shortDate(pr.date)} · {pr.sets} × {pr.reps}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-semibold num text-amber-700 dark:text-amber-400">
                    {pr.weightKg}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    кг
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
