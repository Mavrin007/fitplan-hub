import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { MotionConfig } from "framer-motion";

vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));

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

import { api, convexMock, setQuery } from "@/test/convex-react-mock";
import { resetMocks } from "@/test/utils";
import Dashboard from "./Dashboard";

describe("Dashboard", () => {
  beforeEach(() => {
    resetMocks();
    authState.user = { email: "user@example.com" };
    authState.signOut.mockClear();
    authState.signOut.mockResolvedValue(undefined);
    localStorage.clear();
    // Заполненный профиль по умолчанию — остальные тесты проверяют навигацию.
    setQuery(api.profiles.getMyProfile, undefined, { age: 30, weightKg: 80 });
  });

  it("на первом входе (профиль ещё не создан) показывает онбординг-визард", () => {
    // Явный null = профиль точно не создан (не undefined-загрузка).
    setQuery(api.profiles.getMyProfile, undefined, null);
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("dialog", { name: /Онбординг/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ваши данные" })).toBeInTheDocument();
  });

  it("пока профиль грузится (undefined) визард НЕ мигает", () => {
    // Перед рендером профиль не задан в моке → useQuery вернёт undefined.
    convexMock.queryResults.delete("profiles.getMyProfile:null");
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog", { name: /Онбординг/ })).not.toBeInTheDocument();
    // Дашборд при этом рендерится (заглушка загрузки профиля не мешает).
    expect(screen.getAllByText("user@example.com").length).toBeGreaterThan(0);
  });

  it("с заполненным профилем визард не показывается", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog", { name: /Онбординг/ })).not.toBeInTheDocument();
    expect(
      screen.getByText("user@example.com"),
    ).toBeInTheDocument();
  });

  it("после скипа в браузере визард не возвращается (localStorage)", () => {
    // Профиля нет (null) И стоит скип — визард скрыт именно из-за скипа.
    setQuery(api.profiles.getMyProfile, undefined, null);
    localStorage.setItem("kilo:onboarding-skipped", "1");
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog", { name: /Онбординг/ })).not.toBeInTheDocument();
  });

  it("рендерит навигацию, приветствие и email пользователя", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Dashboard />
      </MemoryRouter>,
    );
    // Навигация дублируется (рейл + нижняя мобильная панель) — проверяем роли.
    for (const label of ["Обзор", "Питание", "Тренировки", "Прогресс", "Профиль"]) {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText("user@example.com").length).toBeGreaterThan(0);
    // Приветствие: одно из четырёх по времени суток.
    const greeting = screen.getByText(/Доброй ночи|Доброе утро|Добрый день|Добрый вечер/);
    expect(greeting).toBeInTheDocument();
  });

  it("выход email-пользователя зовёт signOut и уводит на главную", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Dashboard />
      </MemoryRouter>,
    );
    await user.click(screen.getAllByRole("button", { name: "Выйти" })[0]);
    expect(authState.signOut).toHaveBeenCalledTimes(1);
  });

  it("выход гостя с данными открывает оверлей защиты", async () => {
    authState.user = { isAnonymous: true, name: "Гость" };
    setQuery(api.guestStats.hasMyData, undefined, true);
    setQuery(api.guestStats.countMyData, undefined, 3);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Dashboard />
      </MemoryRouter>,
    );
    await user.click(screen.getAllByRole("button", { name: "Выйти" })[0]);

    // Оверлей с предложением привязать почту, signOut ещё не звали.
    expect(
      screen.getByText("Сохранить данные перед выходом?"),
    ).toBeInTheDocument();
    expect(authState.signOut).not.toHaveBeenCalled();

    // «Выйти всё равно» в оверлее → signOut.
    await user.click(screen.getByRole("button", { name: "Выйти всё равно" }));
    expect(authState.signOut).toHaveBeenCalledTimes(1);
  });

  it("выход гостя без записей выходит сразу (hasMyData = false)", async () => {
    authState.user = { isAnonymous: true };
    setQuery(api.guestStats.hasMyData, undefined, false);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Dashboard />
      </MemoryRouter>,
    );
    await user.click(screen.getAllByRole("button", { name: "Выйти" })[0]);
    // Оверлей не показался — автовыход через эффект.
    expect(authState.signOut).toHaveBeenCalledTimes(1);
  });

  /**
   * Контроль к Dashboard.reduced-motion.test.tsx: БЕЗ системного
   * prefers-reduced-motion карточка навигации реально анимируется.
   * (Этот файл рендерит Dashboard первым — framer-motion кэширует настройку
   * reduced-motion на время жизни модуля, и здесь она равна false.)
   */
  it("контроль: без reduced-motion карточка навигации анимируется (трансформ в полёте)", async () => {
    authState.user = { email: "user@example.com" };
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <MotionConfig reducedMotion="user">
          <Dashboard />
        </MotionConfig>
      </MemoryRouter>,
    );

    // Продвигаем кадры: 150 мс — середина анимации первого пункта
    // навигации (delay 0 + duration 0.35), трансформ ещё не в финале.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    const link = document.querySelector<HTMLElement>(
      'aside nav a[href="/dashboard"]',
    );
    expect(link).not.toBeNull();
    const card = link!.parentElement;
    expect(card).not.toBeNull();
    // x анимируется от -8px: transform не "none" (не конечное состояние).
    expect(card!.style.transform).not.toBe("none");
  });
});
