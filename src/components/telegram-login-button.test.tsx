import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  TelegramLoginButton,
  type TelegramWidgetUser,
} from "./telegram-login-button";
import { TELEGRAM_BOT_USERNAME } from "@/lib/telegram/api";

const widgetUser: TelegramWidgetUser = {
  id: 12345,
  first_name: "Иван",
  username: "ivan_test",
  auth_date: 1700000000,
  hash: "abc123",
};

describe("TelegramLoginButton", () => {
  beforeEach(() => {
    delete window.Telegram;
    delete window.onTelegramAuth;
  });

  it("рендерит контейнер и подключает виджет с именем бота", () => {
    const onAuth = vi.fn();
    render(<TelegramLoginButton onAuth={onAuth} />);

    expect(screen.getByTestId("telegram-login-widget")).toBeInTheDocument();
    const script = document.querySelector("script[data-telegram-login]");
    expect(script).not.toBeNull();
    expect(script!.getAttribute("data-telegram-login")).toBe(TELEGRAM_BOT_USERNAME);
    expect(script!.getAttribute("data-onauth")).toBe("onTelegramAuth(user)");
  });

  it("callback виджета вызывает onAuth с данными пользователя", () => {
    const onAuth = vi.fn();
    render(<TelegramLoginButton onAuth={onAuth} />);

    expect(typeof window.onTelegramAuth).toBe("function");
    window.onTelegramAuth!(widgetUser);
    expect(onAuth).toHaveBeenCalledWith(widgetUser);
  });

  it("не рендерится внутри Telegram Mini App (там автовход через initData)", () => {
    window.Telegram = {
      WebApp: {
        initData: "auth_date=1700000000&hash=x",
        initDataUnsafe: {},
      },
    } as unknown as NonNullable<typeof window.Telegram>;

    const onAuth = vi.fn();
    render(<TelegramLoginButton onAuth={onAuth} />);

    expect(
      screen.queryByTestId("telegram-login-widget"),
    ).not.toBeInTheDocument();
    expect(document.querySelector("script[data-telegram-login]")).toBeNull();
  });
});
