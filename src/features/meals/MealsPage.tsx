/**
 * Страница «Питание» — тонкая обёртка-оркестратор.
 * Вся бизнес-логика, состояние и обработчики — в hooks/useMealPage.
 * Диалоги и секции — в отдельных компонентах.
 */
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ChartCard, LegendChip } from "@/components/chart-card";
import { Chip } from "@/components/ui/chip";
import { MacroRing } from "@/components/macro-ring";
import { PageAurora } from "@/components/page-aurora";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { DishScene } from "@/components/illustrations";
import { Badge } from "@/components/ui/badge";
import { PremiumDialog } from "@/components/premium-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MEAL_TYPE_LABELS, UNITS, WEEKDAY_SHORT, GOAL_LABELS } from "@/lib/i18n";
import { FOOD_LIBRARY } from "@/lib/mealLibrary";
import { type FitnessGoal } from "@/lib/nutrition";
import { pluralRecords, shortDate, todayKey } from "@/lib/dates";
import { liters } from "@/features/dashboard/today";
import {
  MEAL_ART, MEAL_TYPES, PROTEIN_BOOSTS, DECIMAL_INPUT, formatPrice,
} from "./lib/mealUtils";
import {
  Copy, Droplets, History, Loader2, Minus, Pencil, Plus,
  Sparkles, Trash2, UtensilsCrossed,
} from "lucide-react";

import { useMealPage } from "./hooks/useMealPage";
import { MacroMatchRow } from "./components/MacroMatchRow";
import { AddEditMealDialog } from "./components/AddEditMealDialog";
import { PlanPreviewDialog } from "./components/PlanPreviewDialog";

