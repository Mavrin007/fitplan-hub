import { describe, expect, it, vi, beforeEach } from "vitest";

import { makeConvexDb, type ConvexDbState } from "@/test/convex-db-mock";
import {
  MAX_FAILED_ATTEMPTS_PER_HOUR,
  OTP_RESEND_INTERVAL_MS,
  canAttempt,
  canSend,
  checkAndRecord,
} from "./otpRateLimit";

// Та же техника, что в water/activity тестах: берём _handler напрямую,
// обходя обёртку internalMutation (каст всего объекта, как в water.test.ts).
type RateHandler = (
  ctx: { db: ConvexDbState["db"] },
  args: { email: string },
) => Promise<{ allowed: boolean; retryAfterSec: number }>;

const runCheck = (
  checkAndRecord as unknown as {
    _handler: RateHandler;
  }
)._handler;

function seedRow(db: ConvexDbState["db"], email: string, lastSentAt: number) {
  const id = db.insert("otpRateLimits", { email, lastSentAt });
  return id;
}

describe("otpRateLimit.checkAndRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("первая отправка разрешена и записывает время", async () => {
    const { db, store } = makeConvexDb();

    const result = await runCheck({ db }, { email: "a@b.c" });

    expect(result).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(store.otpRateLimits).toHaveLength(1);
    const row = store.otpRateLimits[0]!;
    expect(row.email).toBe("a@b.c");
    expect(typeof row.lastSentAt).toBe("number");
  });

  it("повторная отправка раньше 60с отклонена с retryAfterSec", async () => {
    const { db } = makeConvexDb();
    const now = Date.now();
    seedRow(db, "a@b.c", now);

    const result = await runCheck({ db }, { email: "a@b.c" });

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBeGreaterThan(0);
    expect(result.retryAfterSec).toBeLessThanOrEqual(
      Math.ceil(OTP_RESEND_INTERVAL_MS / 1000),
    );
  });

  it("ровно через 60 секунд отправка снова разрешена и время обновляется", async () => {
    const { db, store } = makeConvexDb();
    const now = Date.now();
    const id = seedRow(db, "a@b.c", now - OTP_RESEND_INTERVAL_MS);

    const result = await runCheck({ db }, { email: "a@b.c" });

    expect(result).toEqual({ allowed: true, retryAfterSec: 0 });
    // Тот же документ, обновлённое время.
    const row = store.otpRateLimits.find((r) => r._id === id);
    expect(row).toBeDefined();
    expect(row!.lastSentAt).toBeGreaterThanOrEqual(now);
  });

  it("email'ы независимы: отклонение одного не влияет на другой", async () => {
    const { db } = makeConvexDb();
    const now = Date.now();
    seedRow(db, "a@b.c", now);

    const blocked = await runCheck({ db }, { email: "a@b.c" });
    const fresh = await runCheck({ db }, { email: "other@b.c" });

    expect(blocked.allowed).toBe(false);
    expect(fresh.allowed).toBe(true);
  });
});

type AttemptHandler = (
  ctx: { db: ConvexDbState["db"] },
  args: { email: string },
) => Promise<{
  allowed: boolean;
  retryAfterSec: number;
  attemptsLeft: number;
}>;

const runCanAttempt = (
  canAttempt as unknown as {
    _handler: AttemptHandler;
  }
)._handler;

function seedAttemptRow(
  db: ConvexDbState["db"],
  identifier: string,
  attemptsLeft: number,
  lastAttemptTime: number,
) {
  return db.insert("authRateLimits", { identifier, attemptsLeft, lastAttemptTime });
}

type CanSendHandler = (
  ctx: { db: ConvexDbState["db"] },
  args: { email: string },
) => Promise<{ allowed: boolean; retryAfterSec: number }>;

const runCanSend = (
  canSend as unknown as {
    _handler: CanSendHandler;
  }
)._handler;

