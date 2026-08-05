import { describe, expect, it, vi } from "vitest";

// vi.hoisted — фабрика vi.mock исполняется раньше const-импортов в модуле,
// поэтому мок-функцию нужно поднять над фабрикой.
const { createVlyIntegrationsMock } = vi.hoisted(() => ({
  createVlyIntegrationsMock: vi.fn((config: { deploymentToken: string }) => ({
    deploymentToken: config.deploymentToken,
  })),
}));
vi.mock("@vly-ai/integrations", () => ({
  createVlyIntegrations: (config: { deploymentToken: string }) =>
    createVlyIntegrationsMock(config),
}));

describe("vly-integrations", () => {
  it("создаёт клиент с deploymentToken из VLY_INTEGRATION_KEY", async () => {
    vi.stubEnv("VLY_INTEGRATION_KEY", "test-key-123");

    // Модуль исполняется при импорте (side-effect: создание клиента) —
    // импортируем динамически, чтобы env был уже задан.
    const { vly } = await import("./vly-integrations");

    expect(createVlyIntegrationsMock).toHaveBeenCalledWith(
      expect.objectContaining({ deploymentToken: "test-key-123" }),
    );
    // vly — реальный объект VlyIntegrations; проверяем через каст, поле
    // deploymentToken не входит в публичный тип пакета.
    expect((vly as unknown as { deploymentToken: string }).deploymentToken).toBe(
      "test-key-123",
    );

    vi.unstubAllEnvs();
  });
});
