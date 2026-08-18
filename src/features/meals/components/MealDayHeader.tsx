/** Шапка страницы «Питание». Вынесена из Meals.tsx. */

import { DishScene } from "@/components/illustrations";

export function MealDayHeader() {
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="label-overline text-muted-foreground">Питание</p>
        <h1 className="m3-headline-large mt-2">Рацион за сегодня</h1>
        <div
          aria-hidden
          className="mt-3 h-1 w-14 rounded-full bg-gradient-to-r from-brand to-brand-deep dark:from-brand-soft dark:to-brand"
        />
      </div>
      <DishScene className="hidden h-24 w-32 shrink-0 sm:block" />
    </header>
  );
}
