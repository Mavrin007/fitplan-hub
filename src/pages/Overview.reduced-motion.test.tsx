import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { MotionConfig } from "framer-motion";

vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));

// useAuth() требует useConvexAuth/useAuthActions — их нет в дереве теста.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

import { api, setQuery } from "@/test/convex-react-mock";
import { profile, waterEntry } from "@/test/fixtures";
import { lastNDays, todayKey } from "@/lib/dates";
import Overview from "./Overview";

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

/** Тот же диапазон, что строит Overview для календаря активности. */
function activityRange(): { from: string; to: string } {
  const keys = lastNDays(84);
  return { from: keys[0], to: keys[keys.length - 1] };
}

/**
 * ЭТОТ ФАЙЛ ОБЯЗАН БЫТЬ ИЗОЛИРОВАН: framer-motion кэширует
 * prefers-reduced-motion на жизнь модуля — первый motion-рендер файла должен
 * быть с matches=true (контроль matches=false живёт в Overview.test.tsx).
 */
describe("Overview · prefers-reduced-motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("при matches=true заголовок (fadeUp: y 14→0) не запускает трансформ-анимацию", async () => {
    stubPrefersReducedMotion();
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.mealLog.getByDate, { date: todayKey() }, []);
    setQuery(api.weightEntries.listMyWeights, { limit: 90 }, []);
    setQuery(api.workouts.listLogs, { limit: 200 }, []);
    setQuery(
      api.water.getByDate,
      { date: todayKey() },
      waterEntry(0),
    );
    setQuery(api.activity.getActivityDays, activityRange(), []);

    // Рендер как в main.tsx: приложение обёрнуто в MotionConfig reducedMotion="user".
    render(
      <MemoryRouter>
        <MotionConfig reducedMotion="user">
          <Overview />
        </MotionConfig>
      </MemoryRouter>,
    );

    // Сигнал на проскочившую анимацию: проверка через ~1 кадр (80 мс), а не
    // после 450 мс — при настоящем твине (y 14→0, ~300 мс) через 80 мс
    // transform был бы mid-flight translateY(≈10px) и ассерт «none» упал бы.
    // При reduced motion y входит в positionalKeys → тип { type: false },
    // финальный keyframe применяется мгновенно: transform уже "none".
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    // Страница рендерится полностью — reduced-motion не прячет контент.
    expect(
      screen.getByRole("heading", { name: "Сегодня" }),
    ).toBeInTheDocument();

    // motion.header с variants={fadeUp} (y 14→0) при reduced motion сразу в
    // конечном виде: transform == "none", а не mid-flight translateY.
    const header = screen
      .getByRole("heading", { name: "Сегодня" })
      .closest("header") as HTMLElement | null;
    expect(header).not.toBeNull();
    expect(header!.style.transform).toBe("none");
  });

  it("при matches=true CountUp-числа появляются сразу финальными (без докрутки)", async () => {
    stubPrefersReducedMotion();
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(
      api.mealLog.getByDate,
      { date: todayKey() },
      [
        {
          _id: "e1",
          userId: "u1",
          createdAt: 0,
          date: todayKey(),
          mealType: "lunch",
          name: "Обед",
          quantity: 1,
          calories: 1245,
          protein: 100,
          carbs: 150,
          fat: 30,
        },
      ],
    );
    setQuery(api.weightEntries.listMyWeights, { limit: 90 }, []);
    setQuery(api.workouts.listLogs, { limit: 200 }, []);
    setQuery(api.water.getByDate, { date: todayKey() }, waterEntry(500));
    setQuery(api.activity.getActivityDays, activityRange(), []);

    render(
      <MemoryRouter>
        <MotionConfig reducedMotion="user">
          <Overview />
        </MotionConfig>
      </MemoryRouter>,
    );

    // KILO v1.2: CountUp в «Оценке дня» показывает todayScore.score (0–100),
    // а не калории. При фикстуре (обед 1245 ккал, вода 500 мл из 2750,
    // белок 100 из 152, без тренировок) score = 31. Сразу после рендера
    // (без ожидания 800 мс докрутки) значение уже финальное: при reduced
    // motion CountUp ставит итог синхронно, а не анимирует от 0.
    expect(screen.getByText("31")).toBeInTheDocument();
  });
});
