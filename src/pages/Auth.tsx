import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { FitnessHero } from "@/components/illustrations";
import {
  ArrowRight,
  Loader2,
  Mail,
  Lock,
  CheckCircle,
} from "lucide-react";
import { Suspense, useState } from "react";
import { useConvexAuth } from "convex/react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";

type AuthStep =
  | "email"
  | "signUp"
  | "signIn"
  | "resetRequest"
  | "resetVerify";

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

const AUTH_TIMEOUT_MS = 15000;

function withAuthTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          "Сервер не отвечает. Проверьте подключение и повторите попытку.",
        ),
      );
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

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("Invalid credentials"))
      return "Неверный email или пароль.";
    if (msg.includes("already exists"))
      return "Аккаунт с таким email уже существует.";
    if (msg.includes("Password must be at least"))
      return "Пароль должен содержать минимум 8 символов.";
    if (msg.includes("Password is required")) return "Введите пароль.";
    if (msg.includes("Email is required")) return "Введите email.";
    if (msg.includes("Invalid email")) return "Некорректный формат email.";
    return msg;
  }
  return "Произошла ошибка. Попробуйте ещё раз.";
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { signIn } = useAuth();
  const { isLoading: isConvexAuthLoading, isAuthenticated } = useConvexAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Redirect if already authenticated
  if (!isConvexAuthLoading && isAuthenticated) {
    navigate(redirect);
    return null;
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setSuccess(null);

    // Try sign in first — if it fails with Invalid credentials, show both options
    try {
      setIsLoading(true);
      // We can't check existence without a password, so show both forms
      setStep("signIn");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password || password.length < 8) {
      setError("Пароль должен содержать минимум 8 символов.");
      return;
    }
    try {
      setIsLoading(true);
      await withAuthTimeout(
        signIn("password", {
          flow: "signUp",
          email: email.trim(),
          password,
        }),
      );
      navigate(redirect);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError("Введите пароль.");
      return;
    }
    try {
      setIsLoading(true);
      await withAuthTimeout(
        signIn("password", {
          flow: "signIn",
          email: email.trim(),
          password,
        }),
      );
      navigate(redirect);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      setIsLoading(true);
      await withAuthTimeout(
        signIn("password", {
          flow: "reset",
          email: email.trim(),
        }),
      );
      setSuccess(
        "Письмо с кодом для сброса пароля отправлено. Проверьте почту.",
      );
      setStep("resetVerify");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!resetCode || !newPassword) {
      setError("Введите код и новый пароль.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Новый пароль должен содержать минимум 8 символов.");
      return;
    }
    try {
      setIsLoading(true);
      await withAuthTimeout(
        signIn("password", {
          flow: "reset-verification",
          email: email.trim(),
          code: resetCode,
          newPassword,
        }),
      );
      navigate(redirect);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const isOtp = step === "resetVerify";

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Background decoration */}
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
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              <div className="text-center">
                <FitnessHero className="mx-auto h-20 w-28" />
                <p className="label-overline mt-2 text-muted-foreground">
                  {isOtp
                    ? "Восстановление"
                    : step === "email"
                      ? "Первый запуск"
                      : step === "signUp"
                        ? "Создать аккаунт"
                        : step === "resetRequest"
                          ? "Сброс пароля"
                          : "Вход"}
                </p>
                <h1 className="m3-headline-small mt-3">
                  {isOtp
                    ? "Новый пароль"
                    : step === "email"
                      ? "FITPLAN"
                      : step === "signUp"
                        ? "Создайте аккаунт"
                        : step === "resetRequest"
                          ? "Восстановление"
                          : "Вход в Кило"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {step === "email" && (
                    <>
                      Создайте аккаунт и сохраняй
                      <br />
                      свой прогресс между устройствами
                    </>
                  )}
                  {step === "signUp" &&
                    "Укажите пароль для вашего аккаунта."}
                  {step === "signIn" && "Введите пароль для входа."}
                  {step === "resetRequest" &&
                    "Укажите email для получения кода сброса."}
                  {isOtp &&
                    `Код отправлен на ${email}. Введите код и новый пароль.`}
                </p>
              </div>

              <div className="mt-8">
                {/* Step: Email input */}
                {step === "email" && (
                  <form onSubmit={handleEmailSubmit} className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="name@example.com"
                        type="email"
                        aria-label="Электронная почта"
                        className="h-11 pl-10"
                        disabled={isLoading}
                        required
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    {error && (
                      <p className="text-xs text-destructive">{error}</p>
                    )}
                    <Button
                      type="submit"
                      className="h-11 w-full"
                      disabled={isLoading || !email.trim()}
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
                  </form>
                )}

                {/* Step: Sign Up */}
                {step === "signUp" && (
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      {email}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Минимум 8 символов"
                        type="password"
                        aria-label="Пароль"
                        className="h-11 pl-10"
                        disabled={isLoading}
                        required
                        autoFocus
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    {error && (
                      <p className="text-xs text-destructive">{error}</p>
                    )}
                    <Button
                      type="submit"
                      className="h-11 w-full"
                      disabled={isLoading || !password || password.length < 8}
                    >
                      {isLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          Создать аккаунт
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                    <div className="text-center text-xs text-muted-foreground">
                      Уже есть аккаунт?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setStep("signIn");
                          setError(null);
                        }}
                        className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
                      >
                        Войти
                      </button>
                    </div>
                  </form>
                )}

                {/* Step: Sign In */}
                {step === "signIn" && (
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      {email}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Пароль"
                        type="password"
                        aria-label="Пароль"
                        className="h-11 pl-10"
                        disabled={isLoading}
                        required
                        autoFocus
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    {error && (
                      <p className="text-xs text-destructive">{error}</p>
                    )}
                    <Button
                      type="submit"
                      className="h-11 w-full"
                      disabled={isLoading || !password}
                    >
                      {isLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          Войти
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            setStep("email");
                            setPassword("");
                            setError(null);
                          }}
                          className="underline underline-offset-4 hover:text-foreground"
                        >
                          Другой email
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStep("resetRequest");
                            setPassword("");
                            setError(null);
                          }}
                          className="underline underline-offset-4 hover:text-foreground"
                        >
                          Забыли пароль?
                        </button>
                      </div>
                      <div className="text-center pt-1">
                        Нет аккаунта?{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setStep("signUp");
                            setPassword("");
                            setError(null);
                          }}
                          className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
                        >
                          Создать аккаунт
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Step: Reset Request */}
                {step === "resetRequest" && (
                  <form onSubmit={handleResetRequest} className="space-y-4">
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      {email}
                    </div>
                    {success && (
                      <div className="flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-xs text-green-700 dark:text-green-400">
                        <CheckCircle className="size-4 shrink-0" />
                        {success}
                      </div>
                    )}
                    {error && (
                      <p className="text-xs text-destructive">{error}</p>
                    )}
                    <Button
                      type="submit"
                      className="h-11 w-full"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          Отправить код
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                    <div className="text-center text-xs text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => {
                          setStep("signIn");
                          setError(null);
                          setSuccess(null);
                        }}
                        className="underline underline-offset-4 hover:text-foreground"
                      >
                        Вернуться ко входу
                      </button>
                    </div>
                  </form>
                )}

                {/* Step: Reset Verify */}
                {step === "resetVerify" && (
                  <form onSubmit={handleResetVerify} className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Код из письма"
                        type="text"
                        aria-label="Код подтверждения"
                        className="h-11 pl-10"
                        disabled={isLoading}
                        required
                        autoFocus
                        maxLength={6}
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Новый пароль (минимум 8 символов)"
                        type="password"
                        aria-label="Новый пароль"
                        className="h-11 pl-10"
                        disabled={isLoading}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                    {error && (
                      <p className="text-xs text-destructive">{error}</p>
                    )}
                    <Button
                      type="submit"
                      className="h-11 w-full"
                      disabled={
                        isLoading || !resetCode || newPassword.length < 8
                      }
                    >
                      {isLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          Сбросить пароль
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                    <div className="text-center text-xs text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => {
                          setStep("signIn");
                          setResetCode("");
                          setNewPassword("");
                          setError(null);
                        }}
                        className="underline underline-offset-4 hover:text-foreground"
                      >
                        Вернуться ко входу
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
            {" · "}
            <Link
              to="/privacy"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Политика конфиденциальности
            </Link>
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
