import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { MotionConfig } from "framer-motion";

vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));

const { authMocks, guestUser } = vi.hoisted(() => ({
  authMocks: {
    signIn: vi.fn(),
    signOut: vi.fn(),
  },
  guestUser: { id: "u1", email: null as string | null, name: "Гость" },
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: guestUser,
    signIn: authMocks.signIn,
    signOut: authMocks.signOut,
  }),
}));

import { api, setQuery } from "@/test/convex-react-mock";
import { profile } from "@/test/fixtures";
import Profile from "./Profile";

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
 * быть с matches=true (контроль matches=false живёт в Profile.test.tsx).
 *
 * У Profile нет трансформ-анимаций — только полоса онбординга (layout:
 * width 0 → onboardingPct%). Профиль фикстуры заполнен частично (2 из 4
 * шагов онбординга), поэтому onboardingPct = 50 и полоса обязана быть в
 * конечной ширине, а не на начальном width: 0.
 */
describe("Profile · prefers-reduced-motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("при matches=true полоса онбординга сразу в конечной ширине", async () => {
    stubPrefersReducedMotion();
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.weightEntries.listMyWeights, {}, []);

    // Рендер как в main.tsx: приложение обёрнуто в MotionConfig reducedMotion="user".
    render(
      <MemoryRouter>
        <MotionConfig reducedMotion="user">
          <Profile />
        </MotionConfig>
      </MemoryRouter>,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });

    // Полоса онбординга (animate: width 0 → onboardingPct%). Для фикстуры
    // профиля заполнены 2 из 4 шагов (данные + цель веса; инвентарь и
    // замеры пустые) → конечная ширина 50%. Суть теста: полоса НЕ застряла
    // на начальном width: 0 — reduced motion пропустил layout-анимацию.
    const bar = document.querySelector<HTMLElement>(
      ".h-full.rounded-full.bg-primary",
    );
    expect(bar).not.toBeNull();
    expect(bar!.style.width).toBe("50%");
  });
});
