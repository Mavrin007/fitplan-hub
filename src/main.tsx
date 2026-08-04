import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { AssistantChat } from "@/components/AssistantChat";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import * as Sentry from "@sentry/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Overview = lazy(() => import("./pages/Overview.tsx"));
const Meals = lazy(() => import("./pages/Meals.tsx"));
const Workouts = lazy(() => import("./pages/Workouts.tsx"));
const Progress = lazy(() => import("./pages/Progress.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Загрузка…</div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
    if (sentryEnabled) Sentry.captureException(err);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
    if (sentryEnabled) Sentry.captureException(err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Ошибка приложения</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const sentryEnabled = !!SENTRY_DSN;

/** Маскирует персональные данные в строках: почты, JWT, длинные токены. */
function redactPii(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "[jwt]",
    )
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[gemini-key]")
    .replace(/\b(?:sk|pk|token|secret)[-_]?[A-Za-z0-9_-]{12,}\b/gi, "[secret]");
}

/** Рекурсивно маскирует почты/токены в объектах произвольной формы. */
function scrubPii(value: unknown, seen = new Set<object>()): unknown {
  if (typeof value === "string") return redactPii(value);
  if (Array.isArray(value)) return value.map((v) => scrubPii(v, seen));
  if (value && typeof value === "object") {
    if (seen.has(value)) return value;
    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) record[key] = scrubPii(record[key], seen);
  }
  return value;
}

/** beforeSend: убираем PII до того, как событие уйдёт в Sentry. */
function sanitizeBeforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  // Пользователь: оставляем только обезличенные поля, без почты/IP/имени.
  if (event.user && typeof event.user === "object") {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(event.user)) {
      if (!["email", "username", "ip_address", "ipAddress"].includes(key)) {
        safe[key] = value;
      }
    }
    event.user = safe as Sentry.User;
  }
  // Заголовки запроса — могут содержать cookie и авторизацию.
  if (event.request?.headers) {
    const headers = event.request.headers as Record<string, string>;
    for (const key of Object.keys(headers)) {
      if (
        ["cookie", "authorization", "x-api-key", "x-goog-api-key"].includes(
          key.toLowerCase(),
        )
      ) {
        delete headers[key];
      }
    }
  }
  // Сообщения, breadcrumbs и extra — маскируем почты и токены.
  if (event.message) event.message = redactPii(event.message);
  // scrubPii мутирует объекты на месте — переприсваивание не нужно.
  if (event.extra) scrubPii(event.extra);
  if (event.contexts) scrubPii(event.contexts);
  if (event.breadcrumbs) {
    for (const breadcrumb of event.breadcrumbs) {
      if (breadcrumb.message) breadcrumb.message = redactPii(breadcrumb.message);
      if (breadcrumb.data) scrubPii(breadcrumb.data);
    }
  }
  return event;
}

// Включается только при заданном VITE_SENTRY_DSN — локальная разработка
// остаётся полностью автономной (ничего не отправляется и не логируется).
if (sentryEnabled) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    beforeSend: sanitizeBeforeSend,
  });
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/dashboard" />}
              />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <Dashboard />
                  </RequireAuth>
                }
              >
                <Route index element={<Overview />} />
                <Route path="meals" element={<Meals />} />
                <Route path="workouts" element={<Workouts />} />
                <Route path="progress" element={<Progress />} />
                <Route path="profile" element={<Profile />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <AssistantChat />
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
