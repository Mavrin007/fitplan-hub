import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
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
      await signIn("email-otp", formData);
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
      await signIn("email-otp", formData);
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
      await signIn("anonymous");
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
