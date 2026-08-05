import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { ArrowRight, Loader2, Mail, ShieldAlert } from "lucide-react";

/** Официальная 4-цветная эмблема Google (встроенный SVG — без внешних иконок). */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
import { Suspense, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

// Convex-клиент держит WebSocket-подключение с ретраями: если бэкенд
// недоступен (не задан VITE_CONVEX_URL, сервер не запущен), signIn() никогда
// не резолвится и не падает — кнопка зависла бы в loading навсегда.
// Ограничиваем ожидание, чтобы пользователь увидел ошибку, а не вечный спиннер.
const AUTH_TIMEOUT_MS = 15000;

function withAuthTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Сервер не отвечает. Проверьте подключение и повторите попытку."));
    }, AUTH_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dev-only: локальный бэкенд перехватывает OTP-коды (VLY_EMAIL_DEV_CAPTURE)
  // и мы показываем их прямо в форме вместо письма. Хук вызывается всегда
  // (null args = Convex skip-query вне OTP-шага или при выключенном флаге).
  const devOtpCode = useQuery(
    api.devOtp.getByEmail,
    import.meta.env.VITE_EMAIL_DEV_CAPTURE === "1" && step !== "signIn"
      ? { email: step.email }
      : "skip",
  );

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await withAuthTimeout(signIn("email-otp", formData));
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось отправить код подтверждения. Попробуйте ещё раз.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await withAuthTimeout(signIn("email-otp", formData));
      navigate(redirect);
    } catch (error) {
      console.error("OTP verification error:", error);
      setError("Введённый код подтверждения неверен.");
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await withAuthTimeout(signIn("anonymous"));
      navigate(redirect);
    } catch (error) {
      console.error("Guest login error:", error);
      setError(
        `Не удалось войти как гость: ${
          error instanceof Error ? error.message : "Неизвестная ошибка"
        }`,
      );
      setIsLoading(false);
    }
  };

  // OAuth-флоу: signIn("google") возвращает redirect-URL (на /api/auth/signin/google),
  // и клиент @convex-dev/auth/react сам уводит браузер туда, а после возврата
  // с ?code= завершает вход автоматически. Здесь ждём только сам ответ
  // сервера (15s), чтобы показать ошибку, если бэкенд недоступен.
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // redirectTo уходит в OAuth-флоу (cookie → callback → ?code= на фронт),
      // чтобы после входа пользователь попал на запрошенную страницу, а не
      // на корень сайта.
      await withAuthTimeout(signIn("google", { redirectTo: redirect }));
      // Не navigate: браузер уже уходит на страницу Google; после возврата
      // ?code= — вход завершает клиент auth, и useEffect ниже редиректит.
    } catch (error) {
      console.error("Google sign-in error:", error);
      setError(
        `Не удалось войти через Google: ${
          error instanceof Error ? error.message : "Неизвестная ошибка"
        }`,
      );
      setIsLoading(false);
    }
  };

  const isOtp = step !== "signIn";

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Декор в стиле лендинга: тонкая сетка + мягкое свечение */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-grid mask-fade-b opacity-70" />
        <div className="absolute left-1/2 top-[-12rem] h-96 w-96 -translate-x-1/2 rounded-full bg-foreground/[0.04] blur-3xl" />
      </div>

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold tracking-[0.28em] uppercase">
            Кило
          </span>
          <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
            ®
          </span>
        </Link>
        <Link
          to="/"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          На главную
        </Link>
      </header>

      <div className="relative flex flex-1 items-center justify-center px-6 pb-16">
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={isOtp ? "otp" : "signIn"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              <div className="text-center">
                <p className="label-overline text-muted-foreground">
                  {isOtp ? "Подтверждение" : "Начать"}
                </p>
                <h1 className="m3-headline-small mt-3">
                  {isOtp ? "Проверьте почту" : "Вход в Кило"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {isOtp
                    ? `Мы отправили код на ${step.email}.`
                    : "Введите email, чтобы войти или создать аккаунт."}
                </p>
              </div>

              <div className="mt-8">
                {!isOtp ? (
                  <form onSubmit={handleEmailSubmit} className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        name="email"
                        placeholder="name@example.com"
                        type="email"
                        className="h-11 pl-10"
                        disabled={isLoading}
                        required
                      />
                    </div>
                    {error && <p className="text-xs text-destructive">{error}</p>}
                    <Button
                      type="submit"
                      className="h-11 w-full"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          Продолжить
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>

                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Или
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full"
                      onClick={handleGoogleLogin}
                      disabled={isLoading}
                    >
                      <GoogleIcon className="size-4" />
                      Войти через Google
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 w-full text-muted-foreground hover:text-foreground"
                      onClick={handleGuestLogin}
                      disabled={isLoading}
                    >
                      Продолжить как гость
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleOtpSubmit} className="space-y-5">
                    <input type="hidden" name="email" value={step.email} />
                    <input type="hidden" name="code" value={otp} />
                    <div className="flex justify-center">
                      <InputOTP
                        value={otp}
                        onChange={setOtp}
                        maxLength={6}
                        disabled={isLoading}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                            const form = (e.target as HTMLElement).closest("form");
                            if (form) form.requestSubmit();
                          }
                        }}
                      >
                        <InputOTPGroup>
                          {Array.from({ length: 6 }).map((_, index) => (
                            <InputOTPSlot key={index} index={index} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    {devOtpCode && (
                      <div className="rounded-lg border border-brand/40 bg-brand/10 p-3 text-center">
                        <p className="flex items-center justify-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-brand">
                          <ShieldAlert className="size-3.5" />
                          Dev-режим: код без письма
                        </p>
                        <p className="num mt-1 font-mono text-2xl font-semibold tracking-[0.35em] text-foreground">
                          {devOtpCode}
                        </p>
                      </div>
                    )}
                    {error && (
                      <p className="text-center text-xs text-destructive">{error}</p>
                    )}
                    <Button
                      type="submit"
                      className="h-11 w-full"
                      disabled={isLoading || otp.length !== 6}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Проверяем…
                        </>
                      ) : (
                        <>
                          Подтвердить код
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                    <div className="text-center text-xs text-muted-foreground">
                      Не получили код?{" "}
                      <button
                        type="button"
                        onClick={() => setStep("signIn")}
                        className="underline underline-offset-4 hover:text-foreground"
                      >
                        Попробовать снова
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          <p className="mt-8 text-center text-[11px] text-muted-foreground">
            Безопасность обеспечивает{" "}
            <a
              href="https://freebuff.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              freebuff.com
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
