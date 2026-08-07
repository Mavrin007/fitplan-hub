import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { MotionConfig } from "framer-motion";

vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));

import { api, setQuery } from "@/test/convex-react-mock";
import { profile, type MealEntry } from "@/test/fixtures";
import { todayKey } from "@/lib/dates";
import Meals from "./Meals";

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
 * ЭТОТ ФАЙЛ ОБЯЗАН БЫТЬ ИЗОЛИРОВАН: framer-motion кэширует
 * prefers-reduced-motion на жизнь модуля — первый motion-рендер файла должен
 * быть с matches=true (контроль matches=false живёт в Meals.test.tsx).
 *
 * У Meals нет трансформ-анимаций — только ширинные полосы (layout-анимация,
 * которую reduced motion тоже пропускает): план дня на неделе сходится к цели
 * калорий, поэтому полоса обязана быть НЕ в начальном состоянии width: 0.
 */
describe("Meals · prefers-reduced-motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("при matches=true полоса калорий дня сразу в конечной ширине", async () => {
    stubPrefersReducedMotion();
    // Приём пищи, чтобы дневная полоса (съедено/цель) была непустой: при
    // пустом дневнике её честная конечная ширина — 0%, и ассерт неразличим.
    const today: MealEntry[] = [
      {
        _id: "m1",
        userId: "u1",
        date: todayKey(),
        mealType: "breakfast",
        name: "Овсянка",
        quantity: 1,
        calories: 500,
        protein: 20,
        carbs: 60,
        fat: 10,
        createdAt: 0,
      },
    ];
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.mealLog.getByDate, { date: todayKey() }, today);
    setQuery(api.foods.listMyFoods, {}, []);

    // Рендер как в main.tsx: приложение обёрнуто в MotionConfig reducedMotion="user".
    render(
      <MemoryRouter>
        <MotionConfig reducedMotion="user">
          <Meals />
        </MotionConfig>
      </MemoryRouter>,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });

    // Полоса дневника (animate: width 0 → calPct%). При reduced motion
    // layout-анимация пропускается: ширина — конечная (≈23% при 500 ккал),
    // а не застрявшая на начальном width: 0.
    const bar = document.querySelector<HTMLElement>(
      ".h-full.rounded-full.bg-brand",
    );
    expect(bar).not.toBeNull();
    expect(bar!.style.width).not.toBe("0%");
    expect(bar!.style.width).not.toBe("0px");
  });
});
