/**
 * Юнит-тесты идемпотентности записи (src/convex/idempotency.ts) на фейковом
 * ctx.db (src/test/convex-db-mock.ts).
 *
 * Проверяем: первый запрос с ключом проходит, повтор с тем же ключом
 * отклоняется; ключ откатывается при сбое тела (честный ретрай возможен);
 * протухшие ключи чистятся; withIdempotency возвращает duplicate без
 * повторного выполнения тела; ошибка дубликата несёт код таксономии.
 */
import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import {
  duplicateError,
  markIdempotencyDone,
  releaseIdempotencyKey,
  tryConsumeIdempotencyKey,
  withIdempotency,
  IDEMPOTENCY_TTL_MS,
} from "./idempotency";
import {
  makeConvexDb,
  type ConvexDbMock,
} from "@/test/convex-db-mock";

/** Минимальный ctx, который ожидает idempotency.ts (только db). Хендлеры
 *  модуля типизированы GenericMutationCtx — приводим через unknown, как и
 *  в остальных unit-тестах без Convex-рантайма. */
type IdemCtx = { db: ConvexDbMock };

const asCtx = (ctx: IdemCtx) => ctx as unknown as Parameters<typeof tryConsumeIdempotencyKey>[0];

function makeCtx(): IdemCtx {
  const { db } = makeConvexDb();
  return { db };
}

// Доступ к таблице через публичный интерфейс мока (query/collect).
async function collectKeys(ctx: IdemCtx, userId: string) {
  return ctx.db
    .query("idempotencyKeys")
    .withIndex("by_user_key", (q: { eq: (f: string, v: unknown) => void }) =>
      q.eq("userId", userId),
    )
    .collect();
}

describe("tryConsumeIdempotencyKey", () => {
  it("новый ключ проходит, повтор с тем же ключом отклоняется", async () => {
    const ctx = makeCtx();
    const first = await tryConsumeIdempotencyKey(asCtx(ctx), "u1", "meal-add:abc");
    expect(first).toBe(true);

    const second = await tryConsumeIdempotencyKey(asCtx(ctx), "u1", "meal-add:abc");
    expect(second).toBe(false);

    // Ключ другого пользователя не пересекается с нашим.
    const other = await tryConsumeIdempotencyKey(asCtx(ctx), "u2", "meal-add:abc");
    expect(other).toBe(true);
  });

  it("ключ уникален в рамках пользователя (userId+key), не только по key", async () => {
    const ctx = makeCtx();
    await tryConsumeIdempotencyKey(asCtx(ctx), "u1", "same");
    // Тот же key, другой userId — проходит.
    expect(await tryConsumeIdempotencyKey(asCtx(ctx), "u2", "same")).toBe(true);
  });

  it("без ключа всегда проходит (обычное выполнение)", async () => {
    const ctx = makeCtx();
    expect(await tryConsumeIdempotencyKey(asCtx(ctx), "u1", undefined)).toBe(true);
    expect(await tryConsumeIdempotencyKey(asCtx(ctx), "u1", undefined)).toBe(true);
  });
});

describe("releaseIdempotencyKey", () => {
  it("откатывает ключ — повтор того же намерения после сбоя проходит", async () => {
    const ctx = makeCtx();
    await tryConsumeIdempotencyKey(asCtx(ctx), "u1", "meal-add:retry");
    await releaseIdempotencyKey(asCtx(ctx), "u1", "meal-add:retry");

    expect(await tryConsumeIdempotencyKey(asCtx(ctx), "u1", "meal-add:retry")).toBe(
      true,
    );
    const keys = await collectKeys(ctx, "u1");
    expect(keys).toHaveLength(1); // только повторно вставленный
  });
});

describe("markIdempotencyDone", () => {
  it("чистит протухшие ключи пользователя, свежие остаются", async () => {
    const { db, store } = makeConvexDb();
    const ctx = { db };
    // Протухший ключ (старше TTL) и свежий.
    store.idempotencyKeys.push({
      _id: "idem:old",
      _creationTime: 0,
      key: "old",
      userId: "u1",
      createdAt: Date.now() - IDEMPOTENCY_TTL_MS - 1000,
    });
    store.idempotencyKeys.push({
      _id: "idem:new",
      _creationTime: 0,
      key: "new",
      userId: "u1",
      createdAt: Date.now(),
    });

    await markIdempotencyDone(asCtx(ctx), "u1", "new");

    const keys = await collectKeys(ctx, "u1");
    expect(keys.map((k) => k.key)).toEqual(["new"]);
  });
});

describe("duplicateError", () => {
  it("бросает ConvexError с кодом DUPLICATE_REQUEST", () => {
    expect(() => duplicateError()).toThrow(ConvexError);
    try {
      duplicateError();
    } catch (err) {
      const data = (err as ConvexError<{ code: string; message: string }>).data;
      expect(data.code).toBe("DUPLICATE_REQUEST");
      expect(data.message).toMatch(/уже обработан/);
    }
  });
});

describe("withIdempotency", () => {
  it("первый вызов выполняет тело, повторный — возвращает duplicate без повторного выполнения", async () => {
    const ctx = makeCtx();
    let runs = 0;
    const body = async () => {
      runs += 1;
      return { id: "entry-1" };
    };

    const first = await withIdempotency(asCtx(ctx), "u1", "key:1", body);
    expect(first).toEqual({ duplicate: false, result: { id: "entry-1" } });

    const second = await withIdempotency(asCtx(ctx), "u1", "key:1", body);
    expect(second).toEqual({ duplicate: true });
    expect(runs).toBe(1); // тело не выполнялось повторно
  });

  it("при сбое тела ключ откатывается и ошибка пробрасывается", async () => {
    const ctx = makeCtx();
    const body = async () => {
      throw new Error("db boom");
    };

    await expect(
      withIdempotency(asCtx(ctx), "u1", "key:2", body),
    ).rejects.toThrow("db boom");
    // После сбоя тот же ключ можно использовать снова (честный ретрай).
    const retry = await withIdempotency(asCtx(ctx), "u1", "key:2", async () => ({
      ok: true,
    }));
    expect(retry).toEqual({ duplicate: false, result: { ok: true } });
  });
});
