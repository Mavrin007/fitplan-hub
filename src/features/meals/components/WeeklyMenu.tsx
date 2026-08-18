/**
 * Недельное меню под выбранную цель: переключатель целей, карточки дней
 * с блюдами, ценой и соответствием целям. Вынесено из Meals.tsx.
 */

import { motion } from "framer-motion";
import { Chip } from "@/components/ui/chip";
import { DishScene } from "@/components/illustrations";
import { GOAL_LABELS, MEAL_TYPE_LABELS, WEEKDAY_SHORT } from "@/lib/i18n";
import type { FitnessGoal, Targets } from "@/lib/nutrition";

import type { Doc } from "@/convex/_generated/dataModel";
import { MEAL_ART } from "../mealArt";
import { formatPrice } from "../lib/mealFormatting";
import { MacroMatchRow } from "./MacroProgress";

interface WeeklyMenuProps {
  weeklyPlan: ReturnType<typeof import("@/lib/mealLibrary").generateWeeklyMealPlan>;
  menuTargets: Targets;
  activeMenuGoal: FitnessGoal;
  profile: Doc<"profiles">;
  onSelectGoal: (goal: FitnessGoal | null) => void;
}

export function WeeklyMenu({
  weeklyPlan,
  menuTargets,
  activeMenuGoal,
  profile,
  onSelectGoal,
}: WeeklyMenuProps) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <DishScene className="hidden size-14 shrink-0 sm:block" />
          <div className="min-w-0">
            <p className="label-overline text-muted-foreground">План на неделю</p>
            <h2 className="m3-title-large mt-1">Недельное меню</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              7 разнообразных дней без повторов блюд. Порции и набор адаптированы
              под выбранную цель — например при похудении меньше круп и масла,
              при наборе массы больше углеводов и белка.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                "lose_weight",
                "gain_muscle",
                "maintain",
                "improve_endurance",
                "strength",
              ] as FitnessGoal[]
            ).map((g) => (
              <Chip key={g} selected={activeMenuGoal === g} onClick={() => onSelectGoal(g)}>
                {GOAL_LABELS[g]}
              </Chip>
            ))}
          </div>
          {profile && activeMenuGoal !== profile.fitnessGoal && (
            <p className="w-full text-right text-[11px] text-muted-foreground">
              Предпросмотр под «{GOAL_LABELS[activeMenuGoal].toLowerCase()}» —
              цели профиля не меняются.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {weeklyPlan.days.map((day, dIdx) => {
          const pct = Math.min(
            100,
            Math.round((day.calories / menuTargets.calories) * 100),
          );
          return (
            <div
              key={day.dateKey}
              className="bg-noise card-lift overflow-hidden rounded-xl border bg-card shadow-elev-1"
            >
              <div className="flex items-center justify-between gap-2 border-b bg-gradient-to-r from-secondary-container/70 to-secondary-container/20 px-4 py-2.5">
                <span className="label-overline">
                  {WEEKDAY_SHORT[day.weekday]}
                  {dIdx === 0 && <span className="text-brand"> · сегодня</span>}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {formatPrice(day.meals.reduce((s, m) => s + m.priceByn, 0))}
                  </span>
                  <span className="text-xs font-semibold num">
                    {day.calories.toLocaleString("ru-RU")} ккал
                  </span>
                </span>
              </div>

              <ul className="divide-y divide-border/60">
                {day.meals.map((m, mi) => {
                  const MealIcon = MEAL_ART[m.mealType].icon;
                  return (
                    // key должен быть уникальным: при «наборе массы» в дне два
                    // перекуса (mealType «snack»), одного типа недостаточно,
                    // а одинаковых названий в дне тоже не исключить — поэтому
                    // добавляем индекс приёма в ключ.
                    <li
                      key={`${day.dateKey}-${mi}-${m.mealType}-${m.name}`}
                      className="flex items-start gap-2.5 px-4 py-2.5"
                    >
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary-container/70 text-on-secondary-container">
                        <MealIcon className="size-3" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {MEAL_TYPE_LABELS[m.mealType]}
                          </span>
                          <span className="flex shrink-0 items-baseline gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {formatPrice(m.priceByn)}
                            </span>
                            <span className="text-xs font-medium num">
                              {m.calories} ккал
                            </span>
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-medium leading-snug">{m.name}</p>
                        <p className="mt-1 flex gap-2.5 text-[10px] text-muted-foreground num">
                          <span>Б {m.protein}</span>
                          <span>У {m.carbs}</span>
                          <span>Ж {m.fat}</span>
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="border-t px-4 py-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-brand to-brand-deep"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, ease: "easeOut", delay: 0.08 * dIdx }}
                  />
                </div>
                <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground num">
                  <span>Б {day.protein}/{menuTargets.protein} г</span>
                  <span>У {day.carbs}/{menuTargets.carbs} г</span>
                  <span>Ж {day.fat}/{menuTargets.fat} г</span>
                </div>
                <MacroMatchRow value={day} target={menuTargets} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

