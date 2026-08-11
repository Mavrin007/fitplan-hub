/**
 * Retention-метрики KILO — чистые функции без Convex.
 *
 * События приходят из таблицы `events` (одно событие = одна строка:
 * userId + имя + ts). Из них вычисляются продуктовые метрики для
 * внутреннего дашборда — без внешней аналитической платформы.
 *
 * Определение активации (зафиксировано здесь, единый источник):
 *   пользователь СЧИТАЕТСЯ активированным, если у него есть событие
 *   onboarding_completed И хотя бы одно «полезное действие»:
 *   workout_completed | meal_added | day_completed.
 *
 * Retention считается когортно по первому дню активности пользователя:
 *   Dn = (пользователи с событиями в день 0 и в день 0+n)
 *        / (пользователи, чей день 0+n уже наступил).
 */

/** Одна строка события из таблицы events (минимальная форма для расчётов). */
export interface AnalyticsEvent {
  userId: string;
  name: string;
  ts: number;
}

/** Имена событий, которые считаются «полезными действиями» для активации. */
export const ACTIVATION_ACTIONS = [
  "workout_completed",
  "meal_added",
  "day_completed",
] as const;

/** День (YYYY-MM-DD, UTC — события пишутся с серверным ts) по времени события. */
export function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** День +n от даты-ключа (UTC). */
export function addDaysToKey(key: string, days: number): string {
  const dt = new Date(`${key}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Активен ли пользователь: есть событие onboarding_completed + полезное действие. */
export function isActivated(events: AnalyticsEvent[], userId: string): boolean {
  const names = new Set(
    events.filter((e) => e.userId === userId).map((e) => e.name),
  );
  if (!names.has("onboarding_completed")) return false;
  return ACTIVATION_ACTIONS.some((a) => names.has(a));
}

export interface RetentionMetrics {
  /** Уникальных пользователей с событием за последние 24ч / 7д / 30д. */
  dau: number;
  wau: number;
  mau: number;
  /** Доля активированных среди всех, у кого есть события (включая гостей). */
  activationRate: number;
  /** Абсолютные числа по активации. */
  activated: number;
  totalUsers: number;
  /** Когортный retention: D1/D3/D7/D14/D30. null — когорта ещё не созрела. */
  retention: {
    d1: number | null;
    d3: number | null;
    d7: number | null;
    d14: number | null;
    d30: number | null;
  };
  /** ГЛАВНЫЙ KPI KILO: из активированных пользователей, чей день 0+7 уже
   *  наступил, какая доля вернулась на 7-й день. null — когорта не созрела. */
  activatedD7: number | null;
}

const DAY_MS = 86_400_000;
const RETENTION_OFFSETS = [1, 3, 7, 14, 30] as const;

/**
 * Считает retention-метрики по сырым событиям.
 * `now` — момент «сейчас» (мс), передаётся извне для детерминизма в тестах.
 */
export function computeRetentionMetrics(
  events: AnalyticsEvent[],
  now: number,
): RetentionMetrics {
  const distinct = new Set(events.map((e) => e.userId));
  const users = [...distinct];

  const dau = new Set(
    events.filter((e) => e.ts > now - DAY_MS).map((e) => e.userId),
  ).size;
  const wau = new Set(
    events.filter((e) => e.ts > now - 7 * DAY_MS).map((e) => e.userId),
  ).size;
  const mau = new Set(
    events.filter((e) => e.ts > now - 30 * DAY_MS).map((e) => e.userId),
  ).size;

  const activatedUsers = users.filter((u) => isActivated(events, u));
  const activated = activatedUsers.length;
  const activationRate = users.length > 0 ? activated / users.length : 0;

  // Первый день активности каждого пользователя.
  const firstDayByUser = new Map<string, string>();
  for (const e of events) {
    const key = dayKey(e.ts);
    const cur = firstDayByUser.get(e.userId);
    if (cur === undefined || key < cur) firstDayByUser.set(e.userId, key);
  }
  const today = dayKey(now);

  // Дни активности пользователей (для быстрого поиска возврата) — считаем один
  // раз, переиспользуем для всех когорт и для KPI activated→D7.
  const activeDaysByUser = new Map<string, Set<string>>();
  for (const e of events) {
    const key = dayKey(e.ts);
    let days = activeDaysByUser.get(e.userId);
    if (!days) {
      days = new Set();
      activeDaysByUser.set(e.userId, days);
    }
    days.add(key);
  }

  const retention: RetentionMetrics["retention"] = {
    d1: null,
    d3: null,
    d7: null,
    d14: null,
    d30: null,
  };

  for (const offset of RETENTION_OFFSETS) {
    let mature = 0;
    let returned = 0;
    for (const u of users) {
      const start = firstDayByUser.get(u);
      if (!start) continue;
      const target = addDaysToKey(start, offset);
      if (target > today) continue; // когорта ещё не созрела
      mature++;
      if (activeDaysByUser.get(u)?.has(target)) returned++;
    }
    retention[`d${offset}` as keyof typeof retention] =
      mature > 0 ? returned / mature : null;
  }

  // Главный KPI: активация → возврат на 7-й день. Отличается от общего D7
  // тем, что в знаменателе только АКТИВИРОВАННЫЕ пользователи (прошли
  // онбординг и сделали первое полезное действие) — это и есть «продукт
  // стал привычкой», а не «гость случайно открыл дважды».
  let activatedMature = 0;
  let activatedReturned = 0;
  for (const u of activatedUsers) {
    const start = firstDayByUser.get(u);
    if (!start) continue;
    const target = addDaysToKey(start, 7);
    if (target > today) continue;
    activatedMature++;
    if (activeDaysByUser.get(u)?.has(target)) activatedReturned++;
  }

  return {
    dau,
    wau,
    mau,
    activationRate,
    activated,
    totalUsers: users.length,
    retention,
    activatedD7: activatedMature > 0 ? activatedReturned / activatedMature : null,
  };
}
