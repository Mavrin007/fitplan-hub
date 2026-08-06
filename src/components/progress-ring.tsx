import { motion } from "framer-motion";
import { useId, type ReactNode } from "react";

/** Анимированное кольцо прогресса (SVG + framer-motion).
 *  Градиентная дуга с мягким ореолом, внутренней подсветкой и точкой на
 *  кончике — плавно «докручивается» от 0 до процента цели. Единый стиль с
 *  линиями на графиках и барами макросов.
 *
 *  Когда value > max — состояние «перебор»: дуга добирает до 100%,
 *  перекрашивается в overColor, ореол мягко пульсирует, а внутреннее
 *  свечение усиливается. Содержимое кольца (children) остаётся под
 *  контролем вызывающего — он сам решает, что показать в центре. */
export function ProgressRing({
  value,
  max,
  size = 96,
  stroke = 8,
  color = "var(--brand)",
  overColor = "var(--destructive)",
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
  /** Цвет дуги и свечения, когда value > max (перебор цели). */
  overColor?: string;
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
  const arcColor = isOver ? overColor : color;

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - pct);

  // CSS-переменные нельзя использовать в url(#id) — чистим useId от ":".
  const rawId = useId().replace(/:/g, "");
  const gradId = `ring-grad-${rawId}`;
  const glowId = `ring-glow-${rawId}`;

  // Кончик дуги: дуга стартует сверху (-90°), dot садится на её конец.
  const tipAngle = -Math.PI / 2 + pct * 2 * Math.PI;
  const tipX = size / 2 + r * Math.cos(tipAngle);
  const tipY = size / 2 + r * Math.sin(tipAngle);

  const arcAnim = { duration: 0.9, ease: "easeOut" as const, delay };

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
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <defs>
          {/* Диагональный градиент: приглушённый верхний левый угол → насыщенный низ */}
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={arcColor} stopOpacity={0.5} />
            <stop offset="55%" stopColor={arcColor} stopOpacity={0.88} />
            <stop offset="100%" stopColor={arcColor} stopOpacity={1} />
          </linearGradient>
          {/* Мягкое свечение внутри кольца — при переборе усиливается (красное) */}
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={arcColor} stopOpacity={isOver ? 0.22 : 0.13} />
            <stop offset="68%" stopColor={arcColor} stopOpacity={isOver ? 0.09 : 0.05} />
            <stop offset="100%" stopColor={arcColor} stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Внутренняя подсветка */}
        <circle cx={size / 2} cy={size / 2} r={r} fill={`url(#${glowId})`} />

        {/* Трек */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />

        {/* Ореол вокруг дуги — при переборе мягко пульсирует */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke + 4}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c, opacity: 0 }}
          animate={{
            strokeDashoffset: dashOffset,
            opacity: isOver ? [0.28, 0.45, 0.28] : 0.22,
          }}
          transition={
            isOver
              ? {
                  strokeDashoffset: arcAnim,
                  opacity: { duration: 1.8, repeat: Infinity, ease: "easeInOut" },
                }
              : arcAnim
          }
        />

        {/* Дуга прогресса */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={arcAnim}
        />

        {/* Точка на кончике дуги — появляется после докручивания */}
        <motion.circle
          cx={tipX}
          cy={tipY}
          r={Math.max(2.5, stroke / 2.4)}
          fill={arcColor}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: pct > 0 ? 1 : 0, scale: pct > 0 ? 1 : 0 }}
          transition={{ duration: 0.25, delay: delay + 0.8, ease: "backOut" }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
