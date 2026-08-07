import { ProgressRing } from "@/components/progress-ring";
import { cn } from "@/lib/utils";

/**
 * Кольцо макроса в едином стиле M3: значение в центре, под ним — целевая
 * доза в граммах или процент от цели, под кольцом — подпись.
 * Используется на «Обзоре» и в «Питании».
 *
 * При переборе цели (value > target) кольцо подсвечивается мягким зелёным
 * (`--macro-over`): перебор белка/углеводов не вреден, поэтому красный цвет
 * оставлен только калориям. Под значением показывается перебор: «+N%»
 * (center="percent") или «+N г» (center="target").
 */
export function MacroRing({
  label,
  value,
  target,
  color,
  overColor = "var(--macro-over)",
  delay = 0,
  center = "target",
}: {
  label: string;
  value: number;
  target: number;
  color: string;
  /** Цвет дуги/подсветки при переборе цели. По умолчанию — мягкий зелёный. */
  overColor?: string;
  delay?: number;
  /** Что показывать под значением: целевую дозу в граммах или процент. */
  center?: "target" | "percent";
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const isOver = target > 0 && value > target;
  const overPct = target > 0 ? Math.round((value / target - 1) * 100) : 0;
  const overGrams = Math.round(value - target);

  // Подпись под значением. При переборе в percent-режиме — две строки
  // («+21%» / «сверх»), как у калорийного кольца: компактно в малом кольце
  // и сразу читается. В остальных случаях — одна строка.
  const isOverPercent = isOver && center === "percent";
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
        overColor={overColor}
        // Точка на кончике всегда в цвете макроса — при переборе дуга
        // зеленеет, но маркер не теряет свою идентичность.
        tipColor={color}
        delay={delay}
      >
        <span
          className={cn("text-sm font-semibold num", !isOver && "text-foreground")}
          style={isOver ? { color: overColor } : undefined}
        >
          {Math.round(value)}
        </span>
        <span
          className={cn(
            "text-[9px] uppercase tracking-wider num",
            isOver ? "font-semibold" : "text-muted-foreground",
          )}
          style={isOver ? { color: overColor } : undefined}
        >
          {sub}
        </span>
        {isOverPercent && (
          <span
            className="text-[7px] font-medium uppercase tracking-[0.14em]"
            style={{ color: overColor }}
          >
            сверх
          </span>
        )}
      </ProgressRing>
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
