/* eslint-disable react-refresh/only-export-components -- модуль графиков
   намеренно смешивает компоненты с чистыми хелперами/константами: и то и
   другое покрывается тестами из одного файла (charts.test.ts). */
/* ------------------------------------------------------------------ */
/* Лёгкие SVG-графики без recharts — единый стиль по всему приложению  */
/* ------------------------------------------------------------------ */
/**
 * Самописные SVG-компоненты графиков (вес/калории/макросы/тоннаж),
 * заменившие recharts (~393 кБ чанк → ~4 кБ).
 *
 * Два компонента покрывают все кейсы страниц:
 * - `SVGAreaChart` — линия с градиентной заливкой (вес);
 * - `SVGBarChart` — столбцы, в т.ч. стек из нескольких серий (макросы),
 *   с пунктирной линией цели (калории) и форматированием подписей (тоннаж).
 *
 * Стиль-константы ниже (`axisProps`, `gridProps`, `tooltipStyle`,
 * `lineAnim`, `barAnim`, `CHART_HEIGHT`, `goalLabel`) сохранены с прежними
 * значениями — их проверяют юнит-тесты, и они же используются внутри
 * компонентов (цвета/размеры/анимации), так что визуал не изменился.
 */

/** Высота графиков (в пикселях) внутри карточек `ChartCard`. */
export const CHART_HEIGHT = 220;

/**
 * Общие настройки осей: размер подписей 11px, цвет из токена
 * `--muted-foreground` (адаптируется к теме).
 */
export const axisProps = {
  tick: { fontSize: 11, fill: "var(--muted-foreground)" },
  axisLine: false,
  tickLine: false,
} as const;

/** Сетка: пунктир 3 3, цвет рамок, только горизонтальные линии. */
export const gridProps = {
  strokeDasharray: "3 3",
  stroke: "var(--border)",
  vertical: false,
} as const;

/** Тултип: фон popover, рамка border, скругление 8, текст 12px. */
export const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
  boxShadow: "0 8px 24px -8px oklch(0 0 0 / 0.3)",
  padding: "8px 12px",
} as const;

/** Подсветка ячейки под курсором для столбчатых графиков. */
export const tooltipCursor = { fill: "var(--muted)" } as const;

/** Скругление верха столбцов: [верхний-левый, верхний-правый, 0, 0]. */
export const barRadius: [number, number, number, number] = [4, 4, 0, 0];

/** Анимация линий/областей: задержка 120 мс, прорисовка 900 мс. */
export const lineAnim = {
  animationBegin: 120,
  animationDuration: 900,
  animationEasing: "ease-out",
} as const;

/** Анимация столбцов: задержка 120 мс, рост 700 мс. */
export const barAnim = {
  animationBegin: 120,
  animationDuration: 700,
  animationEasing: "ease-out",
} as const;

/**
 * Подпись пунктирной линии цели. Сохранена для совместимости с прежним API
 * (recharts-конфиг); компоненты принимают `referenceLabel` строкой.
 */
export function goalLabel(text: string) {
  return {
    value: text,
    position: "insideTopRight" as const,
    fill: "var(--muted-foreground)",
    fontSize: 10,
  };
}

/* ------------------------------------------------------------------ */
/* Чистая математика шкал — юнит-тестируется без DOM                   */
/* ------------------------------------------------------------------ */

/** «Красивый» шаг сетки (1/2/5 × 10ⁿ), не меньше range/targetTicks. */
export function niceStep(range: number, targetTicks = 4): number {
  if (!(range > 0) || !Number.isFinite(range)) return 1;
  const raw = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/**
 * Верхняя граница оси Y для столбцов: ближайшее «красивое» число не меньше
 * max. `integer` — для целых значений (число тренировок в неделю).
 */
export function niceCeil(max: number, targetTicks = 4, integer = false): number {
  if (!(max > 0) || !Number.isFinite(max)) return 1;
  let step = niceStep(max, targetTicks);
  if (integer) step = Math.max(1, Math.ceil(step));
  return Math.ceil(max / step) * step;
}

/**
 * Y-домен для линейного графика с отступом: [min − pad, max + pad].
 * Если данные почти плоские (разброс < 2·pad) — центрируем по середине.
 */
export function autoDomain(values: number[], pad = 1): [number, number] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [0, pad * 2];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (max - min < pad * 2) {
    const mid = (min + max) / 2;
    return [mid - pad, mid + pad];
  }
  return [min - pad, max + pad];
}

