/**
 * Premium-архитектура KILO: единый механизм feature gating.
 *
 * Пока оплата не подключена: `isPremium` приходит из `premium.getMyAccess`
 * (сейчас — только роль admin). Когда появится Stripe/ЮKassa, подписка
 * будет управлять этим же флагом, не размазывая `if (premium)` по коду.
 *
 * Правило: UI не проверяет «премиум ли пользователь» напрямую — он
 * спрашивает `canUseFeature(access, key)` с ключом из PREMIUM_FEATURES.
 */

/** Ключи фич, доступных только Premium. */
export const PREMIUM_FEATURES = [
  "ai_coach", // расширенный AI Coach
  "photo_food_analysis", // фото-анализ еды
  "weekly_ai_analysis", // AI-разбор недели
  "advanced_analytics", // расширенная аналитика
  "advanced_adaptation", // продвинутая адаптация тренировок
] as const;

export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];

/** Человекочитаемые названия фич для paywall. */
export const PREMIUM_FEATURE_LABELS: Record<PremiumFeature, string> = {
  ai_coach: "Расширенный AI-коуч",
  photo_food_analysis: "Фото-анализ еды",
  weekly_ai_analysis: "AI-разбор недели",
  advanced_analytics: "Расширенная аналитика",
  advanced_adaptation: "Адаптация тренировок",
};

/** Доступ пользователя к фичам (ответ premium.getMyAccess). */
export interface PremiumAccess {
  /** Есть ли активная подписка (сейчас — роль admin; позже — платежи). */
  isPremium: boolean;
}

/** Проверка доступа к конкретной фиче — единая точка для всего UI. */
export function canUseFeature(
  access: PremiumAccess | null | undefined,
  feature: PremiumFeature,
): boolean {
  if (!PREMIUM_FEATURES.includes(feature)) return true;
  return access?.isPremium === true;
}

/** Список фич, доступных в FREE-плане (для честного описания на paywall). */
export const FREE_FEATURES = [
  "Дневник питания и макросы",
  "Вода и вес",
  "Базовый план тренировок",
  "Базовая статистика",
] as const;
