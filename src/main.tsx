import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import {
  RootErrorBoundary,
  ToolbarErrorBoundary,
} from "@/components/error-boundaries";
import { sanitizeBeforeSend } from "@/lib/pii";
import * as Sentry from "@sentry/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { MotionConfig } from "framer-motion";
import { StrictMode, useEffect, lazy, Suspense } from "react";
import { initTelegramWebApp } from "./lib/telegram/webApp";

// AssistantChat и VlyToolbar не входят в первый экран (плавающие оверлеи):
// грузим их лениво после первичной отрисовки — это убирает из стартового
// графа чат-UI, иллюстрации и snapdom (LCP/FCP на первом заходе).
const AssistantChat = lazy(() =>
  import("@/components/AssistantChat").then((m) => ({ default: m.AssistantChat })),
);
const VlyToolbar = lazy(() => import("../vly-toolbar-readonly.tsx"));
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
const Privacy = lazy(() => import("./pages/Privacy.tsx"));
const Terms = lazy(() => import("./pages/Terms.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Загрузка…</div>
    </div>
  );
}

// Включается только при заданном VITE_SENTRY_DSN — локальная разработка
// остаётся полностью автономной (ничего не отправляется и не логируется).
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const sentryEnabled = !!SENTRY_DSN;

if (sentryEnabled) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    beforeSend: sanitizeBeforeSend,
  });
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Telegram Mini App: как можно раньше подтверждаем показ и разворачиваем
// WebView на весь экран. Вне Telegram — no-op (см. lib/telegram/webApp.ts).
initTelegramWebApp();

// PWA: сервис-воркер регистрируем только в прод-сборке. В dev он ломал бы
// HMR (кэширование навигаций и /assets), поэтому офлайн-оболочка включена
// только в собранном приложении (vite preview / продакшн).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
      console.warn("[PWA] Service worker registration failed:", err);
    });
  });
}

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
    {/* reducedMotion="user" — framer-motion анимации (появление карточек,
        счётчики, кольца) уважают системную настройку prefers-reduced-motion:
        при включённом уменьшении движения они пропускают анимацию и сразу
        показывают конечное состояние. CSS-анимации (aurora/float) выключены
        в index.css тем же медиа-запросом. */}
    <MotionConfig reducedMotion="user">
      <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <Suspense fallback={null}>
          <VlyToolbar />
        </Suspense>
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />              <Route path="/auth"
                element={<AuthPage redirectAfterAuth="/dashboard" />}
              />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
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
          <Suspense fallback={null}>
            <AssistantChat />
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
      </RootErrorBoundary>
    </MotionConfig>
  </StrictMode>,
);
