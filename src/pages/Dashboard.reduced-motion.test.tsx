import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { MotionConfig } from "framer-motion";

vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));

import { api, setQuery } from "@/test/convex-react-mock";

const authState = vi.hoisted(() => ({
  user: null as { email?: string; name?: string; isAnonymous?: boolean } | null,
  signOut: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: authState.user,
    signIn: vi.fn(),
    signOut: authState.signOut,
  }),
}));

import Dashboard from "./Dashboard";

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
 * и кэширует результат. Чтобы matches=true попал в кэш, рендер Dashboard
 * здесь должен быть первым motion-рендером в файле, а контроль (matches=false)
 * живёт в Dashboard.test.tsx. vitest изолирует модули по файлам.
 */
describe("Dashboard · prefers-reduced-motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("при matches=true карточки навигации рендерятся без трансформ-анимации", async () => {
    stubPrefersReducedMotion();
    authState.user = { email: "user@example.com" };
    // Профиль заполнен — онбординг не перекрывает дашборд.
    setQuery(api.profiles.getMyProfile, undefined, { age: 30, weightKg: 80 });

    // Рендер как в main.tsx: приложение обёрнуто в MotionConfig reducedMotion="user".
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <MotionConfig reducedMotion="user">
          <Dashboard />
        </MotionConfig>
      </MemoryRouter>,
    );

    // Продвигаем кадры (rAF-стаб = setTimeout 0): 150 мс — тот же момент,
    // что у контроля. К этому времени reduced-motion уже «прыгнул» в финал
    // (transform: none), а обычная анимация (duration 0.35) была бы в полёте.
    // Снимать позже (например, 450 мс) нельзя: первая карточка финиширует
    // на 350 мс, и проверка стала бы вакуумной (none и без reduced-motion).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    // Дашборд рендерится полностью — reduced-motion не прячет контент.
    expect(
      screen.getByText(/Доброй ночи|Доброе утро|Добрый день|Добрый вечер/),
    ).toBeInTheDocument();

    // Карточка пункта навигации (motion.div initial={{ opacity: 0, x: -8 }},
    // animate={{ opacity: 1, x: 0 }}) при reduced motion пропускает
    // трансформ-анимацию и сразу находится в конечном виде:
    // style.transform == "none", а не initial- или mid-flight-значение.
    const link = document.querySelector<HTMLElement>(
      'aside nav a[href="/dashboard"]',
    );
    expect(link).not.toBeNull();
    const card = link!.parentElement;
    expect(card).not.toBeNull();
    expect(card!.style.transform).toBe("none");
    // opacity НЕ проверяем на этом сэмпле: reducedMotion="user" отключает
    // трансформ-анимации, но opacity продолжает плавно анимироваться
    // (к 150 мс она ~0.92, не 1) — это не регрессия, а штатное поведение.
    // Дискриминирующий сигнал — именно transform: none мгновенно.
  });
});
