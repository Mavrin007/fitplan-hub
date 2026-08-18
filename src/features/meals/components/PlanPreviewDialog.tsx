/**
 * Диалог предпросмотра плана на день.
 */
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DishScene } from "@/components/illustrations";
import { GOAL_LABELS, MEAL_TYPE_LABELS } from "@/lib/i18n";
import { formatAmount, type PlannedMeal } from "@/lib/mealLibrary";
import type { FitnessGoal, Targets } from "@/lib/nutrition";
import { MacroMatchRow } from "./MacroMatchRow";
import { Sparkles } from "lucide-react";

interface Props {
  showPlan: boolean;
  setShowPlan: (v: boolean) => void;
  plan: { meals: PlannedMeal[]; calories: number; protein: number; carbs: number; fat: number } | null;
  menuTargets: Targets | null;
  activeMenuGoal: FitnessGoal;
  handleAddAllPlan: () => Promise<void>;
  adding: boolean;
}

export function PlanPreviewDialog({ showPlan, setShowPlan, plan, menuTargets, activeMenuGoal, handleAddAllPlan, adding }: Props) {
  return (
    <Dialog open={showPlan} onOpenChange={setShowPlan}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <DishScene className="hidden size-12 shrink-0 sm:block" />
            <div className="min-w-0">
              <DialogTitle>Предложенный план на сегодня</DialogTitle>
              <DialogDescription>
                Меню под цель «{GOAL_LABELS[activeMenuGoal].toLowerCase()}» —
                {menuTargets ? menuTargets.calories.toLocaleString("ru-RU") : ""} ккал.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {plan && menuTargets && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {plan.meals.map((m: PlannedMeal, mi) => (
                <div key={`${mi}-${m.mealType}-${m.name}`} className="rounded-xl border bg-card p-4 shadow-elev-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide">{MEAL_TYPE_LABELS[m.mealType]}</p>
                    <p className="text-xs font-medium num">{m.calories} ккал</p>
                  </div>
                  <p className="mt-1 text-sm font-medium leading-snug">{m.name}</p>
                  <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground num">
                    <span>Б {m.protein}</span><span>У {m.carbs}</span><span>Ж {m.fat}</span>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {m.foods.map((f) => (
                      <li key={f.food.name} className="flex justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">{f.food.name}</span>
                        <span className="text-right num">{formatAmount(f.food, f.amountGrams)}<span className="ml-1.5 text-muted-foreground">{f.calories} ккал</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-elev-1">
              <div className="flex items-baseline justify-between">
                <span className="label-overline text-muted-foreground">Итого</span>
                <span className="text-lg font-semibold num">
                  {plan.calories.toLocaleString("ru-RU")}
                  <span className="text-sm text-muted-foreground"> / {menuTargets.calories.toLocaleString("ru-RU")} ккал</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <motion.div className="h-full rounded-full bg-brand" initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.round((plan.calories / menuTargets.calories) * 100))}%` }}
                  transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }} />
              </div>
              <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground num">
                <span>Б {plan.protein}/{menuTargets.protein} г</span>
                <span>У {plan.carbs}/{menuTargets.carbs} г</span>
                <span>Ж {plan.fat}/{menuTargets.fat} г</span>
              </div>
              <MacroMatchRow value={plan} target={menuTargets} />
            </div>
            <Button className="w-full" onClick={handleAddAllPlan} disabled={adding}>
              <Sparkles className="size-4" /> Добавить всё в дневник
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
