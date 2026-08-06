import { ProgressRing } from "@/components/progress-ring";
import { cn } from "@/lib/utils";

/**
 * Кольцо макроса в едином стиле M3: значение в центре, под ним — целевая
 * доза в граммах или процент от цели, под кольцом — подпись.
 * Используется на «Обзоре» и в «Питании».
 *
 * При переборе цели (value > target) кольцо загорается красным, значение
 * подсвечивается, а под ним показывается перебор: «+N%» (center="percent")
 * или «+N г» (center="target").
 */
export function MacroRing({
  label,
  value,
  target,
  color,
  delay = 0,
  center = "target",
}: {
  label: string;
  value: number;
  target: number;
  color: string;
  delay?: number;
  /** Что показывать под значением: целевую дозу в граммах или процент. */
  center?: "target" | "percent";
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const isOver = target > 0 && value > target;
  const overPct = target > 0 ? Math.round((value / target - 1) * 100) : 0;
  const overGrams = Math.round(value - target);

  const sub = isOver
    ? center === "percent"
      ? `+${overPct}%`
      : `+${overGrams} г`
    : center === "percent"
      ? `${pct}%`
      : `${target} г`;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <ProgressRing
        value={value}
        max={target}
        size={76}
        stroke={7}
        color={color}
        delay={delay}
      >
        <span
          className={cn(
            "text-sm font-semibold num",
            isOver && "text-destructive",
          )}
        >
          {Math.round(value)}
        </span>
        <span
          className={cn(
            "text-[9px] uppercase tracking-wider num",
            isOver
              ? "font-semibold text-destructive"
              : "text-muted-foreground",
          )}
        >
          {sub}
        </span>
      </ProgressRing>
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
