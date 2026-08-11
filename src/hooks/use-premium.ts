import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { canUseFeature, type PremiumFeature } from "@/lib/premium";

/**
 * Доступ к Premium-фичам для UI. Единая точка: нигде в компонентах не
 * проверяется «премиум ли пользователь» напрямую — только canUse(feature).
 */
export function usePremium() {
  const access = useQuery(api.premium.getMyAccess);
  return {
    loading: access === undefined,
    isPremium: access?.isPremium === true,
    canUse: (feature: PremiumFeature) => canUseFeature(access, feature),
  };
}
