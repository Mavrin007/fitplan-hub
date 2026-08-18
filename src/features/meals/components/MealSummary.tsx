/**
 * Сводка дня: легенда, калории с прогресс-баром, кольца макросов, вода
 * + добор белка и кнопка плана на день. Вынесена из Meals.tsx.
 */

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChartCard, LegendChip } from "@/components/chart-card";
import { Sparkles } from "lucide-react";
import type { Targets } from "@/lib/nutrition";
import type { MealType } from "@/lib/mealLibrary";
import { MacroProgress } from "./MacroProgress";
import { WaterCard } from "./WaterCard";

interface MealSummaryProps {
  totals: { calories: number; protein: number; carbs: number; fat: number };
  targets: Targets;
  calPct: number;
  waterMl: number;
  waterTarget: number;
  waterPct: number;
  proteinLeft: number;
  planSummary: string;
  onWater: (delta: number) => void;
  onOpenQuickAdd: (name: string, qty: number, mealType?: MealType) => void;
  onShowPlan: () => void;
}

export function MealSummary({
  totals,
  targets,
  calPct,
  waterMl,
  waterTarget,
  waterPct,
  proteinLeft,
  planSummary,
  onWater,
  onOpenQuickAdd,
  onShowPlan,
}: MealSummaryProps) {
  const calLeft = targets.calories - totals.calories;
  return (
    <ChartCard
      title="Итоги дня"
      subtitle="Потреблено против целей из профиля"
      legend={
        <>
          <LegendChip color="var(--brand)" label="Калории" />
          <LegendChip
            color="var(--muted-foreground)"
            dashed
            label={`Цель ${targets.calories.toLocaleString("ru-RU")} ккал`}
          />
          <span className="hidden h-3 w-px bg-border sm:block" />
          <LegendChip color="var(--foreground)" label="Белки" />
          <LegendChip color="var(--muted-foreground)" label="Углеводы" />
          <LegendChip color="var(--border)" label="Жиры" />
        </>
      }
    >
      <div className="grid gap-8 sm:grid-cols-2">
        <div>
          <p className="label-overline text-muted-foreground">Калории</p>
          <p className="mt-2 text-3xl font-semibold num">
            {totals.calories.toLocaleString("ru-RU")}
            <span className="text-base text-muted-foreground">
              {" "}
              / {targets.calories.toLocaleString("ru-RU")}
            </span>
          </p>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-brand"
              initial={{ width: 0 }}
              animate={{ width: `${calPct}%` }}
              transition={{ duration: 0.9, ease: "easeOut", delay: 0.05 }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground num">
            {calLeft > 0
              ? `Осталось ${calLeft.toLocaleString("ru-RU")} ккал до цели`
              : calLeft === 0
                ? "Цель достигнута — ровно в ноль"
                : `Превышено на ${Math.abs(calLeft).toLocaleString("ru-RU")} ккал`}
          </p>
        </div>
        <MacroProgress totals={totals} targets={targets} />
      </div>

      {/* Вода + «что съесть, чтобы добрать белок» — действие без ухода
          со страницы: ответ на «сколько осталось» тут же, рядом кнопки. */}
      <WaterCard
        waterMl={waterMl}
        waterTarget={waterTarget}
        waterPct={waterPct}
        proteinLeft={proteinLeft}
        onWater={onWater}
        onOpenQuickAdd={onOpenQuickAdd}
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <p className="text-xs text-muted-foreground">{planSummary}</p>
        <Button variant="outline" onClick={onShowPlan}>
          <Sparkles className="size-4" />
          Сгенерировать план на день
        </Button>
      </div>
    </ChartCard>
  );
}
