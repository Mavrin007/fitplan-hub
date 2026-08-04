import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { render } from "@testing-library/react";
import { resetConvexMock } from "@/test/convex-react-mock";
import { toast } from "@/test/sonner-mock";

// Мок тостов sonner (см. vi.mock("sonner", () => import("@/test/sonner-mock"))
// в тестах). Импортируется отсюда, чтобы страницы не тянули sonner-mock напрямую.
export { toast };
export { toast as toastMock };

/** Рендер страницы внутри MemoryRouter (страницы используют Link/useNavigate). */
export function renderWithRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

/** Сброс состояния между тестами: convex-мок и тосты. */
export function resetMocks(): void {
  resetConvexMock();
  toast.success.mockClear();
  toast.error.mockClear();
}
