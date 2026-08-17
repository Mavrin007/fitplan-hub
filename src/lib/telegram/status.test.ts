/**
 * Тесты src/lib/telegram/status.ts: диагностика конфигурации без сети.
 * tgApi мокается — проверяем сборку статуса и что секреты наружу не уходят.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ tgApi: vi.fn() }));

import { tgApi } from "./api";
import { telegramStatus } from "./status";

const tgApiMock = vi.mocked(tgApi);

describe("telegramStatus", () => {
  it("токен не задан: ok=false, getMe с ошибкой, без вызовов Bot API", async () => {
    const status = await telegramStatus({});

    expect(status.ok).toBe(false);
    expect(status.token).toEqual({ configured: false, prefix: null, length: null });
    expect(status.getMe.ok).toBe(false);
    expect(status.getMe.error).toMatch(/не задан/);
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
