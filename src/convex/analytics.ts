import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { ROLES } from "./schema";
import { consumeRateLimit } from "./rateLimit";
import { computeRetentionMetrics } from "../lib/retention";
import { computePaywallBreakdown } from "../lib/paywall";
import { EVENT_NAMES, type EventMeta } from "../lib/analyticsEvents";

/**
 * Минимальная event-модель KILO: таблица `events` (userId + name + ts + meta)
 * и allowlist имён. Никакой внешней аналитической платформы — retention
 * считается чистыми функциями (lib/retention.ts), вызов — только админ.
 *
 * Лимит щедрый (200 событий/час/пользователь): легитимный юзер его не
 * достигает, а вот скрипт-флуд упирается в rateLimitEvents.
 */
export const track = mutation({
  args: {
    name: v.string(),
    meta: v.optional(
      v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
    ),
  },
  handler: async (ctx, { name, meta }) => {
    // Незнакомые имена молча игнорируем: allowlist — единственный источник.
    if (!(EVENT_NAMES as readonly string[]).includes(name)) return;

    const userId = await getAuthUserId(ctx);
    if (userId === null) return; // без сессии событие не пишем

    // Анти-флуд: ошибку лимита не пробрасываем на клиент (аналитика не должна
    // ломать продукт) — просто пропускаем событие.
    try {
      await consumeRateLimit(ctx, `${userId}:track`, {
        limit: 200,
        windowMs: 3_600_000,
      });
    } catch {
      return;
    }

    await ctx.db.insert("events", {
      userId,
      name,
      ts: Date.now(),
      ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
    });
  },
});

const DAY_MS = 86_400_000;

/**
 * Retention-дашборд (DAU/WAU/MAU, активация, когортный D1–D30).
 * Только для администраторов; для расчёта берём события за последние 60 дней
 * (покрывает D30-когорту с запасом).
 */
export const getRetentionMetrics = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({ message: "Войдите, чтобы смотреть метрики." });
    }
    const me = await ctx.db.get(userId);
    if (me?.role !== ROLES.ADMIN) {
      throw new ConvexError({ message: "Метрики доступны только администраторам." });
    }

    const now = Date.now();
    const cutoff = now - 60 * DAY_MS;
    const rows = await ctx.db
      .query("events")
      .withIndex("by_ts", (q) => q.gte("ts", cutoff))
      .collect();

    return computeRetentionMetrics(
      rows.map((r) => ({ userId: r.userId, name: r.name, ts: r.ts })),
      now,
    );
  },
});

/**
 * Premium-эксперимент: какие платные фичи просят чаще всего. Считает показы
 * paywall и клики по фичам за 60 дней и отдаёт разбивку (см. lib/paywall.ts).
 * На этих данных решаем, что продавать первым, — до подключения Stripe/ЮKassa.
 */
export const getPaywallBreakdown = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({ message: "Войдите, чтобы смотреть метрики." });
    }
    const me = await ctx.db.get(userId);
    if (me?.role !== ROLES.ADMIN) {
      throw new ConvexError({ message: "Метрики доступны только администраторам." });
    }

    const now = Date.now();
    const cutoff = now - 60 * DAY_MS;
    const rows = await ctx.db
      .query("events")
      .withIndex("by_ts", (q) => q.gte("ts", cutoff))
      .collect();

    return computePaywallBreakdown(
      rows.map((r) => ({ name: r.name, meta: r.meta })),
    );
  },
});

/** События текущего пользователя (для личной статистики/отладки) — последние 200. */
export const getMyRecentEvents = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);
    return rows.map((r) => ({ name: r.name, ts: r.ts }));
  },
});

export type { EventMeta };
