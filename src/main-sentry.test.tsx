import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { renderMock, createRootMock, initMock, captureExceptionMock } =
  vi.hoisted(() => {
    const renderMock = vi.fn();
    return {
      renderMock,
      createRootMock: vi.fn(() => ({ render: renderMock })),
      initMock: vi.fn(),
      captureExceptionMock: vi.fn(),
    };
  });

vi.mock("react-dom/client", () => ({
  createRoot: createRootMock,
}));
vi.mock("@sentry/react", () => ({
  init: initMock,
  captureException: captureExceptionMock,
}));
vi.mock("convex/react", () => ({
  ConvexReactClient: class {
    __mockClient = true;
  },
}));
vi.mock("@convex-dev/auth/react", () => ({
  ConvexAuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-provider">{children}</div>
  ),
}));
vi.mock("../vly-toolbar-readonly.tsx", () => ({
  VlyToolbar: () => <div data-testid="vly-toolbar" />,
}));
vi.mock("@/components/AssistantChat", () => ({
  AssistantChat: () => <div data-testid="assistant-chat" />,
}));
vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => <div data-testid="toaster" />,
}));
vi.mock("./pages/Landing", () => ({ default: () => <div /> }));
vi.mock("./pages/Auth", () => ({ default: () => <div /> }));
vi.mock("./pages/Dashboard", () => ({ default: () => <div /> }));
vi.mock("./pages/Overview", () => ({ default: () => <div /> }));
vi.mock("./pages/Meals", () => ({ default: () => <div /> }));
vi.mock("./pages/Workouts", () => ({ default: () => <div /> }));
vi.mock("./pages/Progress", () => ({ default: () => <div /> }));
vi.mock("./pages/Profile", () => ({ default: () => <div /> }));
vi.mock("./pages/NotFound", () => ({ default: () => <div /> }));

import { RootErrorBoundary, ToolbarErrorBoundary } from "./main";

/** Дочерний компонент, который падает при рендере — провоцирует boundary. */
function Bomb({ message }: { message?: string }): React.ReactNode {
  throw new Error(message ?? "boom");
}

// React логирует ошибки boundary в console.error — глушим, чтобы не засорять.
vi.spyOn(console, "error").mockImplementation(() => {});

describe("Error boundaries main.tsx", () => {
  it("Sentry не инициализируется и не вызывается без VITE_SENTRY_DSN", async () => {
    // VITE_SENTRY_DSN в тестовом окружении не задан — init не должен зваться.
    await import("./main");
    expect(initMock).not.toHaveBeenCalled();
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it("RootErrorBoundary ловит падение, показывает сообщение и стек", () => {
    render(
      <RootErrorBoundary>
        <Bomb />
      </RootErrorBoundary>,
    );
    expect(screen.getByText("Ошибка приложения")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    // jsdom-ошибки имеют стек → блок <pre> отрисовывается.
    expect(document.querySelector("pre")).not.toBeNull();
    // Sentry выключен — событие никуда не уходит.
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("RootErrorBoundary: пустое сообщение подставляет фолбэк", () => {
    render(
      <RootErrorBoundary>
        <Bomb message="" />
      </RootErrorBoundary>,
    );
    // error.message = "" → фолбэк «Unknown runtime error».
    expect(screen.getByText("Unknown runtime error")).toBeInTheDocument();
  });

  it("RootErrorBoundary без ошибки рендерит детей", () => {
    const { container } = render(
      <RootErrorBoundary>
        <div data-testid="child" />
      </RootErrorBoundary>,
    );
    expect(container.querySelector('[data-testid="child"]')).not.toBeNull();
  });

  it("ToolbarErrorBoundary молча гасит падение (null)", () => {
    render(
      <ToolbarErrorBoundary>
        <Bomb />
      </ToolbarErrorBoundary>,
    );
    // Падение поглощено — наружу ничего не отрендерилось.
    expect(document.body.textContent ?? "").not.toContain("boom");
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("ToolbarErrorBoundary без ошибки рендерит детей", () => {
    const { container } = render(
      <ToolbarErrorBoundary>
        <div data-testid="child2" />
      </ToolbarErrorBoundary>,
    );
    expect(container.querySelector('[data-testid="child2"]')).not.toBeNull();
  });
});
