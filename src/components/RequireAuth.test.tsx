import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";

const authState = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: true,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: authState.isLoading,
    isAuthenticated: authState.isAuthenticated,
    user: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

import { RequireAuth } from "./RequireAuth";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <RequireAuth>
              <div>Защищённый контент</div>
            </RequireAuth>
          }
        />
        <Route path="/auth" element={<div>Auth page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireAuth", () => {
  it("показывает спиннер во время загрузки", () => {
    authState.isLoading = true;
    authState.isAuthenticated = true;
    renderAt("/dashboard");
    expect(screen.queryByText("Защищённый контент")).not.toBeInTheDocument();
  });

  it("редиректит на /auth?returnTo= с путём при отсутствии сессии", () => {
    authState.isLoading = false;
    authState.isAuthenticated = false;
    renderAt("/dashboard/meals?tab=1");
    expect(screen.getByText("Auth page")).toBeInTheDocument();
  });

  it("показывает детей для аутентифицированного пользователя", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    renderAt("/dashboard");
    expect(screen.getByText("Защищённый контент")).toBeInTheDocument();
  });
});
