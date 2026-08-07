import { describe, expect, it } from "vitest";
import {
  MAX_OVERSHOOT,
  arcLength,
  clamp,
  clampedRatio,
  concentricRadii,
  dashOffsetFor,
  defaultStroke,
  formatInteger,
  formatPair,
  fullCirclesOf,
  partialOf,
  percentOf,
  pointOnCircle,
  ratioOf,
} from "./ring-utils";

describe("clamp / ratioOf / clampedRatio", () => {
  it("clamp ограничивает интервалом", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("ratioOf при max <= 0 даёт 0 (защита от деления на ноль)", () => {
    expect(ratioOf(100, 0)).toBe(0);
    expect(ratioOf(100, -5)).toBe(0);
    expect(ratioOf(50, 100)).toBe(0.5);
  });

  it("clampedRatio ограничен 300 %", () => {
    expect(clampedRatio(400, 100)).toBe(MAX_OVERSHOOT);
    expect(clampedRatio(150, 100)).toBe(1.5);
    expect(clampedRatio(-10, 100)).toBe(0);
  });
});

describe("полные круги и хвост перебора", () => {
  it("до 100 % — полных кругов нет, есть только хвост", () => {
    expect(fullCirclesOf(0.8)).toBe(0);
    expect(partialOf(0.8)).toBe(0.8);
  });

  it("150 % — один полный круг + хвост 0.5", () => {
    expect(fullCirclesOf(1.5)).toBe(1);
    expect(partialOf(1.5)).toBe(0.5);
  });

  it("ровно 200 % — два полных круга, хвоста нет", () => {
    expect(fullCirclesOf(2)).toBe(2);
    expect(partialOf(2)).toBe(0);
  });
});

describe("дуги и точки на окружности", () => {
  it("длина дуги = 2πr", () => {
    expect(arcLength(10)).toBeCloseTo(2 * Math.PI * 10, 6);
  });

  it("dashOffsetFor: 0% → C, 100% → 0, 50% → C/2, за пределами — кламп", () => {
    const c = arcLength(10);
    expect(dashOffsetFor(0, 10)).toBeCloseTo(c, 6);
    expect(dashOffsetFor(1, 10)).toBe(0);
    expect(dashOffsetFor(0.5, 10)).toBeCloseTo(c / 2, 6);
    expect(dashOffsetFor(2, 10)).toBe(0);
    expect(dashOffsetFor(-1, 10)).toBeCloseTo(c, 6);
  });

  it("pointOnCircle: 0 → право, 0.25 → низ, 0.75 → верх, 1.5 ≡ 0.5 → лево", () => {
    const right = pointOnCircle(60, 60, 50, 0);
    expect(right.x).toBeCloseTo(110, 5);
    expect(right.y).toBeCloseTo(60, 5);

    const bottom = pointOnCircle(60, 60, 50, 0.25);
    expect(bottom.x).toBeCloseTo(60, 5);
    expect(bottom.y).toBeCloseTo(110, 5);

    const top = pointOnCircle(60, 60, 50, 0.75);
    expect(top.x).toBeCloseTo(60, 5);
    expect(top.y).toBeCloseTo(10, 5);

    // 1.5 оборота ≡ 0.5 — лево (угол 180°).
    const left = pointOnCircle(60, 60, 50, 1.5);
    expect(left.x).toBeCloseTo(10, 5);
    expect(left.y).toBeCloseTo(60, 5);
  });
});

describe("концентрические радиусы и толщины", () => {
  it("внешний радиус = (size − stroke)/2, дальше с отступами", () => {
    const r = concentricRadii(200, [17, 14, 11], 8);
    expect(r[0]).toBeCloseTo(91.5, 5);
    // r1 = r0 − stroke0/2 − gap − stroke1/2 = 91.5 − 8.5 − 8 − 7
    expect(r[1]).toBeCloseTo(68, 5);
    // r2 = r1 − 7 − 8 − 5.5
    expect(r[2]).toBeCloseTo(47.5, 5);
  });

  it("defaultStroke: доля от размера, но не тоньше 6 px", () => {
    expect(defaultStroke(200, 0)).toBe(17);
    expect(defaultStroke(200, 2)).toBe(11);
    expect(defaultStroke(40, 0)).toBe(6);
  });
});

describe("форматирование", () => {
  it("percentOf: 150 % при value > max, 0 при max <= 0", () => {
    expect(percentOf(150, 100)).toBe(150);
    expect(percentOf(300, 100)).toBe(300);
    expect(percentOf(100, 0)).toBe(0);
    expect(percentOf(93, 100)).toBe(93);
  });

  it("formatInteger с русскими разделителями (Node ICU: узкий неразрывный пробел)", () => {
    expect(formatInteger(742)).toBe("742");
    // toLocaleString("ru-RU") в Node даёт U+202F (narrow no-break space).
    expect(formatInteger(2929)).toMatch(/^2[\s\u00A0\u202F]929$/);
  });

  it("formatPair: «742 / 800 ккал», «2,3 / 3 л» через display", () => {
    expect(formatPair(742, 800, "ккал")).toBe("742 / 800 ккал");
    expect(formatPair(2300, 3000, "л", (v) => (v / 1000).toFixed(1))).toBe(
      "2.3 / 3.0 л",
    );
    expect(formatPair(2, 3, "")).toBe("2 / 3");
  });
});
