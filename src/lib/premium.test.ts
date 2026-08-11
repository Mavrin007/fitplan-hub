import { describe, expect, it } from "vitest";
import {
  canUseFeature,
  PREMIUM_FEATURES,
  PREMIUM_FEATURE_LABELS,
  type PremiumAccess,
} from "./premium";

describe("canUseFeature", () => {
  it("без подписки премиум-фичи недоступны", () => {
    const access: PremiumAccess = { isPremium: false };
    for (const f of PREMIUM_FEATURES) {
      expect(canUseFeature(access, f)).toBe(false);
    }
  });

  it("с подпиской все премиум-фичи доступны", () => {
    const access: PremiumAccess = { isPremium: true };
    for (const f of PREMIUM_FEATURES) {
      expect(canUseFeature(access, f)).toBe(true);
    }
  });

  it("undefined/null (загрузка) трактуется как отсутствие доступа", () => {
    expect(canUseFeature(undefined, "photo_food_analysis")).toBe(false);
    expect(canUseFeature(null, "photo_food_analysis")).toBe(false);
  });

  it("у каждой премиум-фичи есть человекочитаемое название", () => {
    for (const f of PREMIUM_FEATURES) {
      expect(PREMIUM_FEATURE_LABELS[f].length).toBeGreaterThan(0);
    }
  });
});
