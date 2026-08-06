import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeConvexDb, type ConvexDbState } from "@/test/convex-db-mock";

// Внутренние функции @convex-dev/auth, реализующие лимит попыток ввода кода
// (таблица authRateLimits) и сам мутационный флоу verifyCodeAndSignIn.
// Публичный exports пакета их не отдаёт, поэтому импортируем напрямую из dist
// относительным путём — те же файлы, что исполняет convex dev. Это версионно
// хрупко намеренно: при апгрейде @convex-dev/auth тест упадёт громко и
// напомнит перепроверить порядок веток.
import {
  isSignInRateLimited,
  resetSignInRateLimit,
} from "../../node_modules/@convex-dev/auth/dist/server/implementation/rateLimit.js";
import { verifyCodeAndSignInImpl } from "../../node_modules/@convex-dev/auth/dist/server/implementation/mutations/verifyCodeAndSignIn.js";

// Конфиг из src/convex/auth.ts: signIn.maxFailedAttempsPerHour: 5.
const CONFIG = {
  signIn: { maxFailedAttempsPerHour: 5 },
} as unknown as Parameters<typeof isSignInRateLimited>[2];

/** Фейковый ctx.db, как в остальных convex-тестах. */
function makeCtx() {
  const { db, store } = makeConvexDb();
  // Шпион: считает обращения к таблице кодов. verifyCodeOnly (проверка кода)
  // первым делом делает db.query("authVerificationCodes").byHash — если кода
  // там нет, значит проверка кода реально выполнялась.
  const queryCalls = vi.fn();
  const spyQuery: typeof db.query = (table: string) => {
    if (table === "authVerificationCodes") queryCalls(table);
    return db.query(table);
  };
  // verifyCodeAndSignInImpl на каждом незаблокированном шаге зовёт
  // getAuthSessionId(ctx) → ctx.auth.getUserIdentity(); гостевая попытка
  // без сессии возвращает null.
  const ctx = {
    db: { ...db, query: spyQuery },
    auth: { getUserIdentity: () => Promise.resolve(null) },
  } as unknown as Parameters<typeof verifyCodeAndSignInImpl>[0];
  return { ctx, db, store, queryCalls };
}

/** args для verifyCodeAndSignInImpl, как их собирает библиотечный клиент. */
function args(email: string, code: string) {
  return {
    params: { email, code },
    provider: "email-otp",
    verifier: "test-verifier",
    generateTokens: false,
    allowExtraProviders: true,
  };
}

// getProviderOrThrow: на заблокированной/неудачной попытке библиотека его не
// вызывает (verifyCodeOnly доходит до него только при найденном коде).
const getProviderOrThrow = () => {
  throw new Error("getProviderOrThrow не должен вызываться без найденного кода");
};

function attemptRow(
  db: ConvexDbState["db"],
  identifier: string,
): { attemptsLeft: number } | null {
  const row = db
    .query("authRateLimits")
    .withIndex("identifier", (q) => q.eq("identifier", identifier))
    .unique();
  if (row === null) return null;
  return { attemptsLeft: row.attemptsLeft as number };
}

describe("лимит попыток ввода кода (@convex-dev/auth verifyCodeAndSignInImpl)", () => {
  // Реальный verifyCodeAndSignInImpl логирует неверный код через console.info
  // (INFO "Invalid verification code") — это ожидаемое поведение, не ошибка.
  let infoSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("после 5 неудач 6-я попытка блокируется на isSignInRateLimited: проверка кода не выполняется", async () => {
    const { ctx, db, queryCalls } = makeCtx();

    // 5 неудачных попыток — реальный флоу: rate-limit пропускает, verifyCodeOnly
    // ищет код (обращение к authVerificationCodes), не находит → recordFailedSignIn.
    for (let i = 0; i < 5; i++) {
      const result = await verifyCodeAndSignInImpl(
        ctx,
        args("a@b.c", "000000"),
        getProviderOrThrow,
        CONFIG,
      );
      expect(result).toBeNull();
    }
    // Каждая попытка реально проверяла код (5 обращений к таблице кодов).
    expect(queryCalls).toHaveBeenCalledTimes(5);
    // attemptsLeft < 1 — ввод кода заблокирован.
    const row = attemptRow(db, "a@b.c");
    expect(row).not.toBeNull();
    expect(row!.attemptsLeft).toBeLessThan(1);

    // 6-я попытка: блок ДО проверки кода (WARN + return null) —
    // новых обращений к таблице кодов нет.
    const sixth = await verifyCodeAndSignInImpl(
      ctx,
      args("a@b.c", "000000"),
      getProviderOrThrow,
      CONFIG,
    );
    expect(sixth).toBeNull();
    expect(queryCalls).toHaveBeenCalledTimes(5);

    // attemptsLeft не изменился: recordFailedSignIn на заблокированной
    // попытке не вызывается.
    expect(attemptRow(db, "a@b.c")!.attemptsLeft).toBe(row!.attemptsLeft);
  });

  it("даже ПРАВИЛЬНЫЙ код не проверяется на заблокированной попытке", async () => {
    const { ctx, queryCalls } = makeCtx();

    // Добиваем до блокировки неверными кодами.
    for (let i = 0; i < 5; i++) {
      await verifyCodeAndSignInImpl(
        ctx,
        args("a@b.c", "000000"),
        getProviderOrThrow,
        CONFIG,
      );
    }
    expect(queryCalls).toHaveBeenCalledTimes(5);

    // Правильный код на 6-й попытке: блок до verifyCodeOnly — null, кода
    // «проверка не нашла» — просто не было обращения к таблице кодов.
    const result = await verifyCodeAndSignInImpl(
      ctx,
      args("a@b.c", "635727"),
      getProviderOrThrow,
      CONFIG,
    );
    expect(result).toBeNull();
    expect(queryCalls).toHaveBeenCalledTimes(5);
  });

  it("успешная верификация сбрасывает лимит (resetSignInRateLimit)", async () => {
    const { ctx, db } = makeCtx();

    // Одна неудача — лимит 4/5.
    await verifyCodeAndSignInImpl(
      ctx,
      args("a@b.c", "000000"),
      getProviderOrThrow,
      CONFIG,
    );
    expect(attemptRow(db, "a@b.c")!.attemptsLeft).toBe(4);

    // Успешный вход: resetSignInRateLimit удаляет строку.
    await resetSignInRateLimit(ctx, "a@b.c");
    expect(attemptRow(db, "a@b.c")).toBeNull();

    const blocked = await isSignInRateLimited(ctx, "a@b.c", CONFIG);
    expect(blocked).toBe(false);
  });

  it("email'ы независимы: блокировка одного не блокирует другой", async () => {
    const { ctx, db, queryCalls } = makeCtx();

    // Добиваем a@b.c до блокировки.
    for (let i = 0; i < 5; i++) {
      await verifyCodeAndSignInImpl(
        ctx,
        args("a@b.c", "000000"),
        getProviderOrThrow,
        CONFIG,
      );
    }

    // Другой email не ограничен: проверка кода идёт (обращение к таблице
    // кодов), неверный код → своя строка лимита 4/5.
    const other = await verifyCodeAndSignInImpl(
      ctx,
      args("other@b.c", "000000"),
      getProviderOrThrow,
      CONFIG,
    );
    expect(other).toBeNull();
    expect(queryCalls).toHaveBeenCalledTimes(6);
    expect(attemptRow(db, "a@b.c")!.attemptsLeft).toBeLessThan(1);
    expect(attemptRow(db, "other@b.c")!.attemptsLeft).toBe(4);
  });
});
