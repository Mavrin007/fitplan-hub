import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** Анимированное кольцо прогресса (SVG + framer-motion).
 *  Плавно «докручивается» от 0 до процента цели — в едином стиле с
 *  линиями на графиках и барами макросов. */
export function ProgressRing({
  value,
  max,
  size = 96,
  stroke = 8,
  color = "var(--brand)",
  trackColor = "var(--muted)",
  delay = 0,
  children,
}: {
  value: number;
  max: number;
  /** Диаметр кольца в px. */
  size?: number;
  /** Толщина дуги в px. */
  stroke?: number;
  color?: string;
  trackColor?: string;
  /** Задержка старта анимации (для каскада колец). */
  delay?: number;
  /** Содержимое в центре кольца (цифры, метки). */
  children?: ReactNode;
}) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - pct);

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(pct * 100)}% от цели`}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Трек */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        {/* Прогресс */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 0.9, ease: "easeOut", delay }}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
