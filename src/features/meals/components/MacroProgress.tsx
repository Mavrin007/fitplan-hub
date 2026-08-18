/**
 * Кольца макросов (Белки/Углеводы/Жиры) из сводки дня + строка
 * «К цели» с цветовой индикацией соответствия. Вынесены из Meals.tsx.
 */

import type { Targets } from "@/lib/nutrition";
import { UNITS } from "@/lib/i18n";
import { MacroRing } from "@/components/macro-ring";
import { fitTone } from "../lib/mealFormatting";

interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Строка «соответствие цели»: проценты по ккал/Б/Ж/У против целей из профиля
 *  с цветовой индикацией — видно, насколько день близок к КБЖУ. */
export function MacroMatchRow({
  value,
  target,
}: {
  value: MacroTotals;
  target: Targets;
}) {
  const items: { label: string; v: number; t: number }[] = [
    { label: UNITS.kcal, v: value.calories, t: target.calories },
    { label: "Б", v: value.protein, t: target.protein },
    { label: "Ж", v: value.fat, t: target.fat },
    { label: "У", v: value.carbs, t: target.carbs },
  ];
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]">
      <span className="text-muted-foreground">К цели:</span>
      {items.map(({ label, v, t }) => (
        <span key={label} className={`num ${fitTone(Math.abs(v - t) / t)}`}>
          {label} {Math.round((v / t) * 100)}%
        </span>
      ))}
    </div>
  );
}

/** Три кольца макросов с анимацией появления. */
export function MacroProgress({ totals, targets }: { totals: MacroTotals; targets: Targets }) {
  return (
    <div className="grid grid-cols-3 items-center gap-2">
      <MacroRing
        label="Белки"
        value={totals.protein}
        target={targets.protein}
        color="var(--macro-protein)"
        delay={0.15}
        center="percent"
      />
      <MacroRing
        label="Углеводы"
        value={totals.carbs}
        target={targets.carbs}
        color="var(--macro-carbs)"
        delay={0.25}
        center="percent"
      />
      <MacroRing
        label="Жиры"
        value={totals.fat}
        target={targets.fat}
        color="var(--macro-fat)"
        delay={0.35}
        center="percent"
      />
    </div>
  );
}
