import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL не подключает auto-cleanup, когда vitest работает без globals.
afterEach(() => {
  cleanup();
});

// jsdom не реализует часть браузерных API, которые нужны UI-компонентам.
// matchMedia — используется framer-motion (prefers-reduced-motion) и хуками тем.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

// ResizeObserver — нужен recharts и некоторым обёрткам графиков.
if (typeof ResizeObserver === "undefined") {
  window.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

// IntersectionObserver — framer-motion (useInView/whileInView на Landing)
// использует его в mount-эффектах; без стаба компонент падает.
if (typeof IntersectionObserver === "undefined") {
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    class {
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds: number[] = [];
      constructor(
        callback: IntersectionObserverCallback,
        _options?: IntersectionObserverInit,
      ) {
        void _options; // опции не нужны — всё сразу «в зоне видимости»
        // Сразу «в зоне видимости», чтобы анимации whileInView стартовали.
        callback(
          [] as IntersectionObserverEntry[],
          this as unknown as IntersectionObserver,
        );
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    };
}

// requestAnimationFrame — для framer-motion анимаций (CountUp и т.п.).
if (typeof window.requestAnimationFrame !== "function") {
  window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0)) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id)) as typeof window.cancelAnimationFrame;
}

// scrollIntoView — вызывается Radix-диалогами и прокручиваемыми списками.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (typeof window.scrollTo !== "function") {
  window.scrollTo = () => {};
}

// URL.createObjectURL/revokeObjectURL — нужны экспорту CSV (lib/export.ts)
// и загрузкам; в jsdom отсутствуют.
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:mock";
  URL.revokeObjectURL = () => {};
}

// elementFromPoint — вызывается input-otp в фоновом таймере (fake caret);
// в jsdom отсутствует, стабим возвратом null (как для точки вне документа).
if (typeof document.elementFromPoint !== "function") {
  document.elementFromPoint = (() => null) as typeof document.elementFromPoint;
}

// PointerEvent — на него опираются user-event и Radix-компоненты.
if (typeof window.PointerEvent === "undefined") {
  window.PointerEvent = window.MouseEvent as unknown as typeof PointerEvent;
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
