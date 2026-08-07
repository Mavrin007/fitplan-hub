/**
 * Чистая геометрия колец: никаких компонентов, только числа.
 * Легко юнит-тестируется и переиспользуется Ring.tsx / RingProgress.tsx.
 *
 * Система координат: SVG без поворота. Точки задаются «оборотами» от 3 часов
 * по часовой стрелке (turns): 0 = 3 часа, 0.25 = 6 часов, 0.75 = 12 часов.
 * Компонент поворачивает svg на -90°, поэтому turns=0 визуально оказывается
 * наверху — единая конвенция для дуг, свечения и капли.
 */

/** Полный оборот в радианах. */
export const TAU = Math.PI * 2;

/** Максимальный отображаемый прогресс: 300 % (как Apple — несколько кругов). */
export const MAX_OVERSHOOT = 3;

/** Зазор между кольцами по умолчанию: доля от диаметра композита. */
export const DEFAULT_GAP_RATIO = 0.04;

/** Толщины колец по умолчанию: доли от диаметра (внешнее → внутреннее). */
export const DEFAULT_STROKE_RATIOS = [0.085, 0.07, 0.055] as const;

/** Каскадный шаг задержки между кольцами (с). */
export const RING_STAGGER_SECONDS = 0.12;

/** Доля окружности, на которой лежит отражение (для Ring.tsx). */
export const REFLECTION_LENGTH_RATIO = 0.3;

/** Ограничивает число интервалом [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Сырое отношение value/max (может быть > 1). */
export function ratioOf(value: number, max: number): number {
  if (max <= 0) return 0;
  return value / max;
}

/** Отношение, ограниченное [0, MAX_OVERSHOOT]. */
export function clampedRatio(value: number, max: number): number {
  return clamp(ratioOf(value, max), 0, MAX_OVERSHOOT);
}

/** Сколько полных кругов нарисовано при данном отношении (для >100 %). */
export function fullCirclesOf(ratio: number): number {
  return Math.max(0, Math.floor(ratio));
}

/** Доля последнего неполного круга: 0..1; 0 при целом числе кругов. */
export function partialOf(ratio: number): number {
  const full = fullCirclesOf(ratio);
  return clamp(ratio - full, 0, 1);
}

/** Длина дуги окружности радиусом r. */
export function arcLength(radius: number): number {
  return TAU * radius;
}

/** Смещение dashoffset, при котором нарисована доля fraction окружности
 *  (0 = пусто, 1 = полный круг). Работает с dasharray = [C, C]: видимая дуга
 *  заканчивается в точке turns=0 (после поворота svg — наверху). */
export function dashOffsetFor(fraction: number, radius: number): number {
  return arcLength(radius) * (1 - clamp(fraction, 0, 1));
}

/** Точка на окружности: turns — обороты от 3 часов по часовой стрелке
 *  (0 = право, 0.25 = низ, 0.75 = верх). Обороты периодичны: 1.5 ≡ 0.5. */
export function pointOnCircle(
  cx: number,
  cy: number,
  radius: number,
  turns: number,
): { x: number; y: number } {
  const angle = turns * TAU;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

/** Радиусы концентрических колец под внешний диаметр size.
 *  r_0 — самое внешнее; следующее отступает на половину толщины
 *  предыдущего + gap + половину своей толщины. */
export function concentricRadii(
  size: number,
  strokes: number[],
  gap: number,
): number[] {
  const radii: number[] = [];
  let prevOuterEdge = Infinity;
  for (const stroke of strokes) {
    const r =
      prevOuterEdge === Infinity
        ? (size - stroke) / 2
        : prevOuterEdge - gap - stroke / 2;
    radii.push(r);
    prevOuterEdge = r - stroke / 2;
  }
  return radii;
}

/** Толщина кольца по умолчанию: позиция задаёт долю от диаметра, но не
 *  меньше 6 px (тонкие кольца теряют объёмность). */
export function defaultStroke(size: number, index: number): number {
  const ratio = DEFAULT_STROKE_RATIOS[index] ?? DEFAULT_STROKE_RATIOS[0];
  return Math.max(6, Math.round(size * ratio));
}

/** Процент для центрального числа (может превышать 100, до 300). */
export function percentOf(value: number, max: number): number {
  return Math.round(clampedRatio(value, max) * 100);
}

/** Округлённое целое с русскими разделителями («742»). */
export function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

/** Пара «значение / цель» для центральных деталей: «742 / 800», «2,3 / 3 л». */
export function formatPair(
  value: number,
  max: number,
  unit: string,
  display?: (value: number) => string,
): string {
  const fmt = display ?? formatInteger;
  const unitSuffix = unit ? ` ${unit}` : "";
  return `${fmt(value)} / ${fmt(max)}${unitSuffix}`;
}
