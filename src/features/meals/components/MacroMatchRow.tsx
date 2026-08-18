import { UNITS } from "@/lib/i18n";
import type { Targets } from "@/lib/nutrition";
import { fitTone } from "../lib/mealUtils";

export function MacroMatchRow({
  value,
  target,
}: {
  value: { calories: number; protein: number; carbs: number; fat: number };
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
