import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { MotionConfig } from "framer-motion";

vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));

import { api, setQuery } from "@/test/convex-react-mock";
import { profile } from "@/test/fixtures";
import { profileSignature, type WorkoutDay } from "@/lib/workoutLibrary";
import Workouts from "./Workouts";

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

/** Минимальный день плана — только то, что нужно для рендера карточки. */
const day: WorkoutDay = {
  day: 0,
  focus: "Фулбоди A",
  exercises: [{ name: "Приседания", sets: 3, reps: "8-12", restSeconds: 90, weightKg: 40 }],
  approxMinutes: 45,
};

/** План со свежей сигнатурой профиля (чтобы эффект автопересборки молчал). */
function makePlan() {
  return {
    _id: "plan1",
    userId: "u1",
    name: "Фулбоди · Жиросжигание",
    profileSignature: profileSignature(profile as Parameters<typeof profileSignature>[0]),
    goal: "lose_weight",
    experienceLevel: "intermediate",
    splitType: "Фулбоди",
    sessionsPerWeek: 3,
    durationWeeks: 4,
    days: [day],
    weeks: [{ week: 1, label: "Неделя 1 · База", days: [day] }],
    updatedAt: 0,
  };
}

/**
 * ЭТОТ ФАЙЛ ОБЯЗАН БЫТЬ ИЗОЛИРОВАН: framer-motion кэширует
 * prefers-reduced-motion на жизнь модуля — первый motion-рендер файла должен
 * быть с matches=true (контроль matches=false живёт в Workouts.test.tsx).
 */
describe("Workouts · prefers-reduced-motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("при matches=true карточка дня (y 10→0) не запускает трансформ-анимацию", async () => {
    stubPrefersReducedMotion();
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.workouts.getMyPlan, undefined, makePlan());
    setQuery(api.workouts.listLogs, {}, []);

    // Рендер как в main.tsx: приложение обёрнуто в MotionConfig reducedMotion="user".
    render(
      <MemoryRouter>
        <MotionConfig reducedMotion="user">
          <Workouts />
        </MotionConfig>
      </MemoryRouter>,
    );

    // Сигнал на проскочившую анимацию: проверка через ~1 кадр (80 мс), а не
    // после 450 мс — при настоящем твине (y 10→0, ~300 мс) через 80 мс
    // transform был бы mid-flight translateY(≈6px) и ассерт «none» упал бы.
    // При reduced motion y входит в positionalKeys → тип { type: false },
    // финальный keyframe применяется мгновенно: transform уже "none".
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    // День плана отрисован — reduced-motion не прячет контент.
    expect(screen.getByText("Пн · Фулбоди A")).toBeInTheDocument();

    // motion.div карточки дня (animate: y 10→0) при reduced motion сразу
    // в конечном виде: transform == "none", а не mid-flight translateY.
    const dayCard = screen
      .getByText("Пн · Фулбоди A")
      .closest("div.card-lift.overflow-hidden") as HTMLElement | null;
    expect(dayCard).not.toBeNull();
    expect(dayCard!.style.transform).toBe("none");
  });
});
