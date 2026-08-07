/**
 * Юнит-тесты глобального rate-limit записей (src/convex/rateLimit.ts) без
 * Convex-рантайма: consumeRateLimit напрямую на фейковом ctx.db + интеграция
 * через реальный хендлер water.addWater (61-й вызов в минуту отклоняется).
 *
 * Лимиты щедрые, поэтому легитимные сценарии не затрагиваются, но
 * автоматизированный флуд упирается в ConvexError с retryAfterSec.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));

import { getAuthUserId } from "@convex-dev/auth/server";
import { addWater } from "./water";
import { consumeRateLimit, RATE_LIMITS } from "./rateLimit";
import {
  errorMessage,
  makeConvexDb,
  mockAuth,
  type ConvexDbMock,
} from "@/test/convex-db-mock";

/** Опорная точка времени: все вызовы в тесте идут с фиксированным now. */
const T0 = 1_700_000_000_000;

/** ctx как GenericMutationCtx — фейковый db кастуем к ожидаемому типу. */
function fakeCtx(db: ConvexDbMock): Parameters<typeof consumeRateLimit>[0] {
  return { db } as unknown as Parameters<typeof consumeRateLimit>[0];
}

describe("consumeRateLimit — скользящее окно", () => {
  it("пропускает события под лимитом и пишет их в rateLimitEvents", async () => {
    const { db, store } = makeConvexDb();
    const ctx = fakeCtx(db);
    const spec = { limit: 3, windowMs: 60_000 };

    await consumeRateLimit(ctx, "u1:water", spec, T0);
    await consumeRateLimit(ctx, "u1:water", spec, T0 + 1000);

    expect(store.rateLimitEvents).toHaveLength(2);
    expect(store.rateLimitEvents.map((e) => e.key)).toEqual([
      "u1:water",
      "u1:water",
    ]);
  });

  it("при превышении лимита бросает ConvexError с retryAfterSec", async () => {
    const { db } = makeConvexDb();
    const ctx = fakeCtx(db);
    const spec = { limit: 2, windowMs: 60_000 };

    await consumeRateLimit(ctx, "u1:water", spec, T0);
    await consumeRateLimit(ctx, "u1:water", spec, T0 + 1000);

    const message = await errorMessage(() =>
      consumeRateLimit(ctx, "u1:water", spec, T0 + 2000),
    );
    expect(message).toMatch(/Слишком часто/);
    // Старейшее событие (T0) освободится через 60 c — retryAfter ≈ 58 с.
    expect(message).toContain("58");
  });

  it("после сдвига окна блокировка снимается (скользящее окно)", async () => {
    const { db } = makeConvexDb();
    const ctx = fakeCtx(db);
    const spec = { limit: 2, windowMs: 60_000 };

    await consumeRateLimit(ctx, "u1:water", spec, T0);
    await consumeRateLimit(ctx, "u1:water", spec, T0 + 1000);
    // Третий вызов в том же окне — уже лимит (2 события в окне).
    await expect(
      consumeRateLimit(ctx, "u1:water", spec, T0 + 2000),
    ).rejects.toBeInstanceOf(ConvexError);

    // Через минуту самое старое событие уходит из окна — снова можно.
    await expect(
      consumeRateLimit(ctx, "u1:water", spec, T0 + spec.windowMs + 1000),
    ).resolves.toBeUndefined();
  });

  it("подчищает протухшие события — таблица не растёт бесконечно", async () => {
    const { db, store } = makeConvexDb();
    const ctx = fakeCtx(db);
    const spec = { limit: 3, windowMs: 60_000 };

    await consumeRateLimit(ctx, "u1:water", spec, T0);
    await consumeRateLimit(ctx, "u1:water", spec, T0 + 1000);
    // Переход через границу окна: старые события удаляются при записи нового.
    await consumeRateLimit(ctx, "u1:water", spec, T0 + spec.windowMs + 1000);

    const timestamps = store.rateLimitEvents.map((e) => e.timestamp as number);
    expect(timestamps).toEqual([T0 + spec.windowMs + 1000]);
  });

  it("ключи изолированы: лимит одного пользователя не влияет на другого", async () => {
    const { db } = makeConvexDb();
    const ctx = fakeCtx(db);
    const spec = { limit: 2, windowMs: 60_000 };

    await consumeRateLimit(ctx, "u1:water", spec, T0);
    await consumeRateLimit(ctx, "u1:water", spec, T0 + 1000);
    await expect(
      consumeRateLimit(ctx, "u1:water", spec, T0 + 2000),
    ).rejects.toBeInstanceOf(ConvexError);

    // Другой пользователь / операция — не затронут.
    await expect(
      consumeRateLimit(ctx, "u2:water", spec, T0 + 2000),
    ).resolves.toBeUndefined();
  });
});

describe("water.addWater — интеграция с глобальным лимитом", () => {
  const runAddWater = (
    addWater as unknown as {
      _handler: (
        ctx: { db: ConvexDbMock },
        args: { date: string; amountMl: number },
      ) => Promise<unknown>;
    }
  )._handler;

  beforeEach(() => {
    mockAuth(getAuthUserId);
  });

  it("60 вызовов в минуту проходят, 61-й отклоняется", async () => {
    const { db, store } = makeConvexDb();
    const ctx = { db };

    // Уникальные даты: иначе addWater делает upsert одной строки, а не
    // создаёт 60 записей.
    for (let i = 0; i < RATE_LIMITS.water.limit; i++) {
      const day = 1 + i;
      const date = `2026-08-${String(day).padStart(2, "0")}`;
      await runAddWater(ctx, { date, amountMl: 250 });
    }
    expect(store.waterEntries).toHaveLength(RATE_LIMITS.water.limit);
    expect(store.rateLimitEvents).toHaveLength(RATE_LIMITS.water.limit);

    const message = await errorMessage(() =>
      runAddWater(ctx, { date: "2026-09-01", amountMl: 250 }),
    );
    expect(message).toMatch(/Слишком часто/);
    // 61-й вызов не создал ни строку воды, ни новое событие.
    expect(store.waterEntries).toHaveLength(RATE_LIMITS.water.limit);
    expect(store.rateLimitEvents).toHaveLength(RATE_LIMITS.water.limit);
  });
});
