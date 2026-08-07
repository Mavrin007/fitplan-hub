/**
 * Юнит-тесты лимитов ИИ-ассистента (src/convex/assistantLimits.ts) без
 * Convex-рантайма: общий фейковый ctx.db (src/test/convex-db-mock.ts),
 * хендлеры дёргаются напрямую (`_handler`).
 *
 * Проверяем серверную защиту: дневная квота сообщений (DAILY_MESSAGE_LIMIT),
 * дневная квота токенов (DAILY_TOKEN_LIMIT), минимальный интервал между
 * сообщениями (MIN_MESSAGE_INTERVAL_MS), сброс счётчика на новый день,
 * ошибки с кодом (assistant_limit_reached / assistant_token_limit_reached /
 * assistant_rate_limited) для понятного UI, env-оверрайды лимитов и чтение
 * остатка getMyLimit.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));

import { getAuthUserId } from "@convex-dev/auth/server";
import { todayKey, addDays, toDateKey } from "../lib/dates";
import {
  checkAndConsume,
  getMyLimit,
  dailyMessageLimit,
  dailyTokenLimit,
  minMessageIntervalMs,
  LIMIT_REACHED,
  TOKEN_LIMIT_REACHED,
  RATE_LIMITED,
} from "./assistantLimits";
import {
  AUTH_USER_ID,
  errorMessage,
  makeConvexDb,
  mockAuth,
  type ConvexDbMock,
  type ConvexDoc,
} from "@/test/convex-db-mock";

type ConsumeResult = {
  used: number;
  remaining: number;
  tokensUsed: number;
  tokensRemaining: number;
  retryAfterSec: number;
};

const runConsume = (
  checkAndConsume as unknown as {
    _handler: (
      ctx: { db: ConvexDbMock },
      args: { userId: unknown; estimatedTokens: number },
    ) => Promise<ConsumeResult>;
  }
)._handler;
const runGetLimit = (
  getMyLimit as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: Record<string, never>) => Promise<{
      used: number;
      limit: number;
      remaining: number;
      tokensUsed: number;
      tokenLimit: number;
      tokensRemaining: number;
    } | null>;
  }
)._handler;

/** Базовый прогон: 1 сообщение ≈ ~5k токенов (типичный запрос к ассистенту). */
function consumeOne(db: ConvexDbMock, tokens = 5_000) {
  return runConsume({ db }, { userId: AUTH_USER_ID, estimatedTokens: tokens });
}

function limitDoc(
  id: string,
  userId: unknown,
  day: string,
  count: number,
  lastMessageAt: number,
  totalTokens?: number,
): ConvexDoc {
  // totalTokens опускаем, если не передан — так тесты могут воспроизвести
  // «старую» строку до введения учёта токенов (мягкая миграция).
  return totalTokens === undefined
    ? { _id: id, _creationTime: 0, userId, day, count, lastMessageAt }
    : { _id: id, _creationTime: 0, userId, day, count, totalTokens, lastMessageAt };
}

