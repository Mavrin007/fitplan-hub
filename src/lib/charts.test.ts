/**
 * Юнит-тесты общих настроек recharts (src/lib/charts.ts) — чистые константы
 * и goalLabel без рантайма. Единый стиль графиков распределён по страницам
 * через спред-оператор; эти тесты фиксируют значения от регрессий (например,
 * случайная смена токена темы или длительности анимации в одном месте).
 */
import { describe, expect, it } from "vitest";
import {
  axisProps,
  barAnim,
  CHART_HEIGHT,
  goalLabel,
  gridProps,
  lineAnim,
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
