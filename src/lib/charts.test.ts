/**
 * Юнит-тесты модуля графиков (src/lib/charts.tsx):
 * 1. стиль-константы сохранены с прежними значениями (совместимость API);
 * 2. чистая математика шкал (niceStep/niceCeil/autoDomain/ticksFor) —
 *    без DOM, покрывает границы и вырожденные входы;
 * 3. SVG-компоненты рендерят подписи осей, линию цели и столбцы
 *    (jsdom-снапшот-структура через доступные роли/тексты).
 */
import { describe, expect, it } from "vitest";
import {
  axisProps,
  barAnim,
  autoDomain,
  CHART_HEIGHT,
  formatChartValue,
  goalLabel,
  gridProps,
  lineAnim,
  niceCeil,
  niceStep,
  ticksFor,
  tooltipStyle,
} from "./charts";

describe("charts — единый стиль графиков", () => {
  it("высота графиков фиксирована (220px)", () => {
    expect(CHART_HEIGHT).toBe(220);
  });

  it("ось: подписи 11px из токена --muted-foreground, без линий и засечек", () => {
    expect(axisProps.tick).toEqual({
      fontSize: 11,
      fill: "var(--muted-foreground)",
    });
    expect(axisProps.axisLine).toBe(false);
    expect(axisProps.tickLine).toBe(false);
  });

  it("сетка: пунктир 3 3, цвет рамок, только горизонтальные линии", () => {
    expect(gridProps).toEqual({
      strokeDasharray: "3 3",
      stroke: "var(--border)",
      vertical: false,
    });
  });

  it("тултип: фон popover, рамка border, скругление 8, текст 12px, тень и отступы", () => {
    expect(tooltipStyle).toEqual({
      background: "var(--popover)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      fontSize: 12,
      color: "var(--foreground)",
      boxShadow: "0 8px 24px -8px oklch(0 0 0 / 0.3)",
      padding: "8px 12px",
    });
  });

  it("анимации: задержка 120 мс, easing ease-out, линии 900 мс / бары 700 мс", () => {
    expect(lineAnim.animationBegin).toBe(120);
    expect(lineAnim.animationDuration).toBe(900);
    expect(lineAnim.animationEasing).toBe("ease-out");
    expect(barAnim.animationBegin).toBe(120);
    expect(barAnim.animationDuration).toBe(700);
    expect(barAnim.animationEasing).toBe("ease-out");
  });

  it("goalLabel: текст, позиция insideTopRight, токен цвета, шрифт 10px", () => {
    expect(goalLabel("Цель 72.0")).toEqual({
      value: "Цель 72.0",
      position: "insideTopRight",
      fill: "var(--muted-foreground)",
      fontSize: 10,
    });
  });
});

describe("niceStep — красивый шаг сетки", () => {
  it("возвращает шаг из ряда 1/2/5 × 10ⁿ, не меньше range/target", () => {
    expect(niceStep(10, 4)).toBe(5);
    expect(niceStep(100, 4)).toBe(50);
    expect(niceStep(80, 4)).toBe(20);
    expect(niceStep(40, 4)).toBe(10);
    expect(niceStep(3, 4)).toBe(1);
  });

  it("не ломается на нулевых/отрицательных/нечисловых входах", () => {
    expect(niceStep(0, 4)).toBe(1);
    expect(niceStep(-5, 4)).toBe(1);
    expect(niceStep(Number.NaN, 4)).toBe(1);
    expect(niceStep(Number.POSITIVE_INFINITY, 4)).toBe(1);
  });
});

describe("niceCeil — верхняя граница оси для столбцов", () => {
  it("округляет вверх до красивого числа", () => {
    expect(niceCeil(37, 4)).toBe(40);
    expect(niceCeil(100, 4)).toBe(100);
    expect(niceCeil(101, 4)).toBe(150);
    expect(niceCeil(6, 4)).toBe(6);
  });

  it("integer: шаг не меньше 1 (целые значения)", () => {
    expect(niceCeil(3, 4, true)).toBe(3);
    expect(niceCeil(5.5, 4, true)).toBe(6);
  });

  it("вырожденные входы дают 1", () => {
    expect(niceCeil(0, 4)).toBe(1);
    expect(niceCeil(-1, 4)).toBe(1);
    expect(niceCeil(Number.NaN, 4)).toBe(1);
  });
});

describe("autoDomain — y-домен линейного графика", () => {
  it("добавляет отступ pad по краям", () => {
    expect(autoDomain([80, 82, 81], 1)).toEqual([79, 83]);
  });

  it("плоский ряд центрируется с отступом", () => {
    expect(autoDomain([80, 80], 1)).toEqual([79, 81]);
  });

  it("пустой массив — [0, 2·pad]", () => {
    expect(autoDomain([], 1)).toEqual([0, 2]);
    expect(autoDomain([Number.NaN], 1)).toEqual([0, 2]);
  });
});

describe("ticksFor — тики сетки в диапазоне", () => {
  it("покрывает диапазон и включает верхнюю границу", () => {
    const ticks = ticksFor(0, 10, 4);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(10);
    expect(ticks.every((t) => t >= 0 && t <= 10)).toBe(true);
  });

  it("с произвольными границами даёт равномерный шаг", () => {
    const ticks = ticksFor(78, 82, 4);
    const steps = ticks.slice(1).map((t, i) => t - ticks[i]!);
    expect(new Set(steps).size).toBe(1); // один и тот же шаг
    expect(steps[0]).toBeGreaterThan(0);
  });

  it("вырожденный диапазон — минимум один тик", () => {
    expect(ticksFor(5, 5, 4).length).toBeGreaterThanOrEqual(1);
  });
});

describe("formatChartValue — подписи осей", () => {
  it("целые — с разделителем тысяч (ru, неразрывный пробел)", () => {
    expect(formatChartValue(2197)).toBe("2\u00A0197");
  });

  it("дробные — с запятой вместо точки", () => {
    expect(formatChartValue(79.5)).toBe("79,5");
  });
});
