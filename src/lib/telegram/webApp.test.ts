import { afterEach, describe, expect, it, vi } from "vitest";
import { isTelegramWebApp, setTelegramVerticalSwipes } from "./webApp";

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

/* ------------------------------------------------------------------ */
/* setTelegramVerticalSwipes — feature detection без try/catch          */
/* ------------------------------------------------------------------ */

function makeWebApp(overrides: Record<string, unknown> = {}) {
  const app = {
    initData: "auth_date=1700000000&hash=x",
    initDataUnsafe: {},
    platform: "android",
    version: "7.7",
    ready: vi.fn(),
    expand: vi.fn(),
    isVersionAtLeast: vi.fn((v: string) => {
      // Упрощённая имитация: «7.7» >= «7.7», «8.0» >= «7.7» и т.д.
      const cur = app.version.split(".").map(Number);
      const req = v.split(".").map(Number);
      for (let i = 0; i < Math.max(cur.length, req.length); i++) {
        const c = cur[i] ?? 0;
        const r = req[i] ?? 0;
        if (c !== r) return c > r;
      }
      return true;
    }),
    disableVerticalSwipes: vi.fn(),
    enableVerticalSwipes: vi.fn(),
    ...overrides,
  };
  return app;
}

describe("setTelegramVerticalSwipes", () => {
  afterEach(() => {
    delete window.Telegram;
    delete window.TelegramWebviewProxy;
  });

  it("Telegram WebApp отсутствует — ничего не делает", () => {
    delete window.Telegram;
    // Не должен бросить ошибку.
    setTelegramVerticalSwipes(false);
    setTelegramVerticalSwipes(true);
  });

  it("API version 6.0 — не вызывает disableVerticalSwipes", () => {
    const app = makeWebApp({ version: "6.0" });
    window.Telegram = { WebApp: app } as unknown as NonNullable<
      typeof window.Telegram
    >;
    setTelegramVerticalSwipes(false);
    expect(app.disableVerticalSwipes).not.toHaveBeenCalled();
    expect(app.enableVerticalSwipes).not.toHaveBeenCalled();
  });

  it("API version ниже минимальной (7.0) — не вызывает методы", () => {
    const app = makeWebApp({ version: "7.0" });
    window.Telegram = { WebApp: app } as unknown as NonNullable<
      typeof window.Telegram
    >;
    setTelegramVerticalSwipes(false);
    expect(app.disableVerticalSwipes).not.toHaveBeenCalled();
  });

  it("поддерживаемая версия (7.7) — вызывает disableVerticalSwipes", () => {
    const app = makeWebApp({ version: "7.7" });
    window.Telegram = { WebApp: app } as unknown as NonNullable<
      typeof window.Telegram
    >;
    setTelegramVerticalSwipes(false);
    expect(app.disableVerticalSwipes).toHaveBeenCalledTimes(1);
    expect(app.enableVerticalSwipes).not.toHaveBeenCalled();
  });

  it("поддерживаемая версия (8.0) — вызывает disableVerticalSwipes", () => {
    const app = makeWebApp({ version: "8.0" });
    window.Telegram = { WebApp: app } as unknown as NonNullable<
      typeof window.Telegram
    >;
    setTelegramVerticalSwipes(false);
    expect(app.disableVerticalSwipes).toHaveBeenCalledTimes(1);
  });

  it("метод отсутствует (delete) — ничего не делает", () => {
    const app = makeWebApp();
    delete (app as Record<string, unknown>).disableVerticalSwipes;
    delete (app as Record<string, unknown>).enableVerticalSwipes;
    window.Telegram = { WebApp: app } as unknown as NonNullable<
      typeof window.Telegram
    >;
    // Не должен бросить ошибку.
    setTelegramVerticalSwipes(false);
    setTelegramVerticalSwipes(true);
  });

  it("enableVerticalSwipes — вызывает enableVerticalSwipes", () => {
    const app = makeWebApp({ version: "8.0" });
    window.Telegram = { WebApp: app } as unknown as NonNullable<
      typeof window.Telegram
    >;
    setTelegramVerticalSwipes(true);
    expect(app.enableVerticalSwipes).toHaveBeenCalledTimes(1);
    expect(app.disableVerticalSwipes).not.toHaveBeenCalled();
  });

  it("disableVerticalSwipes — вызывает disableVerticalSwipes", () => {
    const app = makeWebApp({ version: "8.0" });
    window.Telegram = { WebApp: app } as unknown as NonNullable<
      typeof window.Telegram
    >;
    setTelegramVerticalSwipes(false);
    expect(app.disableVerticalSwipes).toHaveBeenCalledTimes(1);
    expect(app.enableVerticalSwipes).not.toHaveBeenCalled();
  });

  it("isVersionAtLeast отсутствует (API < 6.1) — не вызывает методы", () => {
    const app = makeWebApp({ version: "6.0" });
    delete (app as Record<string, unknown>).isVersionAtLeast;
    window.Telegram = { WebApp: app } as unknown as NonNullable<
      typeof window.Telegram
    >;
    setTelegramVerticalSwipes(false);
    expect(app.disableVerticalSwipes).not.toHaveBeenCalled();
  });

  it("стаб telegram-web-app.js (platform=unknown) — не вызывает", () => {
    window.Telegram = browserStub;
    // browserStub не имеет disableVerticalSwipes — не должен бросить.
    setTelegramVerticalSwipes(false);
  });
});
