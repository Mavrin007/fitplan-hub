import { useId, useMemo, type ReactNode } from "react";
import { Ring } from "@/components/rings/Ring";
import { DARK_TRACK, volumeColor } from "@/components/rings/colors";
import type { RingDatum } from "@/components/rings/types";

/**
 * Единый стиль колец (градиент-объём, свечение, тень, отражение, капля).
 *
 * Это адаптер над новым движком src/components/rings/Ring.tsx с прежним
 * публичным API (value/max/size/stroke/color/overColor/tipColor/trackColor/
 * delay/children): старые точки использования (герой Landing, «путь к цели»
 * на Прогрессе, MacroRing на «Обзоре» и в «Питании») не менялись — они
 * автоматически получили новый визуальный стиль.
 *
 * Цвета задаются одним CSS-цветом (hex или var(--...)) — объёмная палитра
 * собирается через color-mix. При value > max хвост второго круга, капля
 * и трек тонируются overColor («перелив» перебора).
 */
export function ProgressRing({
  value,
  max,
  size = 96,
  stroke = 8,
  color = "var(--brand)",
  overColor = "var(--destructive)",
  tipColor,
  trackColor = DARK_TRACK,
  delay = 0,
  children,
}: {
  value: number;
  max: number;
  /** Диаметр кольца в px. */
  size?: number;
  /** Толщина дуги в px. */
  stroke?: number;
  /** Цвет дуги (один CSS-цвет; градиент объёма собирается сам). */
  color?: string;
  /** Цвет «перелива» и трека, когда value > max (перебор цели). */
  overColor?: string;
  /** Цвет капли на кончике; по умолчанию — цвет перелива при переборе. */
  tipColor?: string;
  /** Цвет трека (неактивной части). */
  trackColor?: string;
  /** Задержка старта анимации (для каскада колец). */
  delay?: number;
  /** Содержимое в центре кольца (цифры, метки). */
  children?: ReactNode;
}) {
  const rawPct = max > 0 ? value / max : 0;
  const pct = Math.min(1, rawPct);
  const isOver = rawPct > 1;
  const overPct = Math.round((rawPct - 1) * 100);

  const rawId = useId().replace(/:/g, "");
  const tone = volumeColor(color);

  // datum мемоизирован: стабильная ссылка → memo(Ring) реально работает
  // при ре-рендерах страниц (Landing/Progress). При переборе свечение и трек
  // тонируются цветом перелива — кольцо «горит» тоном, а не только дугой.
  const datum: RingDatum = useMemo(
    () => ({
      id: `adapter-${rawId}`,
      label: "progress",
      value,
      max,
      unit: "",
      color: {
        base: color,
        from: tone.from,
        to: tone.to,
        glow: isOver ? overColor : color,
        track: trackColor,
        highlight: "rgba(255, 255, 255, 0.16)",
      },
      overColor: isOver ? overColor : undefined,
      tipColor,
    }),
    [rawId, value, max, color, isOver, overColor, tipColor, trackColor, tone],
  );

  const r = (size - stroke) / 2;
  // Запас вокруг кольца: ореол дуги и капля выходят за окружность; без него
  // SVG обрезает свечение по краю viewport. Холст больше контейнера и
  // центрируется flex-обёрткой — кольцо сохраняет размер и центр.
  const bleed = Math.ceil(stroke * 0.3) + 6;

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        isOver
          ? `Превышение на ${overPct}%`
          : `${Math.round(pct * 100)}% от цели`
      }
    >
      <svg
        width={size + bleed * 2}
        height={size + bleed * 2}
        viewBox={`${-bleed} ${-bleed} ${size + bleed * 2} ${size + bleed * 2}`}
        className="-rotate-90 overflow-visible"
        aria-hidden="true"
      >
        <Ring
          datum={datum}
          cx={size / 2}
          cy={size / 2}
          radius={r}
          stroke={stroke}
          duration={1.4}
          delay={delay}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
