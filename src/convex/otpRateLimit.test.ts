import { describe, expect, it, vi, beforeEach } from "vitest";

import { makeConvexDb, type ConvexDbState } from "@/test/convex-db-mock";
import { OTP_RESEND_INTERVAL_MS, checkAndRecord } from "./otpRateLimit";

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
