import { describe, expect, it } from "vitest";
import { computePaywallBreakdown } from "./paywall";

describe("computePaywallBreakdown", () => {
  it("группирует показы и клики по фиче, сортирует по кликам", () => {
    const b = computePaywallBreakdown([
      { name: "paywall_viewed", meta: { feature: "ai_coach" } },
      { name: "paywall_viewed", meta: { feature: "ai_coach" } },
      { name: "premium_feature_clicked", meta: { feature: "ai_coach" } },
      { name: "paywall_viewed", meta: { feature: "photo_food_analysis" } },
      { name: "premium_feature_clicked", meta: { feature: "photo_food_analysis" } },
      { name: "paywall_viewed", meta: { feature: "weekly_ai_analysis" } },
    ]);

    expect(b.paywallViews).toBe(4);
    expect(b.premiumClicks).toBe(2);
    expect(b.features[0]).toMatchObject({ feature: "ai_coach", views: 2, clicks: 1 });
    // Конверсия клика: 1 из 2 показов.
    expect(b.features[0].clickRate).toBeCloseTo(0.5);
    expect(b.features[1]).toMatchObject({
      feature: "photo_food_analysis",
      views: 1,
      clicks: 1,
      clickRate: 1,
    });
    // Фича с показом, но без кликов — в конце, clickRate 0.
    const last = b.features[b.features.length - 1];
    expect(last).toMatchObject({ feature: "weekly_ai_analysis", views: 1, clicks: 0 });
    expect(last.clickRate).toBe(0);
  });

  it("события без meta.feature — в unknown, остальные игнорируются", () => {
    const b = computePaywallBreakdown([
      { name: "paywall_viewed" },
      { name: "premium_feature_clicked" },
      { name: "today_opened" }, // не paywall-событие — не считается
    ]);
    expect(b.paywallViews).toBe(1);
    expect(b.premiumClicks).toBe(1);
    expect(b.features).toEqual([
      { feature: "unknown", views: 1, clicks: 1, clickRate: 1 },
    ]);
  });

  it("пустые события — пустая разбивка", () => {
    const b = computePaywallBreakdown([]);
    expect(b.paywallViews).toBe(0);
    expect(b.premiumClicks).toBe(0);
    expect(b.features).toEqual([]);
  });
});
