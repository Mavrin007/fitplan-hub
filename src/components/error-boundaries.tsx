import * as Sentry from "@sentry/react";
import { TriangleAlert } from "lucide-react";
import React from "react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const sentryEnabled = !!SENTRY_DSN;

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
export class ToolbarErrorBoundary extends React.Component<
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
export class RootErrorBoundary extends React.Component<
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
          <div className="max-w-md w-full text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <TriangleAlert className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mt-4 text-lg font-semibold">Что-то пошло не так</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Произошла непредвиденная ошибка. Перезагрузите страницу — ваши
              данные сохранены в облаке.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Перезагрузить
            </button>
            {(this.state.message || this.state.stack) && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Технические детали
                </summary>
                {this.state.message && (
                  <p className="mt-2 text-xs text-muted-foreground break-words">
                    {this.state.message}
                  </p>
                )}
                {this.state.stack && (
                  <pre className="mt-2 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                    {this.state.stack}
                  </pre>
                )}
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
