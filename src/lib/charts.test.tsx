/**
 * Юнит-тесты модуля графиков (src/lib/charts.tsx):
 * 1. стиль-константы сохранены с прежними значениями (совместимость API);
 * 2. чистая математика шкал (niceStep/niceCeil/autoDomain/ticksFor) —
 *    без DOM, покрывает границы и вырожденные входы;
 * 3. SVG-компоненты рендерят подписи осей, линию цели и столбцы
 *    (jsdom-снапшот-структура через доступные роли/тексты).
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
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
import { SVGBarChart, SVGAreaChart } from "./charts";

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

describe("SVGBarChart — градиентная заливка столбцов", () => {
  it("столбцы ссылаются на вертикальный градиент своей серии", () => {
    const { container } = render(
      <SVGBarChart
        data={[{ d: "Пн", calories: 120 }]}
        xKey="d"
        series={[{ key: "calories", name: "Калории", fill: "var(--brand)" }]}
        height={100}
      />,
    );
    const svg = container.querySelector("svg")!;
    // Градиент создан для серии и идёт вертикально (сверху вниз).
    const grad = svg.querySelector("linearGradient");
    expect(grad).not.toBeNull();
    expect(grad!.getAttribute("x1")).toBe("0");
    expect(grad!.getAttribute("y1")).toBe("0");
    expect(grad!.getAttribute("x2")).toBe("0");
    expect(grad!.getAttribute("y2")).toBe("1");
    // Верх светлее (0.6), основание насыщеннее (1) — глубина как у кольца.
    // В jsdom атрибуты сериализуются с дефисом: stop-opacity/stop-color.
    const stops = grad!.querySelectorAll("stop");
    expect(stops.length).toBe(2);
    expect(stops[0]!.getAttribute("stop-opacity")).toBe("0.6");
    expect(stops[1]!.getAttribute("stop-opacity")).toBe("1");
    expect(stops[0]!.getAttribute("stop-color")).toBe("var(--brand)");
    // Столбец заливается url(#…-calories), а не плоским цветом
    // (первый rect в DOM может быть зоной захвата курсора — фильтруем).
    const bar = [...svg.querySelectorAll("rect, path")].find((el) =>
      el.getAttribute("fill")?.startsWith("url(#"),
    )!;
    expect(bar.getAttribute("fill")).toBe(`url(#${grad!.id})`);
  });

  it("в стеке каждая серия получает собственный градиент", () => {
    const { container } = render(
      <SVGBarChart
        data={[{ d: "Пн", protein: 40, fat: 20 }]}
        xKey="d"
        series={[
          { key: "protein", name: "Белки", fill: "var(--macro-protein)" },
          { key: "fat", name: "Жиры", fill: "var(--macro-fat)" },
        ]}
        height={100}
      />,
    );
    const svg = container.querySelector("svg")!;
    const grads = svg.querySelectorAll("linearGradient");
    expect(grads.length).toBe(2);
    const ids = [...grads].map((g) => g.id);
    // Только элементы с градиентной заливкой — столбцы (без зоны захвата
    // курсора fill="transparent"). Каждый сегмент ссылается на градиент
    // своего цвета.
    const bars = [...svg.querySelectorAll("rect, path")].filter((el) =>
      el.getAttribute("fill")?.startsWith("url(#"),
    );
    expect(bars.length).toBe(2);
    bars.forEach((bar) => {
      const fill = bar.getAttribute("fill")!;
      expect(ids.some((id) => fill === `url(#${id})`)).toBe(true);
    });
  });
});

describe("SVGAreaChart — цвет линии и заливки", () => {
  it("линия и градиент используют переданный color", () => {
    const { container } = render(
      <SVGAreaChart
        data={[
          { d: "Пн", weight: 80 },
          { d: "Вт", weight: 79 },
        ]}
        xKey="d"
        yKey="weight"
        name="Вес"
        height={100}
        color="var(--accent-activity)"
      />,
    );
    const svg = container.querySelector("svg")!;
    // Линия — переданный цвет.
    const line = [...svg.querySelectorAll("path")].find(
      (p) => p.getAttribute("fill") === "none",
    )!;
    expect(line.getAttribute("stroke")).toBe("var(--accent-activity)");
    // Градиент заливки — тот же цвет (jsdom сериализует stop-color с дефисом).
    const grad = svg.querySelector("linearGradient")!;
    const stops = [...grad.querySelectorAll("stop")];
    expect(stops.length).toBeGreaterThan(0);
    stops.forEach((s) => {
      expect(s.getAttribute("stop-color")).toBe("var(--accent-activity)");
    });
    // Заливка области ссылается на этот градиент.
    const area = [...svg.querySelectorAll("path")].find(
      (p) => p.getAttribute("fill")?.startsWith("url(#"),
    )!;
    expect(area.getAttribute("fill")).toBe(`url(#${grad.id})`);
  });

  it("дефолт — брендовый var(--brand)", () => {
    const { container } = render(
      <SVGAreaChart
        data={[{ d: "Пн", weight: 80 }]}
        xKey="d"
        yKey="weight"
        height={100}
      />,
    );
    const svg = container.querySelector("svg")!;
    const line = [...svg.querySelectorAll("path")].find(
      (p) => p.getAttribute("fill") === "none",
    )!;
    expect(line.getAttribute("stroke")).toBe("var(--brand)");
    const grad = svg.querySelector("linearGradient")!;
    expect(grad.querySelector("stop")!.getAttribute("stop-color")).toBe(
      "var(--brand)",
    );
  });
});
