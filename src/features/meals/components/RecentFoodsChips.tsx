/**
 * Недавние продукты — главный shortcut на странице: один тап открывает
 * диалог с выбранной порцией, остаётся «Добавить». Из библиотеки — их
 * можно открыть с порцией; свои/OFF-продукты остаются в «Недавнем» внутри
 * диалога, где добавляются одним тапом напрямую. Вынесено из Meals.tsx.
 */

import { History } from "lucide-react";
import type { MealType } from "@/lib/mealLibrary";
import type { RecentFoodItem } from "../types";

interface RecentFoodsChipsProps {
  items: RecentFoodItem[];
  onOpenQuickAdd: (name: string, qty: number, mealType?: MealType) => void;
}

export function RecentFoodsChips({ items, onOpenQuickAdd }: RecentFoodsChipsProps) {
  if (items.length === 0) return null;
  return (
    <section className="card-lift rounded-xl border bg-card p-4 shadow-elev-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-overline flex items-center gap-1.5 text-muted-foreground">
          <History className="size-3.5" />
          Недавнее
        </p>
        <span className="text-[11px] text-muted-foreground">тап — откроет порцию</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {items.map((r) => (
          <button
            key={r.name}
            type="button"
            onClick={() => onOpenQuickAdd(r.name, r.quantity, r.mealType)}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-brand hover:text-brand"
          >
            <span className="max-w-36 truncate">{`${r.name} ×${r.quantity}`}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
