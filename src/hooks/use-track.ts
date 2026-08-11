import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { AnalyticsEventName, EventMeta } from "@/lib/analyticsEvents";

/**
 * Отправка продуктового события — «огонь и забыл»: аналитика не должна
 * ломать или замедлять продукт, поэтому ошибки молча игнорируются.
 */
export function useTrack() {
  const track = useMutation(api.analytics.track);
  return useCallback(
    (name: AnalyticsEventName, meta?: EventMeta) => {
      void track({ name, meta }).catch(() => {});
    },
    [track],
  );
}
