import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ROLES } from "./schema";
import {
  PREMIUM_FEATURES,
  canUseFeature,
  type PremiumAccess,
  type PremiumFeature,
} from "../lib/premium";

/**
 * Единый источник доступа к Premium.
 *
 * Пока платежей нет: isPremium = роль admin (для внутреннего тестирования
 * gating). Когда появится Stripe/ЮKassa, здесь появится проверка подписки —
 * интерфейс getMyAccess не изменится, и UI переделывать не придётся.
 */

/** Серверная проверка: есть ли у пользователя доступ к фиче. */
export async function hasPremiumAccess(
  ctx: { db: { get(id: Id<"users">): Promise<Doc<"users"> | null> } },
  userId: Id<"users">,
): Promise<boolean> {
  const me = await ctx.db.get(userId);
  return me?.role === ROLES.ADMIN;
}

export const getMyAccess = query({
  args: {},
  handler: async (ctx): Promise<PremiumAccess> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { isPremium: false };
    return { isPremium: await hasPremiumAccess(ctx, userId) };
  },
});

export { PREMIUM_FEATURES, canUseFeature, type PremiumFeature };
