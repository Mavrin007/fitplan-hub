/**
 * Premium-эксперимент: какие платные фичи пользователи пытаются открыть чаще
 * всего. Данные — события paywall_viewed / premium_feature_clicked (пишутся
 * при попытке открыть платную фичу, см. Meals → PremiumDialog). Из разбивки
 * решаем, ЧТО продавать первым (AI-коуч, фото-анализ еды или адаптация
 * тренировок), а не «ставим оплату на всё сразу».
 *
 * Чистая функция без Convex: convex/analytics.ts (getPaywallBreakdown, только
 * для админов) скармливает ей сырые события из таблицы events.
 */

/** Минимальная форма события (как в retention.ts) — только нужные поля. */
export interface PaywallEventRow {
  name: string;
  meta?: Record<string, string | number | boolean>;
}

export interface PaywallFeatureStat {
  feature: string;
  /** Сколько раз показывался paywall именно этой фичи. */
  views: number;
  /** Сколько раз кликнули по фиче/CTA (желание заплатить). */
  clicks: number;
  /** Доля кликов от показов (0..1); null — показов не было. */
  clickRate: number | null;
}

export interface PaywallBreakdown {
  paywallViews: number;
  premiumClicks: number;
  /** Фичи по убыванию кликов (что просят чаще всего). */
  features: PaywallFeatureStat[];
}

/** Группирует paywall-события по фиче. Фичи без «meta.feature» — unknown. */
export function computePaywallBreakdown(
  events: PaywallEventRow[],
): PaywallBreakdown {
  const views = new Map<string, number>();
  const clicks = new Map<string, number>();
  let paywallViews = 0;
  let premiumClicks = 0;

  for (const e of events) {
    const feature =
      typeof e.meta?.feature === "string" ? e.meta.feature : "unknown";
    if (e.name === "paywall_viewed") {
      paywallViews++;
      views.set(feature, (views.get(feature) ?? 0) + 1);
    } else if (e.name === "premium_feature_clicked") {
      premiumClicks++;
      clicks.set(feature, (clicks.get(feature) ?? 0) + 1);
    }
  }

  const features: PaywallFeatureStat[] = [
    ...new Set([...views.keys(), ...clicks.keys()]),
  ]
    .map((feature) => {
      const v = views.get(feature) ?? 0;
      const c = clicks.get(feature) ?? 0;
      return { feature, views: v, clicks: c, clickRate: v > 0 ? c / v : null };
    })
    .sort((a, b) => b.clicks - a.clicks || b.views - a.views);

  return { paywallViews, premiumClicks, features };
}
