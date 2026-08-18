/**
 * Тесты src/lib/telegram/status.ts: диагностика конфигурации без сети.
 * tgApi и fetch мокаются — проверяем сборку статуса, что секреты наружу
 * не уходят, и проверку Login Widget (oauth.telegram.org).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  tgApi: vi.fn(),
  TELEGRAM_BOT_ID: 8659935112,
}));

import { tgApi } from "./api";
import { checkLoginWidget, telegramStatus } from "./status";

const tgApiMock = vi.mocked(tgApi);

/** Фейковый fetch: отвечает текстом oauth.telegram.org. */
function fetchReturning(text: string, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(text, { status, headers: { "Content-Type": "text/html" } }),
  ) as unknown as typeof fetch;
}

describe("telegramStatus", () => {
  it("токен не задан: ok=false, getMe с ошибкой, без вызовов Bot API", async () => {
    const status = await telegramStatus({});

    expect(status.ok).toBe(false);
    expect(status.token).toEqual({ configured: false, prefix: null, length: null });
    expect(status.getMe.ok).toBe(false);
    expect(status.getMe.error).toMatch(/не задан/);
    expect(status.loginWidget).toEqual({
      checked: false,
      origin: null,
      ok: false,
    });
    expect(tgApiMock).not.toHaveBeenCalled();
  });

  it("токен задан и валиден: getMe проходит, вебхук читается", async () => {
    tgApiMock
      .mockResolvedValueOnce({ id: 8659935112, username: "FitplanKiloBot" })
      .mockResolvedValueOnce({
        url: "https://x.convex.site/telegram-webhook",
        pending_update_count: 0,
      });

    const status = await telegramStatus({
      botToken: "8659935112:AAEO9JMPWuLJh5VPrx_rWzH5Sak6UU458Co",
      webhookSecret: "s3cret",
      miniAppUrl: "https://fitplan-hub.vercel.app",
    });

    expect(status.ok).toBe(true);
    // Только префикс и длина — не весь токен.
    expect(status.token).toEqual({ configured: true, prefix: "86599", length: 46 });
    expect(status.webhookSecretConfigured).toBe(true);
    expect(status.miniAppUrlConfigured).toBe(true);
    expect(status.getMe).toEqual({ ok: true, id: 8659935112, username: "FitplanKiloBot" });
    expect(status.webhook).toEqual({
      url: "https://x.convex.site/telegram-webhook",
      pending: 0,
    });
  });

  it("origin задан: проверка Login Widget выполняется и попадает в статус", async () => {
    const status = await telegramStatus(
      {
        botToken: "8659935112:AAEO9JMPWuLJh5VPrx_rWzH5Sak6UU458Co",
        loginWidgetOrigin: "https://fitplan-hub.vercel.app",
      },
      fetchReturning(
        "<html><h1>Telegram Authorization</h1><p>Log in</p></html>",
      ),
    );

    expect(status.loginWidget).toEqual({
      checked: true,
      origin: "https://fitplan-hub.vercel.app",
      ok: true,
    });
  });

  it("токен устарел: getMe падает — ok=false, ошибка в getMe.error", async () => {
    tgApiMock.mockRejectedValueOnce(
      new Error("Telegram getMe: Unauthorized"),
    );

    const status = await telegramStatus({ botToken: "1:OLDSTALE" });

    expect(status.ok).toBe(false);
    expect(status.getMe).toEqual({ ok: false, error: "Telegram getMe: Unauthorized" });
    // getWebhookInfo не вызывали (getMe упал) — повторная попытка не нужна,
    // но и статус не должен упасть: webhook просто пустой.
    expect(status.webhook).toEqual({});
  });
});

describe("checkLoginWidget", () => {
  it("Bot domain invalid → ok=false с подсказкой про BotFather", async () => {
    const result = await checkLoginWidget(
      "https://example.com",
      fetchReturning("<html>Error: Bot domain invalid</html>"),
    );

    expect(result).toEqual({
      checked: true,
      origin: "https://example.com",
      ok: false,
      error: expect.stringContaining("Bot domain invalid"),
    });
  });

  it("страница авторизации → ok=true", async () => {
    const result = await checkLoginWidget(
      "https://fitplan-hub.vercel.app",
      fetchReturning(
        "<html><h1>Telegram Authorization</h1><p>Log in to use your account</p></html>",
      ),
    );

    expect(result).toEqual({ checked: true, origin: "https://fitplan-hub.vercel.app", ok: true });
  });

  it("неожиданный ответ → ok=false, HTTP-статус в ошибке", async () => {
    const result = await checkLoginWidget(
      "https://example.com",
      fetchReturning("<html>Maintenance</html>", 503),
    );

    expect(result.checked).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/503/);
  });

  it("сетевая ошибка → ok=false, без исключения наружу", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("net::ERR_CONNECTION_RESET");
    }) as unknown as typeof fetch;

    const result = await checkLoginWidget("https://example.com", fetchImpl);

    expect(result.checked).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Сетевая ошибка/);
  });
});
