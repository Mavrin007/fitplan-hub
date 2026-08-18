import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TelegramLoginButton, type TelegramWidgetUser } from "./telegram-login-button";
import { TELEGRAM_BOT_ID } from "@/lib/telegram/api";

const widgetUser: TelegramWidgetUser = {
  id: 12345,
  first_name: "Иван",
  username: "ivan_test",
  auth_date: 1700000000,
  hash: "abc123",
};
const tgAuthHash = `#tgAuthResult=${encodeURIComponent(
  JSON.stringify(widgetUser),
)}`;

/** Фейковый попап: hash проставляется тестом («Telegram редиректнул»). */
function fakePopup(hash = "") {
  return { location: { hash }, closed: false, close: vi.fn() };
}

describe("TelegramLoginButton", () => {
  beforeEach(() => {
    delete window.Telegram;
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("рендерит заметную кнопку с подписью", () => {
    render(<TelegramLoginButton onAuth={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Войти через Telegram" }),
    ).toBeInTheDocument();
  });

  it("клик открывает попап oauth.telegram.org с bot_id/origin/embed/return_to", async () => {
    const user = userEvent.setup();
    const open = vi
      .spyOn(window, "open")
      .mockReturnValue(fakePopup() as unknown as Window);

    render(<TelegramLoginButton onAuth={vi.fn()} />);
    await user.click(
      screen.getByRole("button", { name: "Войти через Telegram" }),
    );

    expect(open).toHaveBeenCalledTimes(1);
    const url = new URL(open.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://oauth.telegram.org/auth");
    expect(url.searchParams.get("bot_id")).toBe(String(TELEGRAM_BOT_ID));
    expect(url.searchParams.get("origin")).toBe(window.location.origin);
    expect(url.searchParams.get("embed")).toBe("1");
    expect(url.searchParams.get("return_to")).toBe(window.location.origin + "/");
    expect(open.mock.calls[0][1]).toBe("telegram-oauth");
  });

  it("после редиректа попапа (tgAuthResult в хэше) вызывает onAuth и закрывает попап", async () => {
    const user = userEvent.setup();
    const onAuth = vi.fn();
    const popup = fakePopup();
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);

    render(<TelegramLoginButton onAuth={onAuth} />);
    await user.click(
      screen.getByRole("button", { name: "Войти через Telegram" }),
    );

    // Telegram подтвердил и редиректнул попап на наш return_to с результатом.
    popup.location.hash = tgAuthHash;

    await waitFor(() => expect(onAuth).toHaveBeenCalledWith(widgetUser));
    expect(popup.close).toHaveBeenCalled();
  });

  it("хэш #tgAuthResult на странице (вкладка-фолбэк) вызывает onAuth и чистит URL", async () => {
    const onAuth = vi.fn();
    window.location.hash = tgAuthHash;

    render(<TelegramLoginButton onAuth={onAuth} />);

    await waitFor(() => expect(onAuth).toHaveBeenCalledWith(widgetUser));
    expect(window.location.hash).toBe("");
  });

  it("при заблокированном попапе открывает вкладку и показывает подсказку", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "open").mockReturnValue(null);

    render(<TelegramLoginButton onAuth={vi.fn()} />);
    await user.click(
      screen.getByRole("button", { name: "Войти через Telegram" }),
    );

    // Первый вызов — попап (вернул null), второй — вкладка-фолбэк.
    expect(window.open).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/новой вкладке/)).toBeInTheDocument();
  });

  it("не рендерится внутри Telegram Mini App (там автовход через initData)", () => {
    window.Telegram = {
      WebApp: {
        initData: "auth_date=1700000000&hash=x",
        initDataUnsafe: {},
      },
    } as unknown as NonNullable<typeof window.Telegram>;

    render(<TelegramLoginButton onAuth={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: "Войти через Telegram" }),
    ).not.toBeInTheDocument();
  });
});
