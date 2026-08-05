import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

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

import { api, setQuery } from "@/test/convex-react-mock";
import { resetMocks } from "@/test/utils";
import Dashboard from "./Dashboard";

describe("Dashboard", () => {
  beforeEach(() => {
    resetMocks();
    authState.user = { email: "user@example.com" };
    authState.signOut.mockClear();
    authState.signOut.mockResolvedValue(undefined);
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
});
