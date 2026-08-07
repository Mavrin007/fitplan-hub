import { ConvexError, v } from "convex/values";
import type { AnyDataModel, GenericMutationCtx } from "convex/server";
import { internalMutation } from "./_generated/server";

/**
 * Глобальный rate-limit мутаций записи (анти-флуд) поверх таблицы
 * rateLimitEvents: скользящее окно на ключ (обычно "<userId>:<операция>").
 *
 * AI-ассистент лимитируется отдельно (assistantLimits.ts — дневная квота
 * сообщений/токенов + минимальный интервал); здесь — обычные мутации, чтобы
 * скрипт не мог заливать базу тысячами записей.
 *
 * Все лимиты щедрые: легитимный пользователь их не достигает, а вот
 * автоматизированный флуд упирается в понятную ошибку с retryAfterSec.
 */
export interface RateLimitSpec {
  /** Максимум событий в окне. */
  limit: number;
  /** Длина окна (мс). */
  windowMs: number;
}

export const RATE_LIMITS = {
  /** Вода: добавка стакана раз в секунду — уже подозрительно. */
  water: { limit: 60, windowMs: 60_000 },
  /** Дневник: одна запись в секунду — перебор. */
  mealEntry: { limit: 60, windowMs: 60_000 },
  /** Массовое добавление из плана — редкое действие. */
  mealBulk: { limit: 6, windowMs: 60_000 },
  /** Вес: перезапись каждые 2 секунды — нелегитимно. */
  weight: { limit: 30, windowMs: 60_000 },
  /** Свои продукты. */
  food: { limit: 30, windowMs: 60_000 },
  /** Лог тренировки. */
  workoutLog: { limit: 10, windowMs: 60_000 },
  /** Пересборка плана. */
  savePlan: { limit: 6, windowMs: 60_000 },
  /** Распознавание фото еды: 5 запросов в час — дорогой внешний вызов. */
  photo: { limit: 5, windowMs: 3_600_000 },
} as const satisfies Record<string, RateLimitSpec>;

/** Строка события лимита: только поля, нужные для подсчёта. */
interface RateLimitEventRow {
  _id: string;
  timestamp: number;
}

/** q-объект диапазонного индекса (eq/gte/lte) — как в реальном Convex. */
interface RateLimitRangeQ {
  eq(field: string, value: unknown): RateLimitRangeQ;
  gte(field: string, value: unknown): RateLimitRangeQ;
  lte(field: string, value: unknown): RateLimitRangeQ;
}

/** Минимальный db, достаточный для подсчёта событий лимита. */
interface RateLimitDb {
  query(table: string): {
    withIndex(name: string, fn: (q: RateLimitRangeQ) => void): {
      collect(): Promise<RateLimitEventRow[]>;
    };
  };
  insert(table: string, doc: { key: string; timestamp: number }): string;
  delete(id: unknown): void;
}

/**
 * Проверяет лимит ключа и при превышении бросает ConvexError с
 * retryAfterSec; иначе записывает событие и подчищает протухшие.
 *
 * Типизация: GenericMutationCtx<AnyDataModel> не знает конкретных таблиц
 * (SystemIndexes пуст), поэтому доступ к rateLimitEvents идёт через локальный
 * структурный каст — это работает при любом состоянии сгенерированных типов
 * и в тестах (фейковый ctx.db).
 */
export async function consumeRateLimit(
  ctx: GenericMutationCtx<AnyDataModel>,
  key: string,
  spec: RateLimitSpec,
  now: number = Date.now(),
): Promise<void> {
  const db = ctx.db as unknown as RateLimitDb;
  const cutoff = now - spec.windowMs;

  const recent = await db
    .query("rateLimitEvents")
    .withIndex("by_key_timestamp", (q) =>
      q.eq("key", key).gte("timestamp", cutoff),
    )
    .collect();

  if (recent.length >= spec.limit) {
    // Старейшее событие окна — по нему считаем, когда освободится место.
    const oldest = recent.reduce((min, e) => Math.min(min, e.timestamp), now);
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + spec.windowMs - now) / 1000),
    );
    throw new ConvexError({
      message: `Слишком часто. Попробуйте через ${retryAfterSec} сек.`,
      retryAfterSec,
    });
  }

  await db.insert("rateLimitEvents", { key, timestamp: now });

  // Подчищаем протухшие события ключа: в окне их не больше лимита, поэтому
  // таблица не растёт бесконечно (удаляем только за пределами окна).
  const expired = await db
    .query("rateLimitEvents")
    .withIndex("by_key_timestamp", (q) =>
      q.eq("key", key).lte("timestamp", cutoff),
    )
    .collect();
  for (const row of expired) {
    await db.delete(row._id);
  }
}

/**
 * Обёртка для actions: у action нет ctx.db, поэтому лимит списывается через
 * internal-мутацию. Используется photo.analyzeMealPhoto (и любым будущим
 * action, который хочет глобальный rate-limit).
 */
export const consumeRateLimitAction = internalMutation({
  args: {
    key: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, { key, limit, windowMs }) => {
    await consumeRateLimit(ctx, key, { limit, windowMs });
  },
});
