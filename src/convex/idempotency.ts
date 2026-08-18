import { v } from "convex/values";
import type { AnyDataModel, GenericMutationCtx } from "convex/server";
import { internalMutation } from "./_generated/server";
import { ErrorCode, appError } from "./errors";

/**
 * Идемпотентность критических мутаций записи.
 *
 * Проблема: повтор одного запроса (двойной клик, сетевой ретрай, ретрай
 * клиента после таймаута) не должен создавать дубликат записи — особенно в
 * дневнике (еда/вода/тренировки) и для команд ассистента.
 *
 * Паттерн: вызывающий передаёт `idempotencyKey` (клиент генерирует его на
 * одно «намерение»: один клик = один ключ). Мутация вызывает
 * `consumeIdempotencyKey(ctx, userId, key)`, и если такой ключ уже был
 * обработан — бросает DUPLICATE_REQUEST (или возвращает результат, см.
 * `tryConsumeIdempotencyKey`). При успешном выполнении тела мутации ключ
 * помечается выполненным; при сбое тела ключ удаляется, чтобы честный
 * ретрай (повтор того же намерения) мог пройти.
 *
 * Ограничение: Convex не имеет уникальных индексов, поэтому гонка двух
 * ОДНОВРЕМЕННЫХ запросов с одним ключом теоретически может пройти дважды.
 * На практике UI уже блокирует двойной клик (addingRef), а Telegram
 * защищён отдельно (telegramProcessedUpdates по update_id) — этот модуль
 * закрывает ретраи и повторную отправку с тем же ключом.
 *
 * Чистка: ключи старше 7 дней удаляются при следующем обращении (по 50 за
 * раз), таблица не растёт бесконечно.
 */

export const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** q-объект диапазонного индекса (как в rateLimit.ts) — методы возвращают
 *  сами себя для цепочек eq().lte(). */
interface IdemQ {
  eq(field: string, value: unknown): IdemQ;
  lte(field: string, value: unknown): IdemQ;
}

/** Минимальный db, достаточный для работы с idempotencyKeys. */
interface IdemDb {
  query(table: string): {
    withIndex(
      name: string,
      fn: (q: IdemQ) => void,
    ): {
      first(): Promise<{ _id: string } | null>;
      collect(): Promise<Array<{ _id: string }>>;
    };
  };
  insert(table: string, doc: { key: string; userId: string; createdAt: number }): string;
  delete(id: unknown): void;
}

/**
 * Проверяет/регистрирует idempotency-ключ ПЕРЕД выполнением тела мутации.
 *
 * Возвращает true, если ключ новый (тело можно выполнять); false + бросок
 * не происходит — вызывающий сам решает, как сообщить о дубликате
 * (обычно через `duplicateError()`). После успешного выполнения тела
 * вызовите `markIdempotencyDone(ctx, userId, key)`.
 */
export async function tryConsumeIdempotencyKey(
  ctx: GenericMutationCtx<AnyDataModel>,
  userId: string,
  key: string | undefined,
): Promise<boolean> {
  if (!key) return true; // без ключа — обычное выполнение
  const db = ctx.db as unknown as IdemDb;
  const existing = await db
    .query("idempotencyKeys")
    .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
    .first();
  if (existing) return false;
  await db.insert("idempotencyKeys", {
    key,
    userId,
    createdAt: Date.now(),
  });
  return true;
}

/** Помечает ключ выполненным (вызывается после успешного тела мутации). */
export async function markIdempotencyDone(
  ctx: GenericMutationCtx<AnyDataModel>,
  userId: string,
  key: string | undefined,
): Promise<void> {
  if (!key) return;
  const db = ctx.db as unknown as IdemDb;
  const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
  // Ключ уже вставлен в tryConsumeIdempotencyKey — отдельная пометка не
  // нужна; здесь только чистим протухшие ключи пользователя.
  const expired = await db
    .query("idempotencyKeys")
    .withIndex("by_user_key", (q) =>
      q.eq("userId", userId).lte("createdAt", cutoff),
    )
    .collect();
  for (const row of expired) {
    await db.delete(row._id);
  }
}

/**
 * Откатывает ключ при сбое тела мутации (честный ретрай того же намерения
 * должен пройти). Вызывайте в catch/finally при ошибке выполнения.
 */
export async function releaseIdempotencyKey(
  ctx: GenericMutationCtx<AnyDataModel>,
  userId: string,
  key: string | undefined,
): Promise<void> {
  if (!key) return;
  const db = ctx.db as unknown as IdemDb;
  const existing = await db
    .query("idempotencyKeys")
    .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
    .first();
  if (existing) await db.delete(existing._id);
}

/** Стандартная ошибка дубликата с кодом таксономии. */
export function duplicateError(): never {
  return appError(
    ErrorCode.DUPLICATE_REQUEST,
    "Запрос уже обработан — повторная запись отменена.",
  );
}

/**
 * Сквозная обёртка: проверяет ключ, выполняет `body`, при успехе помечает
 * ключ выполненным, при сбое — откатывает и пробрасывает ошибку.
 * Используется мутациями, где дубликат просто «пропускается» без ошибки:
 * вернуть `{ duplicate: true }`, чтобы клиент мог показать «уже записано».
 */
export async function withIdempotency<T>(
  ctx: GenericMutationCtx<AnyDataModel>,
  userId: string,
  key: string | undefined,
  body: () => Promise<T>,
): Promise<{ duplicate: true } | { duplicate: false; result: T }> {
  const fresh = await tryConsumeIdempotencyKey(ctx, userId, key);
  if (!fresh) return { duplicate: true };
  try {
    const result = await body();
    await markIdempotencyDone(ctx, userId, key);
    return { duplicate: false, result };
  } catch (err) {
    await releaseIdempotencyKey(ctx, userId, key);
    throw err;
  }
}

/** Internal-мутация для actions (у action нет ctx.db): аналогично
 *  tryConsumeIdempotencyKey, но атомарно для одного ключа. */
export const consumeIdempotencyAction = internalMutation({
  args: { userId: v.string(), key: v.string() },
  handler: async (ctx, { userId, key }) => {
    return tryConsumeIdempotencyKey(ctx, userId, key);
  },
});
