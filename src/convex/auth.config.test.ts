/**
 * Смоук-тест `auth.config.ts`: конфиг содержит оба провайдера — собственный
 * domain-провайдер и customJwt для freebuff-токенов. Импорт сам по себе уже
 * исполняет модуль (default export), но проверяем и форму конфига.
 */
import { describe, expect, it } from "vitest";
import authConfig from "./auth.config";

describe("auth.config", () => {
  it("экспортирует конфиг с собственным и customJwt провайдерами", () => {
    expect(authConfig.providers).toHaveLength(2);

    const own = authConfig.providers[0] as {
      domain: string;
      applicationID: string;
    };
    expect(own.domain).toBe(process.env.CONVEX_SITE_URL);
    expect(own.applicationID).toBe("convex");

    const vly = authConfig.providers[1] as {
      type: string;
      issuer: string;
      algorithm: string;
    };
    expect(vly.type).toBe("customJwt");
    expect(vly.issuer).toBe(
      process.env.VLY_CONVEX_AUTH_ISSUER ?? "https://freebuff.com",
    );
    expect(vly.algorithm).toBe("RS256");
  });
});
