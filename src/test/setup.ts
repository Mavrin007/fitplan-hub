import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL не подключает auto-cleanup, когда vitest работает без globals.
afterEach(() => {
  cleanup();
});

// jsdom не реализует часть браузерных API, которые нужны UI-компонентам.
if (typeof window !== "undefined") {
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
}