describe("checkAndConsume — дневная квота сообщений и интервал", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
    vi.unstubAllEnvs();
  });

  it("первое сообщение дня создаёт строку с count=1 и totalTokens", async () => {
    const { db, store } = makeConvexDb();
    const res = await consumeOne(db);
    expect(res.used).toBe(1);
    expect(res.remaining).toBe(dailyMessageLimit() - 1);
    expect(res.tokensUsed).toBe(5_000);
    expect(store.assistantLimits).toHaveLength(1);
    expect(store.assistantLimits[0]).toMatchObject({
      userId: AUTH_USER_ID,
      count: 1,
      totalTokens: 5_000,
    });
  });

  it("последовательные сообщения наращивают count и totalTokens", async () => {
    const day = todayKey();
    const { db, store } = makeConvexDb({
      assistantLimits: [limitDoc("l1", AUTH_USER_ID, day, 1, 0, 4_000)],
    });
    const second = await consumeOne(db, 6_000);
    expect(second.used).toBe(2);
    expect(second.tokensUsed).toBe(10_000);
    expect(store.assistantLimits[0]).toMatchObject({ count: 2, totalTokens: 10_000 });
  });

  it("блокирует сообщения чаще MIN_MESSAGE_INTERVAL_MS (анти-спам)", async () => {
    const recent = Date.now();
    const { db } = makeConvexDb({
      assistantLimits: [limitDoc("l1", AUTH_USER_ID, todayKey(), 1, recent)],
    });
    const msg = await errorMessage(() => consumeOne(db));
    expect(msg).toMatch(/Слишком быстро/);
  });

  it("ошибка анти-спама несёт код RATE_LIMITED и retryAfterSec", async () => {
    const recent = Date.now();
    const { db } = makeConvexDb({
      assistantLimits: [limitDoc("l1", AUTH_USER_ID, todayKey(), 1, recent)],
    });
    const err = await consumeOne(db).then(
      () => null,
      (e: unknown) => e as { data: { code: string; retryAfterSec: number } },
    );
    expect(err).not.toBeNull();
    expect(err!.data.code).toBe(RATE_LIMITED);
    expect(err!.data.retryAfterSec).toBeGreaterThan(0);
  });

  it("после истечения интервала сообщение проходит", async () => {
    const old = Date.now() - minMessageIntervalMs() - 1000;
    const { db, store } = makeConvexDb({
      assistantLimits: [limitDoc("l1", AUTH_USER_ID, todayKey(), 1, old)],
    });
    const res = await consumeOne(db);
    expect(res.used).toBe(2);
    expect(store.assistantLimits[0].count).toBe(2);
  });

  it("исчерпанная дневная квота сообщений блокирует с кодом LIMIT_REACHED", async () => {
    const { db } = makeConvexDb({
      assistantLimits: [
        limitDoc("l1", AUTH_USER_ID, todayKey(), dailyMessageLimit(), 0),
      ],
    });
    const err = await consumeOne(db).then(
      () => null,
      (e: unknown) => e as { data: { code: string; remaining: number } },
    );
    expect(err).not.toBeNull();
    expect(err!.data.code).toBe(LIMIT_REACHED);
    expect(err!.data.remaining).toBe(0);
  });

  it("на границе квоты сообщений (limit-1) сообщение ещё проходит", async () => {
    const { db } = makeConvexDb({
      assistantLimits: [
        limitDoc("l1", AUTH_USER_ID, todayKey(), dailyMessageLimit() - 1, 0),
      ],
    });
    const res = await consumeOne(db);
    expect(res.used).toBe(dailyMessageLimit());
    expect(res.remaining).toBe(0);
  });

  it("новый день сбрасывает счётчик (строка создаётся заново)", async () => {
    // Прошлая строка — вчера; сегодняшнего дня нет → insert с count=1.
    const yesterday = toDateKey(addDays(new Date(), -1));
    const { db, store } = makeConvexDb({
      assistantLimits: [
        limitDoc("l1", AUTH_USER_ID, yesterday, dailyMessageLimit(), 0),
      ],
    });
    const res = await consumeOne(db);
    expect(res.used).toBe(1);
    expect(store.assistantLimits).toHaveLength(2);
    expect(store.assistantLimits[0].count).toBe(dailyMessageLimit());
    expect(store.assistantLimits[1].count).toBe(1);
  });
});

describe("checkAndConsume — дневная квота токенов", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
    vi.unstubAllEnvs();
  });

  it("накопленный расход сверх лимита блокирует с кодом TOKEN_LIMIT_REACHED", async () => {
    const { db } = makeConvexDb({
      assistantLimits: [
        limitDoc("l1", AUTH_USER_ID, todayKey(), 1, 0, dailyTokenLimit() - 500),
      ],
    });
    const err = await consumeOne(db, 1000).then(
      () => null,
      (e: unknown) => e as { data: { code: string; remaining: number } },
    );
    expect(err).not.toBeNull();
    expect(err!.data.code).toBe(TOKEN_LIMIT_REACHED);
    expect(err!.data.remaining).toBe(0);
  });

  it("в пределах токен-лимита сообщение проходит и токены накапливаются", async () => {
    const { db } = makeConvexDb({
      assistantLimits: [
        limitDoc("l1", AUTH_USER_ID, todayKey(), 1, 0, dailyTokenLimit() - 10_000),
      ],
    });
    const res = await consumeOne(db, 9_000);
    expect(res.tokensUsed).toBe(dailyTokenLimit() - 1000);
    expect(res.tokensRemaining).toBe(1000);
  });

  it("квота токенов проверяется раньше квоты сообщений", async () => {
    // Сообщений ещё много (count=5), но токенов почти не осталось.
    const { db } = makeConvexDb({
      assistantLimits: [
        limitDoc("l1", AUTH_USER_ID, todayKey(), 5, 0, dailyTokenLimit() - 100),
      ],
    });
    const err = await consumeOne(db, 200).then(
      () => null,
      (e: unknown) => e as { data: { code: string } },
    );
    expect(err).not.toBeNull();
    expect(err!.data.code).toBe(TOKEN_LIMIT_REACHED);
  });

  it("старая строка без totalTokens (мягкая миграция) читается как 0", async () => {
    const day = todayKey();
    const { db, store } = makeConvexDb({
      assistantLimits: [limitDoc("l1", AUTH_USER_ID, day, 1, 0)],
    });
    // Фикстура НЕ содержит ключ totalTokens (как документ, созданный до
    // введения учёта токенов) — код должен взять ?? 0 и не упасть.
    expect(store.assistantLimits[0]).not.toHaveProperty("totalTokens");
    const res = await consumeOne(db, 3_000);
    expect(res.tokensUsed).toBe(3_000);
    // При следующем обращении строка патчится — поле появляется (ленивая
    // миграция прямо в write-пути).
    expect(store.assistantLimits[0].totalTokens).toBe(3_000);
  });

  it("первое сообщение дня с запросом больше токен-лимита отклоняется", async () => {
    const { db, store } = makeConvexDb();
    const err = await runConsume(
      { db },
      { userId: AUTH_USER_ID, estimatedTokens: dailyTokenLimit() + 1 },
    ).then(
      () => null,
      (e: unknown) => e as { data: { code: string } },
    );
    expect(err).not.toBeNull();
    expect(err!.data.code).toBe(TOKEN_LIMIT_REACHED);
    // Строка не создана — ничего не списано.
    expect(store.assistantLimits).toHaveLength(0);
  });
});

