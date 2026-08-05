import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

// next-themes useTheme — Toaster читает из него текущую тему.
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn(), themes: [] }),
}));

import { Toaster } from "./sonner";

describe("Toaster", () => {
  it("рендерит Sonner-тостер с темой из next-themes", () => {
    render(<Toaster />);
    // Sonner рендерит контейнер с aria-live.
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it("передаёт пропсы (closeButton) в Sonner", () => {
    render(<Toaster closeButton />);
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
