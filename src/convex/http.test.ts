/**
 * Смоук-тест `http.ts`: модуль собирает httpRouter и регистрирует auth-роуты
 * и вебхук Telegram-бота. auth и convex/server мокаются — проверяем связку,
 * а не сам @convex-dev/auth.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  auth: { addHttpRoutes: vi.fn() },
}));
// Частичный мок convex/server: http.ts импортирует только httpRouter, но через
// ./telegram в граф попадает _generated/server.js, которому нужны и остальные
// экспорты (queryGeneric, mutationGeneric, ...) — их берём из оригинала.
vi.mock("convex/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/server")>();
  return {
    ...actual,
    httpRouter: vi.fn(() => ({ route: vi.fn(), __isMockRouter: true })),
  };
});

import { auth } from "./auth";
import { httpRouter } from "convex/server";
import http from "./http";

describe("http", () => {
  it("создаёт роутер и регистрирует в нём auth-роуты", () => {
    expect(httpRouter).toHaveBeenCalledTimes(1);
    expect(auth.addHttpRoutes).toHaveBeenCalledTimes(1);
  });

  it("регистрирует вебхук Telegram-бота и статус-эндпоинт", () => {
    const router = (httpRouter as ReturnType<typeof vi.fn>).mock.results[0]
      .value as { route: ReturnType<typeof vi.fn> };
    expect(router.route).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/telegram-webhook",
        method: "POST",
      }),
    );
    expect(router.route).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/telegram-status",
        method: "GET",
      }),
    );
    // Ровно два роута: вебхук Telegram + диагностика.
    expect(router.route).toHaveBeenCalledTimes(2);
  });

  it("экспортирует собранный роутер", () => {
    expect(http).toEqual({
      route: expect.any(Function),
      __isMockRouter: true,
    });
  });
});
