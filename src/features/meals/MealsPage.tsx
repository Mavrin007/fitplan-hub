/**
 * Страница «Питание» (/dashboard/meals) — тонкая композиция фичи
 * src/features/meals: вся логика в useMealDiary, JSX — в компонентах,
 * чистая математика — в lib/. Вынесена из src/pages/Meals.tsx.
 */

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PageAurora } from "@/components/page-aurora";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { PremiumDialog } from "@/components/premium-dialog";
import { UtensilsCrossed } from "lucide-react";
import { useMealDiary } from "./hooks/useMealDiary";
import { progressPercent } from "./lib/mealCalculations";
import { MealDayHeader } from "./components/MealDayHeader";
import { MealSummary } from "./components/MealSummary";
import { RecentFoodsChips } from "./components/RecentFoodsChips";
import { CopyDayCard } from "./components/CopyDayCard";
import { WeeklyMenu } from "./components/WeeklyMenu";
import { MealList } from "./components/MealList";
import { CustomFoodsCard } from "./components/CustomFoodsCard";
import { AddMealDialog } from "./components/AddMealDialog";
import { PlanPreviewDialog } from "./components/PlanPreviewDialog";

export default function MealsPage() {
  const d = useMealDiary();
  const targets = d.targets;
  const profile = d.profile;

  if (d.loading) {
    return <PageLoading />;
  }

  if (!targets) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="label-overline text-muted-foreground">Питание</p>
          <h1 className="m3-headline-large mt-2">Питание</h1>
        </header>
        <EmptyState
          icon={UtensilsCrossed}
          title="Цели ещё не рассчитаны"
          description="Настройте профиль — возраст, рост, вес, активность и цель — и получите дневные нормы по калориям и макросам."
          action={
            <Button asChild>
              <a href="/dashboard/profile">Перейти в профиль</a>
            </Button>
          }
        />
      </div>
    );
  }

  const calPct = progressPercent(d.totals.calories, targets.calories);
  const proteinLeft = Math.max(0, Math.round(targets.protein - d.totals.protein));
  const waterPct = progressPercent(d.waterMl, d.waterTarget);
  const planSummary = d.plan
    ? `${d.plan.meals.length} приёмов · ${d.plan.calories.toLocaleString("ru-RU")} ккал предложено`
    : "";

  return (
    <div className="relative isolate mx-auto max-w-4xl space-y-10">
      <PageAurora />
      <MealDayHeader />

      {/* Totals summary — легенда + анимированные кольца макросов */}
      <MealSummary
        totals={d.totals}
        targets={targets}
        calPct={calPct}
        waterMl={d.waterMl}
        waterTarget={d.waterTarget}
        waterPct={waterPct}
        proteinLeft={proteinLeft}
        planSummary={planSummary}
        onWater={(delta) => void d.handleWater(delta)}
        onOpenQuickAdd={d.openQuickAdd}
        onShowPlan={() => d.setShowPlan(true)}
      />

      {/* Недавние продукты — главный shortcut на странице */}
      <RecentFoodsChips items={d.recentQuick} onOpenQuickAdd={d.openQuickAdd} />

      {/* Перенос записей из прошлого дня */}
      <CopyDayCard
        copyFromDate={d.copyFromDate}
        yesterdayKey={d.yesterdayKey}
        copyLog={d.copyLog}
        copySelected={d.copySelected}
        copyByMeal={d.copyByMeal}
        adding={d.adding}
        copying={d.copying}
        repeatMeal={d.repeatMeal}
        repeatSelected={d.repeatSelected}
        onDateChange={d.setCopyFromDate}
        onCopyDay={() => void d.handleCopyDay()}
        onToggleCopyEntry={d.toggleCopyEntry}
        onOpenRepeatMeal={d.openRepeatMeal}
        onCloseRepeatMeal={() => d.setRepeatMeal(null)}
        onToggleRepeatEntry={d.toggleRepeatEntry}
        onRepeatMeal={() => void d.handleRepeatMeal()}
      />

      {/* Недельное меню под цель */}
      {d.weeklyPlan && targets && d.menuTargets && profile && (
        <WeeklyMenu
          weeklyPlan={d.weeklyPlan}
          menuTargets={d.menuTargets}
          activeMenuGoal={d.activeMenuGoal}
          profile={profile}
          onSelectGoal={d.setMenuGoal}
        />
      )}

      {/* Meal cards — M3 filled cards с placeholder-иллюстрациями */}
      <MealList
        byMeal={d.byMeal}
        adding={d.adding}
        onAdd={d.setDialogMeal}
        onQuickQty={(entry, dir) => void d.handleQuickQty(entry, dir)}
        onEdit={d.openEdit}
        onDelete={(id, name) => void d.handleDeleteEntry(id, name)}
      />

      <Separator />

      {/* Custom foods */}
      <CustomFoodsCard
        foods={d.foods}
        newFood={d.newFood}
        setNewFood={d.setNewFood}
        onSubmit={d.handleSaveFood}
        onWriteFood={d.writeFoodToDialog}
        onDeleteFood={(id, name) => void d.handleDeleteFood(id, name)}
      />

      {/* Add/edit entry dialog */}
      <AddMealDialog diary={d} />

      {/* Plan preview dialog */}
      <PlanPreviewDialog
        open={d.showPlan}
        onOpenChange={d.setShowPlan}
        plan={d.plan}
        menuTargets={d.menuTargets}
        activeMenuGoal={d.activeMenuGoal}
        onAddAllPlan={() => void d.handleAddAllPlan()}
      />

      {/* Paywall-заглушка для Premium-фич (сейчас — фото-анализ еды). */}
      <PremiumDialog
        open={d.paywallOpen}
        onOpenChange={d.setPaywallOpen}
        feature={d.paywallFeature}
      />
    </div>
  );
}
