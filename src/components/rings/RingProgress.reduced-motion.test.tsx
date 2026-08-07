/**
 * Изолированный тест prefers-reduced-motion: framer-motion кэширует настройку
 * на жизнь модуля, поэтому matches=true живёт в отдельном файле (тот же
 * паттерн, что у Landing/Dashboard/ProgressRing).
 *
 * Кольца при reduced-motion должны сразу рендериться в финальном состоянии:
 * dashoffset дуги = конечному (а не длине окружности, как при анимации).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MotionConfig } from "framer-motion";
import { RingProgress } from "./RingProgress";
import { CALORIES_RING } from "./colors";
import type { RingDatum } from "./types";

// matchMedia с matches=true для prefers-reduced-motion.
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: query.includes("prefers-reduced-motion"),
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

const RINGS: RingDatum[] = [
  {
    id: "calories",
    label: "Калории",
    value: 742,
    max: 800,
    unit: "ккал",
    color: CALORIES_RING,
  },
];

describe("RingProgress (reduced motion)", () => {
  it("дуга сразу в финальном состоянии: dashoffset = конечный, а не пустой", () => {
    render(
      <MotionConfig reducedMotion="user">
        <RingProgress data={RINGS} />
      </MotionConfig>,
    );

    const group = screen.getByRole("group", { name: "Сегодня: 93%" });
    const arc = group.querySelector('[data-ring="calories"] [data-arc]');
    const c = 2 * Math.PI * ((200 - 17) / 2); // ≈ 574.9
    const target = c * (1 - 742 / 800); // 93 % дуги нарисовано
    const offset = parseFloat(arc!.getAttribute("stroke-dashoffset") ?? "");
    // Финал сразу, без «пустого» начального значения.
    expect(offset).toBeCloseTo(target, 1);
  });
});