describe("otpRateLimit.canSend — read-only пред-проверка перед signIn", () => {
  it("без записи лимита отправка разрешена (retryAfterSec = 0)", async () => {
    const { db } = makeConvexDb();
    const res = await runCanSend({ db }, { email: "a@b.c" });
    expect(res).toEqual({ allowed: true, retryAfterSec: 0 });
  });

  it("в пределах 60-секундного окна отправка отклонена с остатком", async () => {
    const { db } = makeConvexDb();
    const now = Date.now();
    // Отправили 10 секунд назад → ждать ещё ~50 сек.
    seedRow(db, "a@b.c", now - 10 * 1000);
    const res = await runCanSend({ db }, { email: "a@b.c" });
    expect(res.allowed).toBe(false);
    expect(res.retryAfterSec).toBeGreaterThan(0);
    expect(res.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("после 60 секунд отправка снова разрешена", async () => {
    const { db } = makeConvexDb();
    seedRow(db, "a@b.c", Date.now() - OTP_RESEND_INTERVAL_MS);
    const res = await runCanSend({ db }, { email: "a@b.c" });
    expect(res).toEqual({ allowed: true, retryAfterSec: 0 });
  });

  it("read-only: не создаёт и не меняет записи лимита", async () => {
    const { db, store } = makeConvexDb();
    await runCanSend({ db }, { email: "a@b.c" });
    expect(store.otpRateLimits).toHaveLength(0);
  });
});

describe("otpRateLimit.canAttempt — прокси лимита попыток библиотеки", () => {
  it("без записей лимита ввод кода разрешён (полный запас попыток)", async () => {
    const { db } = makeConvexDb();
    const res = await runCanAttempt({ db }, { email: "a@b.c" });
    expect(res.allowed).toBe(true);
    expect(res.retryAfterSec).toBe(0);
    expect(res.attemptsLeft).toBe(MAX_FAILED_ATTEMPTS_PER_HOUR);
  });

  it("attemptsLeft >= 1 разрешает ввод (даже если не весь запас)", async () => {
    const { db } = makeConvexDb();
    seedAttemptRow(db, "a@b.c", 2, Date.now());
    const res = await runCanAttempt({ db }, { email: "a@b.c" });
    expect(res.allowed).toBe(true);
  });

  it("attemptsLeft < 1 блокирует ввод с расчётным retryAfterSec", async () => {
    const { db } = makeConvexDb();
    seedAttemptRow(db, "a@b.c", 0, Date.now());
    const res = await runCanAttempt({ db }, { email: "a@b.c" });
    expect(res.allowed).toBe(false);
    // До следующей попытки: (1 - 0) попыток / (5 на час) = 720 секунд.
    expect(res.retryAfterSec).toBe(720);
    expect(res.attemptsLeft).toBeLessThan(1);
  });

  it("попытки линейно восстанавливаются: после часа снова разрешено", async () => {
    const { db } = makeConvexDb();
    // attemptsLeft=0, но прошёл час — запас восстановился до максимума.
    seedAttemptRow(db, "a@b.c", 0, Date.now() - 60 * 60 * 1000);
    const res = await runCanAttempt({ db }, { email: "a@b.c" });
    expect(res.allowed).toBe(true);
    expect(res.attemptsLeft).toBe(MAX_FAILED_ATTEMPTS_PER_HOUR);
  });

  it("частичное восстановление: 12 минут назад — попытка ещё не вернулась", async () => {
    const { db } = makeConvexDb();
    // Refill 5/час = 1 попытка за 12 минут; 12 минут назад вернулась ровно 1.
    seedAttemptRow(db, "a@b.c", 0, Date.now() - 12 * 60 * 1000);
    const res = await runCanAttempt({ db }, { email: "a@b.c" });
    expect(res.allowed).toBe(true);
    expect(res.attemptsLeft).toBeCloseTo(1, 5);
  });

  it("email'ы независимы: блокировка одного не трогает другой", async () => {
    const { db } = makeConvexDb();
    seedAttemptRow(db, "a@b.c", 0, Date.now());
    const blocked = await runCanAttempt({ db }, { email: "a@b.c" });
    const fresh = await runCanAttempt({ db }, { email: "other@b.c" });
    expect(blocked.allowed).toBe(false);
    expect(fresh.allowed).toBe(true);
  });
});
