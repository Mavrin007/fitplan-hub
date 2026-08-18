/**
 * Канонический список продуктовых событий KILO (allowlist).
 *
 * Сервер (convex/analytics.ts track) принимает ТОЛЬКО имена из этого списка —
 * это защита от мусора и опечаток. Клиент использует эти же константы.
 *
 * Что НЕ хранится в событиях: email, JWT, медицинские данные. Метаданные
 * события — только простые значения (строки/числа/булевы).
 *
 * События возврата (day_1_return … day_30_return) и подписочные
 * (subscription_started/cancelled) не пишутся отдельно: первое выводится из
 * таблицы чистыми функциями (lib/retention.ts), второе появится вместе с
 * реальными платежами.
 */
export const EVENT_NAMES = [
  // AUTH / LANDING
  "landing_view",
  "signup_started",
  "signup_completed",
  "guest_started",
  "guest_created",
  "account_linked",
  "email_attached",
  // ONBOARDING
  "onboarding_started",
  "onboarding_completed",
  // DAILY
  "today_opened",
  "ring_completed",
  "day_completed",
  // WORKOUT
  "workout_started",
  "workout_completed",
  "workout_plan_generated",
  // NUTRITION
  "meal_added",
  "food_search",
  "first_meal_logged",
  "first_workout_completed",
  "photo_analysis",
  "photo_analysis_confirmed",
  "photo_analysis_edited",
  "photo_analysis_rejected",
  // AI
  "ai_opened",
  "ai_message_sent",
  "ai_quick_action_used",
  "assistant_message",
  "assistant_command_success",
  "assistant_command_rejected",
  "assistant_command_corrected",
  // WEEKLY
  "weekly_review_opened",
  "next_week_plan_viewed",
  // MONETIZATION (UX-подготовка; платежи позже)
  "paywall_viewed",
  "premium_feature_clicked",
  // EMAIL (серверный модуль day1Email пишет событие напрямую, не через track)
  "email_sent",
] as const;

export type AnalyticsEventName = (typeof EVENT_NAMES)[number];

/** Тип метаданных события — только простые значения, без PII. */
export type EventMeta = Record<string, string | number | boolean>;
