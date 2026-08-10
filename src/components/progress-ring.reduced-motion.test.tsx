import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MotionConfig } from "framer-motion";
import { ProgressRing } from "./progress-ring";

/**
 * matchMedia с matches=true ТОЛЬКО для prefers-reduced-motion-запросов
 * (framer-motion читает именно "(prefers-reduced-motion)"). Остальные
 * запросы возвращают false, как в setup.ts.
 */
function stubPrefersReducedMotion() {
  vi.stubGlobal(
    "matchMedia",
    ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })) as unknown as typeof window.matchMedia,
  );
}

/**
 * ЭТОТ ФАЙЛ ОБЯЗАН БЫТЬ ИЗОЛИРОВАН: framer-motion инициализирует
 * prefers-reduced-motion один раз на жизнь модуля (initPrefersReducedMotion)
 * и кэширует результат. Чтобы matches=true попал в кэш, первый motion-рендер
 * в файле должен быть под стабом, а контроль (matches=false) живёт в
 * progress-ring.test.tsx (его первый рендер — без стаба → false).
 *
 * Сигнал reduced-motion у нового движка — дуга: при обычной анимации она
 * стартует с пустого dashoffset (= C), при reduced-motion сразу стоит на
 * финальном значении. Контроль в progress-ring.test.tsx проверяет C.
 */
describe("ProgressRing · prefers-reduced-motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("при matches=true дуга сразу в финальном состоянии (dashoffset = target)", async () => {
    stubPrefersReducedMotion();

    // Рендер как в main.tsx: MotionConfig reducedMotion="user".
    render(
      <MotionConfig reducedMotion="user">
        <ProgressRing value={50} max={100} size={96} stroke={8} />
      </MotionConfig>,
    );

    // Кольцо рендерится полностью — reduced-motion не прячет контент.
    expect(
      screen.getByRole("img", { name: "50% от цели" }),
    ).toBeInTheDocument();

    // r = 44, C = 2π·44; 50% → target = C·(1 − 0.5) = C/2.
    const c = 2 * Math.PI * 44;
    const arc = document.querySelector("[data-arc]");
    const offset = parseFloat(arc!.getAttribute("stroke-dashoffset") ?? "");
    expect(offset).toBeCloseTo(c / 2, 0);
  });
});