/** Красивые тики сетки в диапазоне [min, max] (включая границы). */
export function ticksFor(min: number, max: number, targetTicks = 4): number[] {
  const step = niceStep(max - min, targetTicks);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    out.push(Math.round(v * 1e9) / 1e9);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Вспомогательные хуки                                                 */
/* ------------------------------------------------------------------ */

import { useEffect, useId, useRef, useState, type RefObject } from "react";

/** Ширина контейнера через ResizeObserver; в jsdom/SSR — фолбэк 640. */
function useChartWidth(
  fallback = 640,
): { ref: RefObject<HTMLDivElement | null>; width: number } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** Мягкое появление графика (opacity) — соответствует lineAnim/barAnim. */
function useFadeIn(beginMs: number): number {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), beginMs);
    return () => window.clearTimeout(t);
  }, [beginMs]);
  return visible ? 1 : 0;
}

const AXIS_FONT = axisProps.tick.fontSize;
const AXIS_FILL = axisProps.tick.fill;

/** Формат значения по умолчанию: целое с пробелами, иначе с запятой. */
export function formatChartValue(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString("ru-RU") : String(v).replace(".", ",");
}

/* ------------------------------------------------------------------ */
/* SVGAreaChart — линия + градиентная заливка + линия цели             */
/* ------------------------------------------------------------------ */

export interface SVGAreaChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string;
  name?: string;
  height?: number;
  /** Показывать каждую (labelInterval + 1)-ю подпись оси X. */
  labelInterval?: number;
  /** Явный y-домен; по умолчанию autoDomain(data, pad). */
  yDomain?: [number, number];
  yDomainPad?: number;
  referenceY?: number;
  referenceLabel?: string;
  tooltipFormatter?: (value: number) => string;
  /** Цвет линии, градиентной заливки и точки под курсором. */
  color?: string;
  className?: string;
}

const AREA_MARGIN = { left: 40, right: 10, top: 20, bottom: 24 } as const;