export default function MealsPage() {
  const s = useMealPage();
  const { targets, totals, waterTarget, waterMl, byMeal, recentQuick } = s;

  if (s.loading) return <PageLoading />;

  if (!targets) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="label-overline text-muted-foreground">Питание</p>
          <h1 className="m3-headline-large mt-2">Питание</h1>
        </header>
        <EmptyState
          icon={UtensilsCrossed} title="Цели ещё не рассчитаны"
          description="Настройте профиль — возраст, рост, вес, активность и цель — и получите дневные нормы по калориям и макросам."
          action={<Button asChild><a href="/dashboard/profile">Перейти в профиль</a></Button>}
        />
      </div>
    );
  }

  const calPct = Math.min(100, Math.round((totals.calories / targets.calories) * 100));
  const calLeft = targets.calories - totals.calories;
  const proteinLeft = Math.max(0, Math.round(targets.protein - totals.protein));
  const waterPct = Math.min(100, Math.round((waterMl / waterTarget) * 100));

  return (
    <div className="relative isolate mx-auto max-w-4xl space-y-10">
      <PageAurora />
      {/* Header */}
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="label-overline text-muted-foreground">Питание</p>
          <h1 className="m3-headline-large mt-2">Рацион за сегодня</h1>
          <div aria-hidden className="mt-3 h-1 w-14 rounded-full bg-gradient-to-r from-brand to-brand-deep dark:from-brand-soft dark:to-brand" />
        </div>
        <DishScene className="hidden h-24 w-32 shrink-0 sm:block" />
      </header>

      {/* Totals chart */}
      <ChartCard title="Итоги дня" subtitle="Потреблено против целей из профиля"
        legend={<>
          <LegendChip color="var(--brand)" label="Калории" />
          <LegendChip color="var(--muted-foreground)" dashed label={`Цель ${targets.calories.toLocaleString("ru-RU")} ккал`} />
          <span className="hidden h-3 w-px bg-border sm:block" />
          <LegendChip color="var(--foreground)" label="Белки" />
          <LegendChip color="var(--muted-foreground)" label="Углеводы" />
          <LegendChip color="var(--border)" label="Жиры" />
        </>}>
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <p className="label-overline text-muted-foreground">Калории</p>
            <p className="mt-2 text-3xl font-semibold num">
              {totals.calories.toLocaleString("ru-RU")}
              <span className="text-base text-muted-foreground"> / {targets.calories.toLocaleString("ru-RU")}</span>
            </p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full bg-brand" initial={{ width: 0 }} animate={{ width: `${calPct}%` }} transition={{ duration: 0.9, ease: "easeOut", delay: 0.05 }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground num">
              {calLeft > 0 ? `Осталось ${calLeft.toLocaleString("ru-RU")} ккал до цели` : calLeft === 0 ? "Цель достигнута — ровно в ноль" : `Превышено на ${Math.abs(calLeft).toLocaleString("ru-RU")} ккал`}
            </p>
          </div>
          <div className="grid grid-cols-3 items-center gap-2">
            <MacroRing label="Белки" value={totals.protein} target={targets.protein} color="var(--macro-protein)" delay={0.15} center="percent" />
            <MacroRing label="Углеводы" value={totals.carbs} target={targets.carbs} color="var(--macro-carbs)" delay={0.25} center="percent" />
            <MacroRing label="Жиры" value={totals.fat} target={targets.fat} color="var(--macro-fat)" delay={0.35} center="percent" />
          </div>
        </div>

        {/* Water + protein boost */}
        <div className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-2">
          <div className="rounded-lg bg-surface-container-low p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="label-overline text-muted-foreground">Вода</p>
              <p className="num text-sm font-medium">{liters(waterMl)} / {liters(waterTarget)} л</p>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full bg-sky-500" initial={{ width: 0 }} animate={{ width: `${waterPct}%` }} transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }} />
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={() => void s.handleWater(250)}><Droplets className="size-3.5" /> +250 мл</Button>
              <Button size="sm" variant="outline" onClick={() => void s.handleWater(500)}>+500 мл</Button>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => void s.handleWater(-250)} disabled={waterMl === 0} aria-label="Убрать 250 мл воды"><Minus className="size-3.5" /></Button>
            </div>
          </div>
          {proteinLeft > 0 && (
            <div className="rounded-lg bg-surface-container-low p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="label-overline text-muted-foreground">Белок</p>
                <p className="num text-sm font-medium">осталось {proteinLeft} г</p>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {PROTEIN_BOOSTS.map((b) => {
                  const food = FOOD_LIBRARY.find((f) => f.name === b.name);
                  if (!food) return null;
                  const boostProtein = Math.round(food.protein * b.qty * (food.servingGrams / 100));
                  return (
                    <button key={b.name} type="button" onClick={() => s.openQuickAdd(b.name, b.qty, "snack")}
                      className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-brand hover:text-brand">
                      <span className="max-w-32 truncate">{b.name}</span>
                      <span className="shrink-0 text-muted-foreground num">+{boostProtein} г белка</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Plan button */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <p className="text-xs text-muted-foreground">
            {s.plan ? `${s.plan.meals.length} приёмов · ${s.plan.calories.toLocaleString("ru-RU")} ккал предложено` : ""}
          </p>
          <Button variant="outline" onClick={() => s.setShowPlan(true)}>
            <Sparkles className="size-4" /> Сгенерировать план на день
          </Button>
        </div>
      </ChartCard>

      {/* Recent foods */}
      {recentQuick.length > 0 && (
        <section className="card-lift rounded-xl border bg-card p-4 shadow-elev-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="label-overline flex items-center gap-1.5 text-muted-foreground"><History className="size-3.5" /> Недавнее</p>
            <span className="text-[11px] text-muted-foreground">тап — откроет порцию</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {recentQuick.map((r) => (
              <button key={r.name} type="button" onClick={() => s.openQuickAdd(r.name, r.quantity, r.mealType)}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-brand hover:text-brand">
                <span className="max-w-36 truncate">{`${r.name} ×${r.quantity}`}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Copy day section */}
      <section className="card-lift rounded-xl border bg-card p-5 shadow-elev-1">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="label-overline flex items-center gap-1.5 text-muted-foreground"><Copy className="size-3.5" /> Перенос из прошлого дня</p>
            <p className="mt-1 text-xs text-muted-foreground">Выберите день и скопируйте его записи в сегодняшний дневник.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="copy-date">День</Label>
              <Input id="copy-date" type="date" max={s.yesterdayKey} value={s.copyFromDate}
                onChange={(e) => s.setCopyFromDate(e.target.value)} className="h-10 w-44" />
            </div>
            <Button variant="secondary" className="h-10" onClick={() => void s.handleCopyDay()}
              disabled={s.copying || s.copySelected.size === 0}>
              {s.copying ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
              Скопировать выбранные ({s.copySelected.size})
            </Button>
          </div>
        </div>
        {(s.copyLog ?? []).length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-medium text-muted-foreground">Повторить приём:</span>
            {MEAL_TYPES.filter((mt) => s.copyByMeal[mt].length > 0).map((mt) => (
              <button key={mt} type="button" onClick={() => s.openRepeatMeal(mt)}
                aria-label={`Повторить приём «${MEAL_TYPE_LABELS[mt]}» (${s.copyByMeal[mt].length} записей)`}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-brand hover:text-brand">
                <span className="max-w-32 truncate">{MEAL_TYPE_LABELS[mt]}</span>
                <span className="shrink-0 rounded-full bg-secondary px-1.5 text-[10px] font-medium text-secondary-foreground num">{s.copyByMeal[mt].length}</span>
              </button>
            ))}
          </div>
        )}
        {(s.copyLog ?? []).length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {(s.copyLog ?? []).map((e) => (
              <li key={e._id} className="flex items-center gap-2.5 rounded-md border bg-surface-container-low px-3 py-2">
                <input type="checkbox" id={`copy-${e._id}`} checked={s.copySelected.has(e._id)} onChange={() => s.toggleCopyEntry(e._id)} className="size-4 shrink-0" />
                <label htmlFor={`copy-${e._id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                  <span className="block truncate font-medium">{e.name}</span>
                  <span className="block text-[10px] text-muted-foreground num">{MEAL_TYPE_LABELS[e.mealType]} · {e.calories} ккал</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          {s.copyFromDate === todayKey() || !s.copyFromDate ? "Выберите прошедший день."
            : (s.copyLog ?? []).length === 0 ? `Записей за ${shortDate(s.copyFromDate)} нет — выберите другой день.`
            : `Готово к копированию: ${s.copyLog!.length} ${pluralRecords(s.copyLog!.length)} за ${shortDate(s.copyFromDate)}.`}
        </p>
      </section>

      {/* Repeat meal dialog */}
      <Dialog open={s.repeatMeal !== null} onOpenChange={(o) => !o && s.setRepeatMeal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Повторить {s.repeatMeal ? MEAL_TYPE_LABELS[s.repeatMeal].toLowerCase() : ""} из {shortDate(s.copyFromDate)}</DialogTitle>
            <DialogDescription>Снимите лишнее — добавится только отмеченное.</DialogDescription>
          </DialogHeader>
          {(s.repeatMeal ? s.copyByMeal[s.repeatMeal] : []).length > 0 && (
            <ul className="space-y-1.5">
              {(s.repeatMeal ? s.copyByMeal[s.repeatMeal] : []).map((e) => (
                <li key={e._id} className="flex items-center gap-2.5 rounded-md border bg-surface-container-low px-3 py-2">
                  <input type="checkbox" id={`repeat-${e._id}`} checked={s.repeatSelected.has(e._id)} onChange={() => s.toggleRepeatEntry(e._id)} className="size-4 shrink-0" />
                  <label htmlFor={`repeat-${e._id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="block text-[10px] text-muted-foreground num">{e.calories} ккал · Б {e.protein}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <Button className="w-full" onClick={() => void s.handleRepeatMeal()} disabled={s.adding || s.repeatSelected.size === 0}>
            {s.adding ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
            Добавить в сегодня ({s.repeatSelected.size})
          </Button>
        </DialogContent>
      </Dialog>

      {/* Weekly menu */}
      {s.weeklyPlan && targets && s.menuTargets && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <DishScene className="hidden size-14 shrink-0 sm:block" />
              <div className="min-w-0">
                <p className="label-overline text-muted-foreground">План на неделю</p>
                <h2 className="m3-title-large mt-1">Недельное меню</h2>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">7 разнообразных дней без повторов блюд.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-wrap gap-1.5">
                {(["lose_weight", "gain_muscle", "maintain", "improve_endurance", "strength"] as FitnessGoal[]).map((g) => (
                  <Chip key={g} selected={s.activeMenuGoal === g} onClick={() => s.setMenuGoal(g)}>{GOAL_LABELS[g]}</Chip>
                ))}
              </div>
              {s.profile && s.activeMenuGoal !== s.profile.fitnessGoal && (
                <p className="w-full text-right text-[11px] text-muted-foreground">
                  Предпросмотр под «{GOAL_LABELS[s.activeMenuGoal].toLowerCase()}» — цели профиля не меняются.
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {s.weeklyPlan.days.map((day, dIdx) => {
              const pct = Math.min(100, Math.round((day.calories / s.menuTargets!.calories) * 100));
              return (
                <div key={day.dateKey} className="bg-noise card-lift overflow-hidden rounded-xl border bg-card shadow-elev-1">
                  <div className="flex items-center justify-between gap-2 border-b bg-gradient-to-r from-secondary-container/70 to-secondary-container/20 px-4 py-2.5">
                    <span className="label-overline">{WEEKDAY_SHORT[day.weekday]}{dIdx === 0 && <span className="text-brand"> · сегодня</span>}</span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-[10px] font-medium text-muted-foreground">{formatPrice(day.meals.reduce((s, m) => s + m.priceByn, 0))}</span>
                      <span className="text-xs font-semibold num">{day.calories.toLocaleString("ru-RU")} ккал</span>
                    </span>
                  </div>
                  <ul className="divide-y divide-border/60">
                    {day.meals.map((m, mi) => {
                      const MealIcon = MEAL_ART[m.mealType].icon;
                      return (
                        <li key={`${day.dateKey}-${mi}-${m.mealType}-${m.name}`} className="flex items-start gap-2.5 px-4 py-2.5">
                          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary-container/70 text-on-secondary-container"><MealIcon className="size-3" /></span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{MEAL_TYPE_LABELS[m.mealType]}</span>
                              <span className="flex shrink-0 items-baseline gap-2">
                                <span className="text-[10px] text-muted-foreground">{formatPrice(m.priceByn)}</span>
                                <span className="text-xs font-medium num">{m.calories} ккал</span>
                              </span>
                            </div>
                            <p className="mt-1 text-sm font-medium leading-snug">{m.name}</p>
                            <p className="mt-1 flex gap-2.5 text-[10px] text-muted-foreground num"><span>Б {m.protein}</span><span>У {m.carbs}</span><span>Ж {m.fat}</span></p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="border-t px-4 py-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <motion.div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-deep" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: "easeOut", delay: 0.08 * dIdx }} />
                    </div>
                    <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground num">
                      <span>Б {day.protein}/{s.menuTargets!.protein} г</span>
                      <span>У {day.carbs}/{s.menuTargets!.carbs} г</span>
                      <span>Ж {day.fat}/{s.menuTargets!.fat} г</span>
                    </div>
                    <MacroMatchRow value={day} target={s.menuTargets!} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Meal cards */}
      <section className="grid gap-4 sm:grid-cols-2">
        {MEAL_TYPES.map((mt) => {
          const entries = byMeal[mt];
          const sectionCalories = entries.reduce((sm, e) => sm + e.calories, 0);
          const art = MEAL_ART[mt];
          const ArtIcon = art.icon;
          return (
            <div key={mt} className="card-lift overflow-hidden rounded-xl border bg-card shadow-elev-1">
              <div className="relative h-20 overflow-hidden bg-gradient-to-br from-secondary-container/80 to-primary-container/50">
                <ArtIcon className="absolute -right-2 -bottom-3 size-24 rotate-[-8deg] text-on-primary-container/25" />
                <div className="absolute inset-0 flex items-end justify-between p-3">
                  <span className="label-overline text-on-secondary-container">{art.label}</span>
                  <Badge variant={sectionCalories > 0 ? "default" : "outline"} className="gap-1"><Sparkles className="size-3" />{sectionCalories} ккал</Badge>
                </div>
              </div>
              <div className="p-4">
                {entries.length === 0 ? (
                  <p className="py-3 text-center text-xs text-muted-foreground">Пока ничего не записано.</p>
                ) : (
                  <ul className="space-y-2">
                    {entries.map((e) => (
                      <li key={e._id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low px-3 py-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                            <span className="truncate">{e.name}</span>
                            {e.nutritionSource === "ai_estimate" && (
                              <Badge variant="outline" className="shrink-0 rounded-sm px-1 py-0 text-[9px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">оценка</Badge>
                            )}
                          </p>
                          {(e.calories > 0 || e.protein > 0) && (
                            <p className="mt-0.5 text-xs text-muted-foreground num">Б {e.protein} · У {e.carbs} · Ж {e.fat}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <div className="mr-1 flex items-center rounded-md border">
                            <button type="button" disabled={s.adding || (e.quantity ?? 1) <= 0.5}
                              onClick={() => void s.handleQuickQty(e, -1)}
                              className="flex size-9 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                              aria-label={`Уменьшить порцию ${e.name}`}><Minus className="size-3.5" /></button>
                            <span className="min-w-7 text-center text-xs font-medium num">×{e.quantity ?? 1}</span>
                            <button type="button" disabled={s.adding}
                              onClick={() => void s.handleQuickQty(e, 1)}
                              className="flex size-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                              aria-label={`Увеличить порцию ${e.name}`}><Plus className="size-3.5" /></button>
                          </div>
                          <span className="mr-1 text-xs font-medium num">{e.calories} ккал</span>
                          <button type="button" onClick={() => s.openEdit(e)}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Редактировать запись"><Pencil className="size-3.5" /></button>
                          <button type="button" onClick={() => void s.handleDeleteEntry(e._id, e.name)}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                            aria-label={`Удалить ${e.name}`}><Trash2 className="size-3.5" /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => s.setDialogMeal(mt)}>
                  <Plus className="size-3.5" /> Добавить в {art.label.toLowerCase()}
                </Button>
              </div>
            </div>
          );
        })}
      </section>

      <Separator />

      {/* Custom foods */}
      <section className="space-y-5">
        <div>
          <p className="label-overline text-muted-foreground">Мои продукты</p>
          <h2 className="m3-title-large mt-1">Свои продукты и блюда</h2>
          <p className="mt-1 text-sm text-muted-foreground">Сохраняйте продукты, которые едите часто — запись займёт секунды.</p>
        </div>
        <form onSubmit={s.handleSaveFood} className="card-lift grid gap-3 rounded-xl border bg-card p-5 shadow-elev-1 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <Label htmlFor="nf-name">Название</Label>
            <Input id="nf-name" placeholder="Например, мой протеиновый коктейль" value={s.newFood.name}
              onChange={(e) => s.setNewFood((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="nf-amount">На</Label>
            <Input id="nf-amount" type="text" inputMode="decimal" value={s.newFood.amount}
              onChange={(e) => s.setNewFood((f) => ({ ...f, amount: DECIMAL_INPUT(e.target.value) }))} />
          </div>
          <div>
            <Label htmlFor="nf-unit">Единица</Label>
            <Input id="nf-unit" value={s.newFood.unit} onChange={(e) => s.setNewFood((f) => ({ ...f, unit: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="nf-cal">{UNITS.kcal}</Label>
            <Input id="nf-cal" type="text" inputMode="decimal" value={s.newFood.calories}
              onChange={(e) => s.setNewFood((f) => ({ ...f, calories: DECIMAL_INPUT(e.target.value) }))} />
          </div>
          <div className="flex items-end"><Button type="submit" className="w-full">Сохранить</Button></div>
          <div className="grid grid-cols-3 gap-3 sm:col-span-6">
            {([["protein", "Белки (г)"], ["carbs", "Углеводы (г)"], ["fat", "Жиры (г)"]] as const).map(([key, labelText]) => (
              <div key={key}>
                <Label htmlFor={`nf-${key}`}>{labelText}</Label>
                <Input id={`nf-${key}`} type="text" inputMode="decimal" value={s.newFood[key as keyof typeof s.newFood]}
                  onChange={(e) => s.setNewFood((f) => ({ ...f, [key]: DECIMAL_INPUT(e.target.value) }))} />
              </div>
            ))}
          </div>
        </form>
        {(s.foods ?? []).length > 0 && (
          <div className="card-lift overflow-hidden rounded-xl border bg-card shadow-elev-1">
            <div className="divide-y">
              {(s.foods ?? []).map((f) => (
                <div key={f._id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground num">{f.calories} ккал / {f.amount} {f.unit} · Б {f.protein} · У {f.carbs} · Ж {f.fat}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => { s.setDialogMeal("snack"); s.setCustomName(f.name); s.setCustomCals(String(f.calories)); s.setCustomProtein(String(f.protein)); s.setCustomCarbs(String(f.carbs)); s.setCustomFat(String(f.fat)); }}
                      className="text-xs text-muted-foreground underline-offset-4 hover:underline">Записать</button>
                    <button type="button" onClick={() => void s.handleDeleteFood(f._id, f.name)}
                      className="text-muted-foreground transition-colors hover:text-destructive" aria-label={`Удалить ${f.name}`}><Trash2 className="size-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Dialogs */}
      <AddEditMealDialog
        dialogMeal={s.dialogMeal} editingEntry={s.editingEntry} search={s.search} selectedName={s.selectedName}
        quantity={s.quantity} customName={s.customName} customCals={s.customCals}
        customProtein={s.customProtein} customCarbs={s.customCarbs} customFat={s.customFat}
        adding={s.adding} recentFoods={s.recentFoods}
        offResults={s.offResults} searchingOff={s.searchingOff} offError={s.offError} offSelected={s.offSelected}
        photoDataUrl={s.photoDataUrl} analyzingPhoto={s.analyzingPhoto} photoError={s.photoError} photoReview={s.photoReview}
        selectedPanelRef={s.selectedPanelRef}
        setDialogMeal={s.setDialogMeal} setSearch={s.setSearch} setSelectedName={s.setSelectedName} setQuantity={s.setQuantity}
        setCustomName={s.setCustomName} setCustomCals={s.setCustomCals} setCustomProtein={s.setCustomProtein}
        setCustomCarbs={s.setCustomCarbs} setCustomFat={s.setCustomFat}
        closeDialog={s.closeDialog} handleAdd={s.handleAdd} handleRecentAdd={s.handleRecentAdd}
        handleCustomAdd={s.handleCustomAdd} handleSaveEdit={s.handleSaveEdit}
        handlePhotoFile={s.handlePhotoFile} handleAnalyzePhoto={s.handleAnalyzePhoto} handleConfirmPhoto={s.handleConfirmPhoto}
        updateReviewQuantity={s.updateReviewQuantity} removeReviewItem={s.removeReviewItem}
        handleOffSearch={s.handleOffSearch} setOffSelected={s.setOffSelected}
        stepQuantity={s.stepQuantity} selectedPreview={s.selectedPreview} beginAdding={s.beginAdding} endAdding={s.endAdding}
        track={s.track}
      />

      <PlanPreviewDialog
        showPlan={s.showPlan} setShowPlan={s.setShowPlan} plan={s.plan}
        menuTargets={s.menuTargets} activeMenuGoal={s.activeMenuGoal}
        handleAddAllPlan={s.handleAddAllPlan} adding={s.adding}
      />

      <PremiumDialog open={s.paywallOpen} onOpenChange={s.setPaywallOpen} feature={s.paywallFeature} />
    </div>
  );
}
