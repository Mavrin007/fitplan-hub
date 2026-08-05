import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useIsMobile } from "./use-mobile";

function Harness() {
  return <div data-testid="mobile">{String(useIsMobile())}</div>;
}

/** Контролируемый matchMedia: matches из handler + регистрация listener'ов. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches,
    media: "(max-width: 767px)",
    onchange: null,
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return { mql, listeners };
}

describe("useIsMobile", () => {
  it("desktop: innerWidth ≥ 768 → false", () => {
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      configurable: true,
    });
    stubMatchMedia(false);
    render(<Harness />);
    expect(screen.getByTestId("mobile")).toHaveTextContent("false");
  });

  it("mobile: innerWidth < 768 → true", () => {
    Object.defineProperty(window, "innerWidth", {
      value: 375,
      configurable: true,
    });
    stubMatchMedia(true);
    render(<Harness />);
    expect(screen.getByTestId("mobile")).toHaveTextContent("true");
  });

  it("реагирует на change-событие matchMedia (смена ориентации)", () => {
    Object.defineProperty(window, "innerWidth", {
      value: 375,
      configurable: true,
    });
    const { listeners } = stubMatchMedia(true);
    render(<Harness />);
    expect(screen.getByTestId("mobile")).toHaveTextContent("true");

    // «Повернули» на десктоп: change → пересчёт по innerWidth.
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      configurable: true,
    });
    act(() => {
      listeners.forEach((cb) => cb());
    });
    expect(screen.getByTestId("mobile")).toHaveTextContent("false");
  });
});
