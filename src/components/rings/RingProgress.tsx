import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { memo, useCallback, useMemo } from "react";
import { Ring } from "./Ring";
import { RingLabel } from "./RingLabel";
import {
  DEFAULT_GAP_RATIO,
  RING_STAGGER_SECONDS,
  clamp,
  concentricRadii,
  defaultStroke,
  formatPair,
  percentOf,
} from "./ring-utils";
import type { RingDetail, RingProgressProps } from "./types";

/** Амплитуда лёгкого параллакса при движении курсора (px). */
const PARALLAX_PX = 3.5;

/**
 * Композит концентрических колец в стиле Apple Fitness: каждое кольцо —
 * свой цвет, толщина и прогресс (количество колец = длине data).
 *
 * Интерактивность (чистый CSS — без ре-рендеров): при наведении кольца
 * увеличиваются на 3 %, свечение усиливается, центр показывает детали.
 * Параллакс относительно курсора — через motion-значения с пружиной
 * (только визуальный сдвиг, без участия React-рендера).
 *
 * Доступность: каждое кольцо получает role="progressbar" с aria-атрибутами;
 * композит — role="group". prefers-reduced-motion уважается: компоненты
 * используют useReducedMotion и не анимируют.
 */
export const RingProgress = memo(function RingProgress({
  data,
  size = 200,
  gap,
  duration = 1.4,
  delay = 0,
  caption = "Сегодня",
  center,
  "aria-label": ariaLabel,
  className,
}: RingProgressProps) {
  const reduced = useReducedMotion();
  const gapPx = gap ?? Math.round(size * DEFAULT_GAP_RATIO);

  // Радиусы и толщины считаются один раз на набор колец.
  const strokes = useMemo(
    () => data.map((d, i) => d.stroke ?? defaultStroke(size, i)),
    [data, size],
  );
  const radii = useMemo(() => {
    const concentric = concentricRadii(size, strokes, gapPx);
    return data.map((d, i) => d.radius ?? concentric[i]);
  }, [data, size, strokes, gapPx]);

  // Параллакс: движение курсора → маленький сдвиг колец (пружина сглаживает).
  const cursorX = useMotionValue(0);
  const cursorY = useMotionValue(0);
  const parallaxX = useSpring(cursorX, { stiffness: 220, damping: 26 });
  const parallaxY = useSpring(cursorY, { stiffness: 220, damping: 26 });

  const handleMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
      const ny = (e.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
      cursorX.set(clamp(nx, -0.5, 0.5) * PARALLAX_PX);
      cursorY.set(clamp(ny, -0.5, 0.5) * PARALLAX_PX);
    },
    [cursorX, cursorY],
  );
  const handleLeave = useCallback(() => {
    cursorX.set(0);
    cursorY.set(0);
  }, [cursorX, cursorY]);

  const centerPoint = size / 2;
  const primary = data[0];
  const percent = primary ? percentOf(primary.value, primary.max) : 0;

  const details: RingDetail[] = useMemo(
    () =>
      data.map((d) => ({
        label: d.label,
        value: formatPair(d.value, d.max, d.unit, d.display),
        color: d.color.base,
      })),
    [data],
  );

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? `${caption}: ${percent}%`}
      className={`group relative inline-block select-none ${className ?? ""}`}
      style={{ width: size, height: size }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {/* Масштаб при наведении — на отдельной обёртке, чтобы не конфликтовать
          с transform параллакса (framer пишет свой transform на svg). */}
      <div className="transition-transform duration-300 ease-out group-hover:scale-[1.03]">
        <motion.svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90 block"
          aria-hidden="true"
          style={reduced ? undefined : { x: parallaxX, y: parallaxY }}
        >
          {data.map((d, i) => (
            <Ring
              key={d.id}
              datum={d}
              cx={centerPoint}
              cy={centerPoint}
              radius={radii[i]}
              stroke={strokes[i]}
              duration={duration}
              delay={delay + i * RING_STAGGER_SECONDS}
            />
          ))}
        </motion.svg>
      </div>

      {/* Центр: шрифт привязан к диаметру колец (em-классы внутри), поэтому
          текст масштабируется вместе с size без правки разметки. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ fontSize: Math.max(10, size * 0.155) }}
      >
        {center ?? (
          <RingLabel
            percent={percent}
            caption={caption}
            over={percent > 100}
            color={primary?.color.base ?? "var(--brand)"}
            details={details}
          />
        )}
      </div>

      {/* Aria-состояние каждого кольца: скрытое, но читаемое скринридерами */}
      {data.map((d) => (
        <div
          key={`aria-${d.id}`}
          role="progressbar"
          aria-label={`${d.label}: ${formatPair(d.value, d.max, d.unit, d.display)}`}
          aria-valuenow={Math.min(d.value, d.max)}
          aria-valuemin={0}
          aria-valuemax={d.max}
          className="sr-only"
        />
      ))}
    </div>
  );
});
