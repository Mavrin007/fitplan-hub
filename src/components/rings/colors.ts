/**
 * Палитры колец в духе Apple Fitness, но без копирования:
 * калории — красный, тренировки — зелёный, вода — синий.
 * Каждая палитра описывает объёмность: базовый цвет, градиент (светлее
 * сверху → глубже снизу), свечение, тёмно-серый трек и блик-отражение.
 */
/** Единый тёмно-серый трек для всех колец (в т.ч. адаптера ProgressRing).
 *  Достаточно светлый, чтобы кольца с 0 % прогресса были различимы на тёмном
 *  фоне, но всё ещё заметно темнее активной дуги. */
export const DARK_TRACK = "rgba(148, 153, 162, 0.42)";

export interface RingColor {
  /** Насыщенный базовый цвет активной дуги. */
  base: string;
  /** Светлый тон градиента (верхний левый угол дуги). */
  from: string;
  /** Глубокий тон градиента (нижний правый угол дуги). */
  to: string;
  /** Цвет мягкого свечения вокруг активной части. */
  glow: string;
  /** Тёмно-серый трек (неактивная часть кольца). */
  track: string;
  /** Лёгкий блик-отражение в верхней части кольца. */
  highlight: string;
}

export const CALORIES_RING: RingColor = {
  base: "#ff2d55",
  from: "#ff7a8f",
  to: "#d90036",
  glow: "rgba(255, 45, 85, 0.42)",
  track: DARK_TRACK,
  highlight: "rgba(255, 255, 255, 0.16)",
};

export const TRAINING_RING: RingColor = {
  base: "#30d158",
  from: "#7ee8a0",
  to: "#1fa93f",
  glow: "rgba(48, 209, 88, 0.38)",
  track: DARK_TRACK,
  highlight: "rgba(255, 255, 255, 0.16)",
};

export const WATER_RING: RingColor = {
  base: "#0a84ff",
  from: "#6cc0ff",
  to: "#0064d6",
  glow: "rgba(10, 132, 255, 0.40)",
  track: DARK_TRACK,
  highlight: "rgba(255, 255, 255, 0.16)",
};

/** Все три палитры для перебора в циклах. */
export const RING_COLORS = [CALORIES_RING, TRAINING_RING, WATER_RING] as const;

/** Объёмная палитра из одного CSS-цвета (hex или var(--...)): светлее сверху,
 *  глубже снизу. Работает через color-mix — тот же «градиент-объём», что у
 *  готовых палитр, но для произвольных цветов (макросы, кастомные кольца). */
export function volumeColor(color: string): {
  from: string;
  to: string;
} {
  return {
    from: `color-mix(in srgb, ${color} 72%, white)`,
    to: `color-mix(in srgb, ${color} 78%, black)`,
  };
}