describe("checkAndConsume — env-настройка лимитов", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
    vi.unstubAllEnvs();
  });

  it("ASSISTANT_DAILY_MESSAGE_LIMIT переопределяет квоту сообщений", async () => {
    vi.stubEnv("ASSISTANT_DAILY_MESSAGE_LIMIT", "3");
    const { db } = makeConvexDb({
      assistantLimits: [limitDoc("l1", AUTH_USER_ID, todayKey(), 3, 0)],
    });
    const err = await consumeOne(db).then(
      () => null,
      (e: unknown) => e as { data: { code: string } },
    );
    expect(err).not.toBeNull();
    expect(err!.data.code).toBe(LIMIT_REACHED);
  });

  it("ASSISTANT_DAILY_TOKEN_LIMIT переопределяет квоту токенов", async () => {
    vi.stubEnv("ASSISTANT_DAILY_TOKEN_LIMIT", "10000");
    const { db } = makeConvexDb({
      assistantLimits: [
        limitDoc("l1", AUTH_USER_ID, todayKey(), 1, 0, 9_500),
      ],
    });
    const err = await consumeOne(db, 1000).then(
      () => null,
      (e: unknown) => e as { data: { code: string } },
    );
    expect(err).not.toBeNull();
    expect(err!.data.code).toBe(TOKEN_LIMIT_REACHED);
  });

  it("невалидное env-значение откатывается к дефолту", () => {
    vi.stubEnv("ASSISTANT_DAILY_MESSAGE_LIMIT", "abc");
    expect(dailyMessageLimit()).toBe(30);
    vi.stubEnv("ASSISTANT_DAILY_TOKEN_LIMIT", "-5");
    expect(dailyTokenLimit()).toBe(150_000);
    vi.stubEnv("ASSISTANT_MIN_INTERVAL_MS", "0");
    expect(minMessageIntervalMs()).toBe(2000);
  });
});

describe("getMyLimit — остаток для UI", () => {
  beforeEach(() => {
    mockAuth(getAuthUserId);
    vi.unstubAllEnvs();
  });

  it("без сессии возвращает null", async () => {
    mockAuth(getAuthUserId, "anonymous");
    const { db } = makeConvexDb();
    await expect(runGetLimit({ db }, {})).resolves.toBeNull();
  });

  it("без записей сегодня — полный лимит", async () => {
    const { db } = makeConvexDb();
    const res = await runGetLimit({ db }, {});
    expect(res).toEqual({
      used: 0,
      limit: dailyMessageLimit(),
      remaining: dailyMessageLimit(),
      tokensUsed: 0,
      tokenLimit: dailyTokenLimit(),
      tokensRemaining: dailyTokenLimit(),
    });
  });

  it("считает только сегодняшнюю строку (чужие/чужие дни не влияют)", async () => {
    const day = todayKey();
    const yesterday = toDateKey(addDays(new Date(), -1));
    const { db } = makeConvexDb({
      assistantLimits: [
        limitDoc("l1", AUTH_USER_ID, day, 5, 0, 25_000),
        limitDoc("l2", AUTH_USER_ID, yesterday, 20, 0, 100_000),
        limitDoc("l3", "other-user", day, 10, 0, 50_000),
      ],
    });
    const res = await runGetLimit({ db }, {});
    expect(res).toEqual({
      used: 5,
      limit: dailyMessageLimit(),
      remaining: dailyMessageLimit() - 5,
      tokensUsed: 25_000,
      tokenLimit: dailyTokenLimit(),
      tokensRemaining: dailyTokenLimit() - 25_000,
    });
  });

  it("остаток не уходит в минус при перерасходе", async () => {
    const { db } = makeConvexDb({
      assistantLimits: [
        limitDoc("l1", AUTH_USER_ID, todayKey(), 99, 0, 999_999),
      ],
    });
    const res = await runGetLimit({ db }, {});
    expect(res!.remaining).toBe(0);
    expect(res!.tokensRemaining).toBe(0);
  });
});