export function SVGAreaChart({
  data,
  xKey,
  yKey,
  name = yKey,
  height = CHART_HEIGHT,
  labelInterval = 0,
  yDomain,
  yDomainPad = 1,
  referenceY,
  referenceLabel,
  tooltipFormatter,
  color = "var(--brand)",
  className,
}: SVGAreaChartProps) {
  const { ref, width } = useChartWidth();
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const opacity = useFadeIn(lineAnim.animationBegin);

  const { top, bottom, left, right } = AREA_MARGIN;
  const innerW = Math.max(10, width - left - right);
  const innerH = Math.max(10, height - top - bottom);

  const n = data.length;
  const values = data.map((d) => Number(d[yKey]));
  const domain = yDomain ?? autoDomain(values, yDomainPad);
  const [dMin, dMax] = domain;
  const span = Math.max(1e-6, dMax - dMin);

  const scaleY = (v: number) => top + innerH - ((v - dMin) / span) * innerH;
  const xFor = (i: number) =>
    n === 1 ? left + innerW / 2 : left + (i / Math.max(1, n - 1)) * innerW;

  const points = values
    .map((v, i) => (Number.isFinite(v) ? { x: xFor(i), y: scaleY(v), v, i } : null))
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const linePath =
    points.length > 0
      ? points.map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
      : "";
  const baselineY = top + innerH;
  const areaPath =
    points.length > 1
      ? `${linePath} L${points[points.length - 1]!.x.toFixed(1)} ${baselineY} L${points[0]!.x.toFixed(1)} ${baselineY} Z`
      : "";

  const ticks = ticksFor(dMin, dMax, 4).filter((t) => t >= dMin && t <= dMax);

  // Тултип: ближайший индекс по позиции курсора.
  const [hover, setHover] = useState<number | null>(null);
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // jsdom (тесты) не даёт реальной геометрии — фолбэк на внутреннюю ширину.
    const relX = (e.nativeEvent as PointerEvent).offsetX ?? e.clientX - rect.left;
    const w = rect.width || innerW;
    const rel = Math.max(0, Math.min(1, relX / w));
    setHover(Math.round(rel * (n - 1)));
  };
  const hoverPoint = hover !== null ? points.find((p) => p.i === hover) : null;
  const hoverVal = hover !== null && Number.isFinite(values[hover]) ? values[hover] : null;

  return (
    <div ref={ref} className={className} style={{ position: "relative", height }}>
      <svg width={width} height={height} role="img" style={{ opacity, transition: `opacity ${lineAnim.animationDuration}ms ease-out` }}>
        <defs>
          <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Горизонтальная сетка */}
        {ticks.map((t) => (
          <line
            key={t}
            x1={left}
            x2={width - right}
            y1={scaleY(t)}
            y2={scaleY(t)}
            stroke={gridProps.stroke}
            strokeDasharray={gridProps.strokeDasharray}
          />
        ))}

        {/* Подписи оси Y */}
        {ticks.map((t) => (
          <text
            key={`y-${t}`}
            x={left - 6}
            y={scaleY(t) + AXIS_FONT / 2 - 1}
            textAnchor="end"
            fontSize={AXIS_FONT}
            fill={AXIS_FILL}
            className="num"
          >
            {formatChartValue(t)}
          </text>
        ))}

        {/* Подписи оси X — с интервалом, последняя всегда видна */}
        {data.map((d, i) =>
          (i % (labelInterval + 1) === 0 || i === n - 1) && n > 1 ? (
            <text
              key={`x-${i}`}
              x={xFor(i)}
              y={height - 6}
              textAnchor="middle"
              fontSize={AXIS_FONT}
              fill={AXIS_FILL}
            >
              {String(d[xKey])}
            </text>
          ) : null,
        )}

        {/* Пунктирная линия цели. Если цель вне домена данных (например,
            калорийность 2633 против максимума 400) — линия клампится к краю
            графика, как это делал recharts, и не пропадает за кадром. */}
        {referenceY !== undefined && Number.isFinite(referenceY) && (
          (() => {
            const refY = Math.max(
              top,
              Math.min(top + innerH, scaleY(referenceY)),
            );
            // Если цель выше домена — линия прижата к верху, подпись под ней;
            // иначе подпись над линией. Никогда не вылезаем за границы svg.
            const labelY =
              referenceY >= dMax
                ? Math.min(height - 4, refY + 12)
                : Math.max(10, refY - 4);
            return (
              <>
                <line
                  x1={left}
                  x2={width - right}
                  y1={refY}
                  y2={refY}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                />
                {referenceLabel && (
                  <text
                    x={width - right - 2}
                    y={labelY}
                    textAnchor="end"
                    fontSize={10}
                    fill="var(--muted-foreground)"
                  >
                    {referenceLabel}
                  </text>
                )}
              </>
            );
          })()
        )}

        {areaPath && <path d={areaPath} fill={`url(#area-${gid})`} />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Точка под курсором + вертикальная направляющая */}
        {hoverPoint && (
          <>
            <line
              x1={hoverPoint.x}
              x2={hoverPoint.x}
              y1={top}
              y2={baselineY}
              stroke="var(--muted)"
              strokeWidth={1}
            />
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r={3} fill={color} />
          </>
        )}

        {/* Прозрачная зона захвата курсора */}
        <rect
          x={left}
          y={top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {/* HTML-тултип: подпись точки (дата) + значение. Клампим по X, чтобы
          у крайних точек тултип не вылезал за границы графика (как в баре). */}
      {hoverVal !== null && hoverPoint && (
        <div
          style={{
            ...tooltipStyle,
            position: "absolute",
            left: Math.min(Math.max(hoverPoint.x, 60), width - 60),
            top: hoverPoint.y,
            transform: "translate(-50%, -130%)",
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
          }}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {String(data[hoverPoint.i][xKey])}
          </div>
          <div>
            <span className="font-medium">{name}: </span>
            <span className="num">
              {tooltipFormatter ? tooltipFormatter(hoverVal) : formatChartValue(hoverVal)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SVGBarChart — столбцы (одиночные или стек) + линия цели             */
/* ------------------------------------------------------------------ */

export interface SVGBarSeries {
  key: string;
  name?: string;
  fill: string;
}

export interface SVGBarChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  /** Одна серия — простые столбцы; несколько — стек (снизу вверх). */
  series: SVGBarSeries[];
  height?: number;
  labelInterval?: number;
  referenceY?: number;
  referenceLabel?: string;
  yTickFormatter?: (v: number) => string;
  tooltipFormatter?: (value: number, name?: string) => string;
  maxBarSize?: number;
  /** Целые значения по Y (число тренировок) — шаг сетки не меньше 1. */
  allowDecimals?: boolean;
  className?: string;
}

const BAR_MARGIN = { left: 40, right: 10, top: 16, bottom: 24 } as const;

/** Путь прямоугольника с округлым только верхом (radius [4,4,0,0]). */
function topRoundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return [
    `M${x.toFixed(1)} ${(y + h).toFixed(1)}`,
    `L${x.toFixed(1)} ${(y + rr).toFixed(1)}`,
    `Q${x.toFixed(1)} ${y.toFixed(1)} ${(x + rr).toFixed(1)} ${y.toFixed(1)}`,
    `L${(x + w - rr).toFixed(1)} ${y.toFixed(1)}`,
    `Q${(x + w).toFixed(1)} ${y.toFixed(1)} ${(x + w).toFixed(1)} ${(y + rr).toFixed(1)}`,
    `L${(x + w).toFixed(1)} ${(y + h).toFixed(1)}`,
    "Z",
  ].join(" ");
}

export function SVGBarChart({
  data,
  xKey,
  series,
  height = CHART_HEIGHT,
  labelInterval = 0,
  referenceY,
  referenceLabel,
  yTickFormatter,
  tooltipFormatter,
  maxBarSize = 32,
  allowDecimals = true,
  className,
}: SVGBarChartProps) {
  const { ref, width } = useChartWidth();
  const opacity = useFadeIn(barAnim.animationBegin);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const { top, bottom, left, right } = BAR_MARGIN;
  const innerW = Math.max(10, width - left - right);
  const innerH = Math.max(10, height - top - bottom);

  const n = data.length;
  const num = (d: Record<string, string | number>, key: string) => Number(d[key]) || 0;

  const totals = data.map((d) => series.reduce((s, sr) => s + num(d, sr.key), 0));
  const yMax = niceCeil(Math.max(1, ...totals), 4, !allowDecimals);
  // Целочисленные данные (тренировки) — шаг тиков тоже целый, иначе на оси
  // появились бы «0,5» при allowDecimals=false.
  const tickStep = !allowDecimals ? Math.max(1, Math.ceil(niceStep(yMax, 4))) : niceStep(yMax, 4);
  const ticks: number[] = [];
  for (let v = 0; v <= yMax + 1e-9; v += tickStep) ticks.push(Math.round(v * 1e9) / 1e9);
  const span = Math.max(1e-6, yMax - 0);
  const scaleY = (v: number) => top + innerH - (v / span) * innerH;

  const band = innerW / Math.max(1, n);
  const barW = Math.min(band * 0.65, maxBarSize);
  const barX = (i: number) => left + i * band + (band - barW) / 2;
  const topR = barRadius[0];

  const [hover, setHover] = useState<number | null>(null);
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // jsdom (тесты) не даёт реальной геометрии — фолбэк на внутреннюю ширину.
    const relX = (e.nativeEvent as PointerEvent).offsetX ?? e.clientX - rect.left;
    const w = rect.width || innerW;
    const rel = Math.max(0, Math.min(1, relX / w));
    setHover(Math.min(n - 1, Math.floor(rel * n)));
  };
  const hoverD = hover !== null ? data[hover] : null;

  return (
    <div ref={ref} className={className} style={{ position: "relative", height }}>
      <svg width={width} height={height} role="img" style={{ opacity, transition: `opacity ${barAnim.animationDuration}ms ease-out` }}>
        {/* Вертикальные градиенты столбцов: светлее сверху → насыщеннее у
            основания — глубина как у кольца прогресса. По одному на серию
            (в стеке каждая сегментация ссылается на градиент своего цвета). */}
        <defs>
          {series.map((sr) => (
            <linearGradient
              key={`grad-${sr.key}`}
              id={`bar-${gid}-${sr.key}`}
              x1="0" y1="0" x2="0" y2="1"
            >
              <stop offset="0%" stopColor={sr.fill} stopOpacity={0.6} />
              <stop offset="100%" stopColor={sr.fill} stopOpacity={1} />
            </linearGradient>
          ))}
        </defs>

        {/* Горизонтальная сетка */}
        {ticks.map((t) => (
          <line
            key={t}
            x1={left}
            x2={width - right}
            y1={scaleY(t)}
            y2={scaleY(t)}
            stroke={gridProps.stroke}
            strokeDasharray={gridProps.strokeDasharray}
          />
        ))}

        {/* Подписи оси Y */}
        {ticks.map((t) => (
          <text
            key={`y-${t}`}
            x={left - 6}
            y={scaleY(t) + AXIS_FONT / 2 - 1}
            textAnchor="end"
            fontSize={AXIS_FONT}
            fill={AXIS_FILL}
            className="num"
          >
            {yTickFormatter ? yTickFormatter(t) : formatChartValue(t)}
          </text>
        ))}

        {/* Подписи оси X */}
        {data.map((d, i) =>
          (i % (labelInterval + 1) === 0 || i === n - 1) && n > 1 ? (
            <text
              key={`x-${i}`}
              x={barX(i) + barW / 2}
              y={height - 6}
              textAnchor="middle"
              fontSize={AXIS_FONT}
              fill={AXIS_FILL}
            >
              {String(d[xKey])}
            </text>
          ) : null,
        )}

        {/* Пунктирная линия цели, клампится к краю графика при цели вне домена. */}
        {referenceY !== undefined && Number.isFinite(referenceY) && (
          (() => {
            const refY = Math.max(top, Math.min(top + innerH, scaleY(referenceY)));
            // Цель вне домена: прижата к верху — подпись под линией, и наоборот.
            const labelY =
              referenceY >= yMax
                ? Math.min(height - 4, refY + 12)
                : Math.max(10, refY - 4);
            return (
              <>
                <line
                  x1={left}
                  x2={width - right}
                  y1={refY}
                  y2={refY}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                />
                {referenceLabel && (
                  <text
                    x={width - right - 2}
                    y={labelY}
                    textAnchor="end"
                    fontSize={10}
                    fill="var(--muted-foreground)"
                  >
                    {referenceLabel}
                  </text>
                )}
              </>
            );
          })()
        )}

        {/* Подсветка колонки под курсором */}
        {hover !== null && (
          <rect
            x={left + hover * band}
            y={top}
            width={band}
            height={innerH}
            fill={tooltipCursor.fill}
            opacity={0.5}
          />
        )}

        {/* Столбцы: стек строится снизу вверх, скругление — только у верхней
            ненулевой сегментации (как radius [4,4,0,0] в recharts) */}
        {data.map((d, i) => {
          const x = barX(i);
          let base = 0;
          const segments = series.map((sr) => {
            const v = num(d, sr.key);
            const seg = { sr, v, y1: scaleY(base), y2: scaleY(base + v), base };
            base += v;
            return seg;
          });
          // Последний ненулевой сегмент — с округлённым верхом.
          const lastNonZero = segments.reduce(
            (acc, seg, idx) => (seg.v > 0 ? idx : acc),
            -1,
          );
          return segments.map((seg, si) => {
            if (seg.v <= 0) return null;
            const rounded = si === lastNonZero;
            const h = seg.y1 - seg.y2;
            const fill = `url(#bar-${gid}-${seg.sr.key})`;
            return rounded ? (
              <path
                key={`${i}-${seg.sr.key}`}
                d={topRoundedRect(x, seg.y2, barW, h, topR)}
                fill={fill}
              />
            ) : (
              <rect
                key={`${i}-${seg.sr.key}`}
                x={x}
                y={seg.y2}
                width={barW}
                height={h}
                fill={fill}
              />
            );
          });
        })}

        {/* Прозрачная зона захвата курсора */}
        <rect
          x={left}
          y={top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {/* HTML-тултип: подпись точки (дата) + значения серий */}
      {hoverD && (
        <div
          style={{
            ...tooltipStyle,
            position: "absolute",
            left: Math.min(Math.max(barX(hover!) + barW / 2, 60), width - 60),
            top: Math.max(10, scaleY(totals[hover!]) - 6),
            transform: "translate(-50%, -130%)",
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
          }}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {String(hoverD[xKey])}
          </div>
          {series.map((sr, si) => {
            const v = num(hoverD, sr.key);
            if (v <= 0 && series.length > 1) return null;
            return (
              <div key={sr.key} className="flex items-baseline gap-1.5">
                <span
                  className="inline-block size-2 self-center rounded-full"
                  style={{ background: sr.fill }}
                />
                <span className="font-medium">
                  {tooltipFormatter
                    ? tooltipFormatter(v, sr.name)
                    : `${sr.name ?? sr.key}: `}
                </span>
                {!tooltipFormatter && (
                  <span className="num">{formatChartValue(v)}</span>
                )}
                {si < series.length - 1 && series.length > 1 && (
                  <span className="opacity-0 w-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
