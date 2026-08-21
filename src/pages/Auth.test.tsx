import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { render } from "@testing-library/react";

vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));

const { authMocks } = vi.hoisted(() => ({
  authMocks: { signIn: vi.fn(), signOut: vi.fn() },
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: false,
    user: null,
    signIn: authMocks.signIn,
    signOut: authMocks.signOut,
  }),
}));

import { resetConvexMock } from "@/test/convex-react-mock";
import Auth from "./Auth";

function renderAuth() {
  return render(
    <MemoryRouter initialEntries={["/auth"]}>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/dashboard" element={<div>Dashboard stub</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Auth — Email + Password", () => {
  beforeEach(() => {
    resetConvexMock();
    authMocks.signIn.mockClear();
    vi.restoreAllMocks();
  });

  it("renders initial email step", async () => {
    renderAuth();
    expect(await screen.findByText("FITPLAN")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("name@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeInTheDocument();
  });

  it("Continue shows sign-in step", async () => {
    const user = userEvent.setup();
    renderAuth();
    await user.type(screen.getByPlaceholderText("name@example.com"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await waitFor(() => expect(screen.getByText("Вход в Кило")).toBeInTheDocument());
    expect(screen.getByLabelText("Пароль")).toBeInTheDocument();
  });

  it("sign-up calls signIn with flow: signUp", async () => {
    const user = userEvent.setup();
    authMocks.signIn.mockResolvedValue(undefined);
    renderAuth();
    await user.type(screen.getByPlaceholderText("name@example.com"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await waitFor(() => expect(screen.getByText("Вход в Кило")).toBeInTheDocument());

    await user.click(screen.getByText("Создать аккаунт"));
    await waitFor(() => expect(screen.getByText("Создайте аккаунт")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Пароль"), "securePassword123");
    // Use form.submit() instead of clicking a button to avoid selector issues
    const form = screen.getByLabelText("Пароль").closest("form")!;
    form.requestSubmit();

    await waitFor(() => {
      expect(authMocks.signIn).toHaveBeenCalledWith("password", {
        flow: "signUp",
        email: "test@example.com",
        password: "securePassword123",
      });
    });
  });

  it("sign-in calls signIn with flow: signIn", async () => {
    const user = userEvent.setup();
    authMocks.signIn.mockResolvedValue(undefined);
    renderAuth();
    await user.type(screen.getByPlaceholderText("name@example.com"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await waitFor(() => expect(screen.getByLabelText("Пароль")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Пароль"), "myPassword123");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    await waitFor(() => {
      expect(authMocks.signIn).toHaveBeenCalledWith("password", {
        flow: "signIn",
        email: "test@example.com",
        password: "myPassword123",
      });
    });
  });

  it("short password disables submit", async () => {
    const user = userEvent.setup();
    renderAuth();
    await user.type(screen.getByPlaceholderText("name@example.com"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await waitFor(() => expect(screen.getByText("Вход в Кило")).toBeInTheDocument());

    await user.click(screen.getByText("Создать аккаунт"));
    await waitFor(() => expect(screen.getByLabelText("Пароль")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Пароль"), "short");
    // The form's submit button has disabled attribute via HTML
    const form = screen.getByLabelText("Пароль").closest("form")!;
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn).toBeTruthy();
    expect(submitBtn).toBeDisabled();
  });

  it("wrong password shows error", async () => {
    const user = userEvent.setup();
    authMocks.signIn.mockRejectedValue(new Error("Invalid credentials"));
    renderAuth();
    await user.type(screen.getByPlaceholderText("name@example.com"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await waitFor(() => expect(screen.getByLabelText("Пароль")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Пароль"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: "Войти" }));
    expect(await screen.findByText("Неверный email или пароль.")).toBeInTheDocument();
  });

  it("'Забыли пароль?' goes to reset step", async () => {
    const user = userEvent.setup();
    renderAuth();
    await user.type(screen.getByPlaceholderText("name@example.com"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await waitFor(() => expect(screen.getByText("Забыли пароль?")).toBeInTheDocument());

    await user.click(screen.getByText("Забыли пароль?"));
    await waitFor(() => expect(screen.getByText("Восстановление")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Отправить код" })).toBeInTheDocument();
  });

  it("reset flow: request → verify step", async () => {
    const user = userEvent.setup();
    authMocks.signIn.mockResolvedValue(undefined);
    renderAuth();
    await user.type(screen.getByPlaceholderText("name@example.com"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    await waitFor(() => expect(screen.getByText("Забыли пароль?")).toBeInTheDocument());

    await user.click(screen.getByText("Забыли пароль?"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Отправить код" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Отправить код" }));

    await waitFor(() => {
      expect(authMocks.signIn).toHaveBeenCalledWith("password", {
        flow: "reset",
        email: "test@example.com",
      });
    });
    await waitFor(() => expect(screen.getByLabelText("Код подтверждения")).toBeInTheDocument());
    expect(screen.getByLabelText("Новый пароль")).toBeInTheDocument();
  });
});
