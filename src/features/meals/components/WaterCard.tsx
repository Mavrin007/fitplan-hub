/**
 * Вода + «что съесть, чтобы добрать белок» — действие без ухода со страницы:
 * ответ на «сколько осталось» тут же, рядом кнопки. Вынесено из Meals.tsx.
 */

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Droplets, Minus } from "lucide-react";
import { liters } from "@/features/dashboard/today";
import { FOOD_LIBRARY } from "@/lib/mealLibrary";
import type { MealType } from "@/lib/mealLibrary";
import { proteinBoostAmount } from "../lib/mealCalculations";

/** Быстрые «доборы» белка: привычные продукты с готовой порцией. Один тап —
 *  диалог открывается с выбранным продуктом, остаётся только добавить. */
const PROTEIN_BOOSTS: { name: string; qty: number }[] = [
  { name: "Творог (нежирный)", qty: 1 },
  { name: "Куриная грудка (гриль)", qty: 1 },
  { name: "Яйца", qty: 2 },
  { name: "Греческий йогурт (0%)", qty: 1 },
  { name: "Сывороточный протеин", qty: 1 },
];

interface WaterCardProps {
  waterMl: number;
  waterTarget: number;
  waterPct: number;
  proteinLeft: number;
  onWater: (delta: number) => void;
  onOpenQuickAdd: (name: string, qty: number, mealType?: MealType) => void;
}

export function WaterCard({
  waterMl,
  waterTarget,
  waterPct,
  proteinLeft,
  onWater,
  onOpenQuickAdd,
}: WaterCardProps) {
  return (
    <div className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-2">
      <div className="rounded-lg bg-surface-container-low p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="label-overline text-muted-foreground">Вода</p>
          <p className="num text-sm font-medium">
            {liters(waterMl)} / {liters(waterTarget)} л
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-sky-500"
            initial={{ width: 0 }}
            animate={{ width: `${waterPct}%` }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
          />
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => onWater(250)}>
            <Droplets className="size-3.5" /> +250 мл
          </Button>
          <Button size="sm" variant="outline" onClick={() => onWater(500)}>
            +500 мл
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => onWater(-250)}
            disabled={waterMl === 0}
            aria-label="Убрать 250 мл воды"
          >
            <Minus className="size-3.5" />
          </Button>
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
              const boostProtein = proteinBoostAmount(food, b.qty);
              return (
                <button
                  key={b.name}
                  type="button"
                  onClick={() => onOpenQuickAdd(b.name, b.qty, "snack")}
                  className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-brand hover:text-brand"
                >
                  <span className="max-w-32 truncate">{b.name}</span>
                  <span className="shrink-0 text-muted-foreground num">
                    +{boostProtein} г белка
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
