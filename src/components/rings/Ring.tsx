import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { memo, useEffect, useId } from "react";
import type { RingDatum } from "./types";
import {
  REFLECTION_LENGTH_RATIO,
  arcLength,
  clampedRatio,
  dashOffsetFor,
  fullCirclesOf,
  partialOf,
  pointOnCircle,
} from "./ring-utils";
import { volumeColor } from "./colors";

/** Плавное замедление в духе Apple (easeOutCubic). */
const APPLE_EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

/** Непрозрачность свечения-ореола вокруг дуги. */
const HALO_OPACITY = 0.22;
/** Свечение «хвоста» при переборе цели (второй круг) — ярче, чтобы перебор
 *  был заметен даже поверх полного круга. */
const OVERFLOW_HALO_OPACITY = 0.42;

interface RingProps {
  datum: RingDatum;
  cx: number;
  cy: number;
  radius: number;
  stroke: number;
  /** Длительность полного круга (сек); неполный круг — пропорционально. */
  duration: number;
  /** Базовая задержка старта (сек). */
  delay: number;
}

/**
 * Одно SVG-кольцо: тёмно-серый трек, градиентная активная дуга с мягким
 * свечением, внутренняя тень снизу-справа и блик-отражение сверху.
 * Капля на кончике едет вдоль фронта дуги по окружности (интерполируется
 * угол, а не x/y — движение не по хорде) и мягко «приземляется».
 *
 * При value > max рисуются полные круги (второй, третий — как Apple),
 * а «хвост» перебора подсвечивается ярче. Капля при этом продолжает путь
 * на следующий круг и останавливается на позиции перебора.
 *
 * При обновлении value капля и дуги плавно доезжают до нового значения
 * без сброса к нулю (framer продолжает с текущих значений).
 */
