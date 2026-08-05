import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));

const { authMocks, authState } = vi.hoisted(() => ({
  authMocks: { signIn: vi.fn(), signOut: vi.fn() },
  authState: {
    isAuthenticated: true,
    user: { _id: "u1", email: "a@b.c", name: "Тест" } as { _id: string; email: string | null; name: string } | null,
  },
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: authState.isAuthenticated,
    user: authState.user,
    signIn: authMocks.signIn,
    signOut: authMocks.signOut,
  }),
}));

import { api, resetConvexMock, setAction } from "@/test/convex-react-mock";
import { resetMocks, toast } from "@/test/utils";
import { AssistantChat } from "./AssistantChat";

function renderChat() {
  render(
    <MemoryRouter>
      <AssistantChat />
    </MemoryRouter>,
  );
}

/** Открыть окно чата через лаунчер. */
async function openChat(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Открыть ассистента" }));
  return screen.getByRole("dialog", { name: "ИИ-ассистент" });
}

describe("AssistantChat", () => {
  beforeEach(() => {
    resetMocks();
    resetConvexMock();
    window.localStorage.clear();
  });

  it("лаунчер открывает и закрывает окно чата", async () => {
    const user = userEvent.setup();
    renderChat();

    const dialog = await openChat(user);
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Закрыть ассистента" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("неавторизованному показывает приглашение войти", async () => {
    const user = userEvent.setup();
    authState.isAuthenticated = false;
    authState.user = null;
    renderChat();
    const dialog = await openChat(user);

    expect(
      within(dialog).getByText(/Ассистент видит ваши данные/),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Войти/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/auth"),
    );
    // Возвращаем состояние для следующих тестов.
    authState.isAuthenticated = true;
    authState.user = { _id: "u1", email: "a@b.c", name: "Тест" };
  });

  it("отправка сообщения зовёт assistant.chat и показывает ответ", async () => {
    const user = userEvent.setup();
    setAction(api.assistant.chat, async () => ({
      reply: "Вот ваш план на сегодня.",
      logged: [],
      error: false,
    }));
    renderChat();
    const dialog = await openChat(user);

    await user.type(
      within(dialog).getByPlaceholderText(/Например: съел 200 г курицы/),
      "Что мне съесть?",
    );
    await user.click(within(dialog).getByRole("button", { name: "Отправить" }));

    expect(
      await within(dialog).findByText("Вот ваш план на сегодня."),
    ).toBeInTheDocument();
  });

  it("ответ с logged показывает тост о записях", async () => {
    const user = userEvent.setup();
    setAction(api.assistant.chat, async () => ({
      reply: "Записал!",
      logged: [{ kind: "meal", label: "Шашлык — 950 ккал" }],
      error: false,
    }));
    renderChat();
    const dialog = await openChat(user);

    await user.type(
      within(dialog).getByPlaceholderText(/Например: съел 200 г курицы/),
      "съел шашлык",
    );
    await user.click(within(dialog).getByRole("button", { name: "Отправить" }));

    await within(dialog).findByText("Записал!");
    expect(toast.success).toHaveBeenCalledWith("Записано в дневник", {
      description: "Шашлык — 950 ккал",
    });
  });

  it("ошибка действия показывает сообщение об ошибке без падения", async () => {
    const user = userEvent.setup();
    setAction(api.assistant.chat, async () => {
      throw new Error("boom");
    });
    renderChat();
    const dialog = await openChat(user);

    await user.type(
      within(dialog).getByPlaceholderText(/Например: съел 200 г курицы/),
      "привет",
    );
    await user.click(within(dialog).getByRole("button", { name: "Отправить" }));

    expect(
      await within(dialog).findByText(/Не удалось связаться с сервисом/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Не удалось получить ответ"),
    ).toBeInTheDocument();
  });

  it("проверка подключения: успех → toast success, ошибка → toast error", async () => {
    const user = userEvent.setup();
    setAction(api.assistant.checkConnection, async () => ({
      ok: true,
      message: "Всё в порядке",
    }));
    renderChat();
    const dialog = await openChat(user);

    await user.click(
      within(dialog).getByRole("button", { name: "Проверить подключение" }),
    );

    expect(toast.success).toHaveBeenCalledWith("Подключение работает", {
      description: "Всё в порядке",
    });
  });
});
