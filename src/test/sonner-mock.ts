import { vi } from "vitest";

/** Мок тостов sonner. Страницы используют только success/error. */
export const toast = {
  success: vi.fn(),
  error: vi.fn(),
};
