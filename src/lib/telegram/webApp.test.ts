import { afterEach, describe, expect, it } from "vitest";
import { isTelegramWebApp } from "./webApp";

/** Стаб, который официальный telegram-web-app.js создаёт в обычном браузере. */
const browserStub = {
  WebApp: {
    initData: "",
    initDataUnsafe: {},
    platform: "unknown",
    version: "6.0",
  },
} as unknown as NonNullable<typeof window.Telegram>;

describe("isTelegramWebApp", () => {
  afterEach(() => {
    delete window.Telegram;
    delete window.TelegramWebviewProxy;
  });

  it("обычный браузер без window.Telegram — не Mini App", () => {
    delete window.Telegram;
    expect(isTelegramWebApp()).toBe(false);
  });

  it("стаб telegram-web-app.js (initData пустой) — НЕ Mini App", () => {
    // Регрессия: раньше стаб считался Mini App, и кнопка входа через
    // Telegram не рендерилась на вебе.
    window.Telegram = browserStub;
    expect(isTelegramWebApp()).toBe(false);
  });

  it("настоящий Mini App с подписанным initData — Mini App", () => {
    window.Telegram = {
      WebApp: { ...browserStub.WebApp, initData: "auth_date=1700000000&hash=x" },
    } as unknown as NonNullable<typeof window.Telegram>;
    expect(isTelegramWebApp()).toBe(true);
  });

  it("реальная платформа (не unknown) — Mini App", () => {
    window.Telegram = {
      WebApp: { ...browserStub.WebApp, platform: "android" },
    } as unknown as NonNullable<typeof window.Telegram>;
    expect(isTelegramWebApp()).toBe(true);
  });

  it("TelegramWebviewProxy (реальный WebView) — Mini App даже без initData", () => {
    window.Telegram = browserStub;
    window.TelegramWebviewProxy = {};
    expect(isTelegramWebApp()).toBe(true);
  });
});
