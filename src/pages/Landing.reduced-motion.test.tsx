import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { MotionConfig } from "framer-motion";
import Landing from "./Landing";

/**
 * matchMedia с matches=true ТОЛЬКО для prefers-reduced-motion-запросов
 * (framer-motion читает именно "(prefers-reduced-motion)"). Остальные
 * запросы — use-mobile, темы — возвращают false, как в setup.ts.
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
 * и кэширует результат. Чтобы matches=true попал в кэш, рендер Landing здесь
 * должен быть первым motion-рендером в файле, а контроль (matches=false) —
 * жить в другом файле (Landing.test.tsx). vitest изолирует модули по файлам.
 */
describe("Landing · prefers-reduced-motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("при matches=true hero-карточка не запускает трансформ-анимацию", async () => {
    stubPrefersReducedMotion();

    // Рендер как в main.tsx: приложение обёрнуто в MotionConfig reducedMotion="user".
    render(
      <MemoryRouter>
        <MotionConfig reducedMotion="user">
          <Landing />
        </MotionConfig>
      </MemoryRouter>,
    );

    // Продвигаем кадры (rAF-стаб = setTimeout 0): 450 мс заведомо больше
    // первого кадра, на котором reduced-motion «прыгает» к конечному виду.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });

    // Страница рендерится полностью — reduced-motion не прячет контент.
    expect(
      screen.getByRole("heading", { name: /Знайте свои цифры/ }),
    ).toBeInTheDocument();

    // Hero-карточка (animate: y 24→0, scale 0.98→1) при reduced motion
    // пропускает трансформ-анимацию и сразу находится в конечном виде:
    // style.transform == "none", а не initial- или mid-flight-значение.
    const hero = document.querySelector<HTMLElement>(".glow.overflow-hidden");
    expect(hero).not.toBeNull();
    expect(hero!.style.transform).toBe("none");
  });
});
