import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Мок convex-слоя: useQuery/useMutation из convex-react-mock + useConvexAuth
// (импортируется use-auth из convex/react) и useAuthActions из auth-пакета.
const authActions = vi.hoisted(() => ({
  useConvexAuth: vi.fn(),
  useAuthActions: vi.fn(),
}));
vi.mock("convex/react", async () => {
  const mock = await import("@/test/convex-react-mock");
  return { ...mock, useConvexAuth: authActions.useConvexAuth };
});
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: authActions.useAuthActions,
}));

import { setQuery, api } from "@/test/convex-react-mock";
import { resetConvexMock } from "@/test/convex-react-mock";
import { useAuth } from "./use-auth";

function Harness() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <span data-testid="authed">{String(auth.isAuthenticated)}</span>
      <span data-testid="email">{auth.user?.email ?? "none"}</span>
      <span data-testid="hasSignIn">{typeof auth.signIn}</span>
      <span data-testid="hasSignOut">{typeof auth.signOut}</span>
    </div>
  );
}

describe("useAuth", () => {
  beforeEach(() => {
    resetConvexMock();
    authActions.useConvexAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
    });
    authActions.useAuthActions.mockReturnValue({
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
  });

  it("isLoading=true, пока auth грузится или user не пришёл", () => {
    authActions.useConvexAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
    });
    render(<Harness />);
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
  });

  it("isLoading=true, пока useQuery(users.currentUser) undefined", () => {
    authActions.useConvexAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
    });
    // Не задаём setQuery → user === undefined → loading.
    render(<Harness />);
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
  });

  it("отдаёт пользователя и флаги, когда всё пришло", () => {
    setQuery(api.users.currentUser, undefined, {
      _id: "u1",
      email: "test@example.com",
    });
    render(<Harness />);
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("authed")).toHaveTextContent("true");
    expect(screen.getByTestId("email")).toHaveTextContent("test@example.com");
    expect(screen.getByTestId("hasSignIn")).toHaveTextContent("function");
    expect(screen.getByTestId("hasSignOut")).toHaveTextContent("function");
  });

  it("isAuthenticated=false для анонимного auth-состояния", () => {
    authActions.useConvexAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
    });
    setQuery(api.users.currentUser, undefined, null);
    render(<Harness />);
    expect(screen.getByTestId("authed")).toHaveTextContent("false");
  });
});
