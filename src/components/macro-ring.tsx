import { ProgressRing } from "@/components/progress-ring";

/**
 * Кольцо макроса в едином стиле M3: значение в центре, под ним — целевая
 * доза в граммах или процент от цели, под кольцом — подпись.
 * Используется на «Обзоре» и в «Питании».
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
        <span className="text-sm font-semibold num">{Math.round(value)}</span>
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground num">
          {center === "percent" ? `${pct}%` : `${target} г`}
        </span>
      </ProgressRing>
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