export const Ring = memo(function Ring({
  datum,
  cx,
  cy,
  radius,
  stroke,
  duration,
  delay,
}: RingProps) {
  const reduced = useReducedMotion();
  const rawId = useId().replace(/:/g, "");
  const gradId = `ring-grad-${rawId}`;
  const overGradId = `ring-grad-over-${rawId}`;
  const glowId = `ring-glow-${rawId}`;
  const shadeId = `ring-shade-${rawId}`;
  const reflId = `ring-refl-${rawId}`;
  const ratio = clampedRatio(datum.value, datum.max);
  const full = fullCirclesOf(ratio);
  const partial = partialOf(ratio);
  const circumference = arcLength(radius);

  // Сегменты дуги: полные круги (перебор) + неполный «хвост». Каждый рисуется
  // со своей задержкой — кольцо «докручивается» на следующий круг.
  const segments: {
    fraction: number;
    delay: number;
    segmentDuration: number;
    overflow: boolean;
  }[] = [];
  let acc = delay;
  for (let i = 0; i < full; i++) {
    segments.push({
      fraction: 1,
      delay: acc,
      segmentDuration: duration,
      overflow: false,
    });
    acc += duration;
  }
  if (partial > 0) {
    segments.push({
      fraction: partial,
      delay: acc,
      segmentDuration: duration * partial,
      overflow: full > 0,
    });
  }
  const totalDraw = acc + (partial > 0 ? duration * partial : 0);

  // Капля едет вдоль фронта: от точки начала (turns=1, после поворота — верх)
  // до конечной позиции фронта. Для перебора turns уходит «на следующий круг»
  // (убывает ниже 0), что и создаёт эффект второй окружности.
  const hasArc = ratio > 0;
  const beadStartTurns = 1;
  const beadEndTurns = 1 - ratio;
  const beadTurns = useMotionValue(beadStartTurns);

  useEffect(() => {
    if (reduced || !hasArc) {
      beadTurns.set(beadEndTurns);
      return;
    }
    // animate(от текущего значения) — при смене value капля доезжает до нового
    // значения без сброса к нулю.
    const controls = animate(beadTurns, beadEndTurns, {
      duration: Math.max(0.4, totalDraw),
      delay,
      ease: APPLE_EASE,
    });
    return () => controls.stop();
  }, [beadEndTurns, totalDraw, delay, reduced, hasArc, beadTurns]);

  const beadX = useTransform(beadTurns, (t) => pointOnCircle(cx, cy, radius, t).x);
  const beadY = useTransform(beadTurns, (t) => pointOnCircle(cx, cy, radius, t).y);

  const color = datum.color;
  const overColor = datum.overColor;
  const overflow = ratio > 1 && !!overColor;
  // «Перелив» перебора: оттенок из одного CSS-цвета через color-mix.
  const overTone = overColor ? volumeColor(overColor) : null;
  const haloWidth = stroke + Math.max(4, stroke * 0.45);
  const beadRadius = Math.max(2.5, stroke / 2.1);
  // Точка старта дуги: чтобы dash-дуга «начиналась наверху», dashoffset берётся
  // от длины, а не от положения — видимая дуга всегда заканчивается в turns=0.
  const emptyOffset = circumference;
  const reflLength = circumference * REFLECTION_LENGTH_RATIO;

  return (
    <g data-ring={datum.id}>
      <defs>
        {/* Диагональный градиент дуги: светлее сверху-слева, глубже снизу-справа */}
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color.from} />
          <stop offset="55%" stopColor={color.base} />
          <stop offset="100%" stopColor={color.to} />
        </linearGradient>
        {/* Градиент «перелива»: хвост перебора (нужен только при переборе) */}
        {overTone && overflow && (
          <linearGradient id={overGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={overTone.from} />
            <stop offset="55%" stopColor={overColor} />
            <stop offset="100%" stopColor={overTone.to} />
          </linearGradient>
        )}
        {/* Мягкое свечение внутри кольца */}
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color.base} stopOpacity={0.3} />
          <stop offset="62%" stopColor={color.base} stopOpacity={0.12} />
          <stop offset="100%" stopColor={color.base} stopOpacity={0} />
        </radialGradient>
        {/* Лёгкая тень по внутренней кромке кольца (только снизу) — даёт
            объём, не «съедая» трек и дугу: тонкая обводка, а не заливка. */}
        <linearGradient id={shadeId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="55%" stopColor="#000000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0.38} />
        </linearGradient>
        {/* Отражение: едва заметный белый блик в верхней части кольца */}
        <linearGradient id={reflId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color.highlight} />
          <stop offset="100%" stopColor={color.highlight} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Внутреннее свечение (усиливается при наведении на композит) */}
      <circle
        cx={cx}
        cy={cy}
        r={radius - stroke * 0.55}
        fill={`url(#${glowId})`}
        className="transition-opacity duration-300 opacity-70 group-hover:opacity-100"
      />

      {/* Тёмно-серый трек; при переборе тонируется цветом перелива (~30%) */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={overflow ? overColor : color.track}
        strokeOpacity={overflow ? 0.3 : 1}
        strokeWidth={stroke}
      />

      {/* Внутренняя тень: тонкая кромка по внутренней стороне кольца,
          тёмная снизу — объём без «вырезанных» кусков. */}
      <circle
        cx={cx}
        cy={cy}
        r={radius - stroke * 0.55}
        fill="none"
        stroke={`url(#${shadeId})`}
        strokeWidth={Math.max(1.5, stroke * 0.38)}
        opacity={0.7}
        pointerEvents="none"
      />

      {/* Активные дуги: полные круги + хвост перебора (хвост — цвет перелива) */}
      {segments.map((seg, i) => {
        const target = dashOffsetFor(seg.fraction, radius);
        // Перелив красит только хвост (partial после полных кругов);
        // сами полные круги остаются в цвете кольца.
        const tinted = seg.overflow && !!overColor;
        const common = {
          cx,
          cy,
          r: radius,
          fill: "none",
          stroke: tinted ? `url(#${overGradId})` : `url(#${gradId})`,
          strokeLinecap: "round" as const,
          strokeDasharray: circumference,
          initial: {
            strokeDashoffset: reduced ? target : emptyOffset,
            opacity: reduced ? 1 : 0,
          },
          animate: { strokeDashoffset: target, opacity: 1 },
          transition: {
            duration: seg.segmentDuration,
            delay: seg.delay,
            ease: APPLE_EASE,
          },
        };
        return (
          <g key={i}>
            {/* Ореол вокруг дуги — у хвоста перебора ярче и «дышит»
                (opacity-массив с повторением): перебор заметен даже в покое.
                При reduced-motion пульсация отключается — статичная яркость. */}
            <motion.circle
              {...common}
              data-arc-halo
              strokeWidth={haloWidth}
              initial={{
                strokeDashoffset: reduced ? target : emptyOffset,
                opacity: reduced ? (seg.overflow ? OVERFLOW_HALO_OPACITY : HALO_OPACITY) : 0,
              }}
              animate={{
                strokeDashoffset: target,
                opacity: reduced
                  ? seg.overflow
                    ? OVERFLOW_HALO_OPACITY
                    : HALO_OPACITY
                  : seg.overflow
                    ? [
                        OVERFLOW_HALO_OPACITY,
                        OVERFLOW_HALO_OPACITY * 1.9,
                        OVERFLOW_HALO_OPACITY,
                      ]
                    : HALO_OPACITY,
              }}
              transition={
                seg.overflow && !reduced
                  ? {
                      strokeDashoffset: {
                        duration: seg.segmentDuration,
                        delay: seg.delay,
                        ease: APPLE_EASE,
                      },
                      opacity: {
                        duration: 1.1,
                        delay: seg.delay,
                        repeat: Infinity,
                        repeatType: "mirror",
                        ease: "easeInOut",
                      },
                    }
                  : {
                      duration: seg.segmentDuration,
                      delay: seg.delay,
                      ease: APPLE_EASE,
                    }
              }
            />
            <motion.circle {...common} data-arc strokeWidth={stroke} />
          </g>
        );
      })}

      {/* Блик-отражение в верхней части кольца (dash целиком внутри пути),
          тоньше и прозрачнее — подчёркивает глянец, не «разрезает» дугу. */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={`url(#${reflId})`}
        strokeWidth={Math.max(1, stroke * 0.22)}
        strokeLinecap="round"
        strokeDasharray={`${reflLength} ${circumference}`}
        strokeDashoffset={circumference - reflLength}
        opacity={0.3}
        pointerEvents="none"
      />

      {/* Капля на кончике дуги: едет по окружности (угол интерполируется),
          затем по-настоящему «приземляется» на пружине (spring). При переборе
          капля на хвосте красится в цвет перелива, если tipColor не задан. */}
      {hasArc && (
        <motion.circle
          data-bead
          r={beadRadius}
          fill={datum.tipColor ?? (overflow ? overColor : color.base)}
          style={{ cx: beadX, cy: beadY }}
          initial={{ opacity: reduced ? 1 : 0, r: reduced ? beadRadius : beadRadius * 0.7 }}
          animate={{ opacity: 1, r: beadRadius }}
          transition={{
            opacity: { duration: 0.25, delay },
            r: {
              type: "spring",
              stiffness: 320,
              damping: 17,
              mass: 0.6,
              delay: delay + totalDraw,
            },
          }}
        />
      )}
    </g>
  );
});
