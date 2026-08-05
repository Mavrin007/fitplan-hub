/**
 * Смоук-тест `http.ts`: модуль собирает httpRouter и регистрирует auth-роуты.
 * auth и convex/server мокаются — проверяем связку, а не сам @convex-dev/auth.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  auth: { addHttpRoutes: vi.fn() },
}));
vi.mock("convex/server", () => ({
  httpRouter: vi.fn(() => ({ __isMockRouter: true })),
}));

import { auth } from "./auth";
import { httpRouter } from "convex/server";
import http from "./http";

describe("http", () => {
  it("создаёт роутер и регистрирует в нём auth-роуты", () => {
    expect(http).toEqual({ __isMockRouter: true });
    expect(httpRouter).toHaveBeenCalledTimes(1);
    expect(auth.addHttpRoutes).toHaveBeenCalledWith({ __isMockRouter: true });
  });
});
