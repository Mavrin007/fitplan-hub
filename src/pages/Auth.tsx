import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { readableError } from "@/lib/errors";
import { FitnessHero } from "@/components/illustrations";
import {
  TelegramLoginButton,
  type TelegramWidgetUser,
} from "@/components/telegram-login-button";
import { telegramWebApp } from "@/lib/telegram/webApp";
import { ArrowRight, Loader2, Mail, ShieldAlert } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";

interface AuthProps {
  redirectAfterAuth?: string;
  /** Клиентский cooldown повторной отправки кода (сек). В проде 30; в тестах
   *  прокидывается 1, чтобы не ждать полминуты реального времени. */
  resendCooldownSec?: number;
  /** Срок жизни OTP-кода (сек) для клиентского отсчёта истечения. В тестах
   *  прокидывается 1–2, чтобы проверить истечение без 15 минут реального
   *  времени. */
  otpMaxAgeSec?: number;
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

// Клиентский cooldown повторной отправки кода — защита от спама кнопкой.
// Равен серверному окну otpRateLimit (OTP_RESEND_INTERVAL_MS = 60 с): кнопка
// деактивирована ровно на серверный интервал, и лишний клик не уходит на
// бэкенд. Если сервер всё же ответит «Повторите через N сек.» (расхождение
// часов или смена интервала) — таймер пересинхронизируется на N
// (cooldownFromError), так что расхождение само себя чинит.
const RESEND_COOLDOWN_SEC = 60;

// Серверный срок жизни OTP-кода (@convex-dev/auth Email provider maxAge,
// src/convex/auth/emailOtp.ts). Клиент по нему ведёт обратный отсчёт в
// dev-блоке и предупреждает при вводе после истечения; сервер остаётся
// источником истины для самой верификации.
const OTP_MAX_AGE_SEC = 15 * 60; // 15 минут

// «2 мин» / «45 сек» — остаток до истечения кода для подсказки в dev-блоке.
function formatOtpRemaining(sec: number): string {
  return sec < 60 ? `${sec} сек` : `${Math.ceil(sec / 60)} мин`;
}

// Если сервер вернул «Код уже отправлен. Повторите через N сек.» — берём N
// (уважаем серверный лимит), иначе клиентский cooldown по умолчанию.
function cooldownFromError(message: string, fallbackSec: number): number {
  const match = message.match(/через (\d+) сек/);
  return match ? Math.max(1, Number(match[1])) : fallbackSec;
}

// «Слишком много попыток»: час при долгой блокировке (>= 60 мин), иначе —
// минуты. 720 сек = 1 попытка в 12 мин при лимите 5/час — покажем «12 мин».
function formatAttemptWait(sec: number): string {
  const minutes = Math.max(1, Math.ceil(sec / 60));
  return minutes >= 60 ? "час" : `${minutes} мин`;
}

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

function Auth({
  redirectAfterAuth,
  resendCooldownSec = RESEND_COOLDOWN_SEC,
  otpMaxAgeSec = OTP_MAX_AGE_SEC,
}: AuthProps = {}) {
  const { signIn } = useAuth();
  const { isLoading: isConvexAuthLoading, isAuthenticated: isConvexAuthenticated } = useConvexAuth();
  const convex = useConvex();
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
  // Обратный отсчёт до повторной отправки кода (0 = можно отправлять).
  const [resendCooldown, setResendCooldown] = useState(0);
  // Остаток секунд до истечения кода (0 = нет активного кода / истёк).
  // Ставится на otpMaxAgeSec в момент отправки и тикает вниз раз в секунду.
  const [otpRemainingSec, setOtpRemainingSec] = useState(0);

  // На dev/превью-развёртке бэкенд перехватывает OTP-коды (devOtp.ts) и мы
  // показываем их прямо в форме вместо письма. Хук вызывается всегда; на
  // боевом деплое серверный getByEmail вернёт null и блок скроется.
  const devOtpCode = useQuery(
    api.devOtp.getByEmail,
    step !== "signIn" ? { email: step.email } : "skip",
  );

  useEffect(() => {
    if (!isConvexAuthLoading && isConvexAuthenticated) {
      navigate(redirect);
    }
  }, [isConvexAuthLoading, isConvexAuthenticated, navigate, redirect]);

  // Автовход из Telegram Mini App: приложение открыто внутри Telegram, и
  // Telegram уже выдал подписанные данные (initData). Входим без формы.
  // create: true — открытие Mini App из бота это явное действие пользователя,
  // поэтому аккаунт КИЛО создаётся и привязывается к Telegram.
  //
  // ВАЖНО: автовход не зависит от authLoading (который включает
  // useQuery(users:currentUser)). Если этот query не загружается,
  // authLoading остаётся true навсегда и автовход никогда не сработает.
  // Поэтому используем useConvexAuth() напрямую для определения готовности.
  const telegramAutoLoginDone = useRef(false);
  const telegramAutoLoginInProgress = useRef(false);
  useEffect(() => {
    // Ждём пока Convex Auth определит состояние (не зависит от user query).
    if (isConvexAuthLoading) return;
    if (isConvexAuthenticated || telegramAutoLoginDone.current || telegramAutoLoginInProgress.current) return;

    const app = telegramWebApp();
    const initData = app?.initData;
    if (!initData) {
      // Mini App SDK ещё не инициализировал initData — ждём следующего
      // рендера (initData появляется после Telegram.WebApp.ready()).
      console.debug(
        "[TG-AUTO] initData не доступен, platform=",
        app?.platform,
        "version=",
        app?.version,
      );
      return;
    }
    telegramAutoLoginInProgress.current = true;
    telegramAutoLoginDone.current = true;
    console.debug(
      "[TG-AUTO] initData.length=",
      initData.length,
      "platform=",
      app?.platform,
      "version=",
      app?.version,
    );
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        await withAuthTimeout(
          signIn("telegram", { source: "webapp", initData, create: true }),
        );
        // Успех: useEffect(isAuthenticated) сам переведёт на redirect.
        setIsLoading(false);
      } catch (error) {
        // Безопасно: не содержит initData/token.
        console.error("[TG-AUTO] sign-in error:", error);
        if (!cancelled) {
          telegramAutoLoginDone.current = false;
          telegramAutoLoginInProgress.current = false;
          setError(readableError(error));
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConvexAuthLoading, isConvexAuthenticated, signIn]);

  // Тикающий отсчёт кнопки «Отправить ещё раз»: раз в секунду до нуля.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Тикающий отсчёт истечения кода: раз в секунду до нуля.
  useEffect(() => {
    if (otpRemainingSec <= 0) return;
    const timer = setTimeout(() => setOtpRemainingSec((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [otpRemainingSec]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await withAuthTimeout(signIn("email-otp", formData));
      setStep({ email: formData.get("email") as string });
      // Сразу после отправки включаем отсчёт — повторная отправка недоступна.
      setResendCooldown(resendCooldownSec);
      // И стартуем отсчёт истечения кода (по моменту отправки).
      setOtpRemainingSec(otpMaxAgeSec);
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(readableError(error));
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // FormData строится ДО await'ов: React обнуляет event.currentTarget после
    // возврата из обработчика, и после pre-check'а ниже он был бы null.
    const formData = new FormData(event.currentTarget);
    setIsLoading(true);
    setError(null);
    try {
      // Клиентский чек истечения кода (по моменту отправки). Сервер остаётся
      // источником истины для самой верификации, но при явно истёкшем сроке
      // не тратим вызов signIn и показываем отдельное сообщение вместо
      // «код неверен».
      if (otpRemainingSec <= 0) {
        setError("Код истёк. Нажмите «Отправить ещё раз».");
        setIsLoading(false);
        setOtp("");
        return;
      }
      // Прокси встроенного лимита попыток ввода (@convex-dev/auth, таблица
      // authRateLimits): при исчерпании библиотека вернула бы generic
      // «Could not verify code», неотличимый от неверного кода. Пред-проверяем
      // и показываем понятное сообщение, не тратя попытку на signIn.
      if (step !== "signIn") {
        const rate = (await withAuthTimeout(
          convex.query(api.otpRateLimit.canAttempt, { email: step.email }),
        )) as { allowed: boolean; retryAfterSec: number } | null | undefined;
        if (rate && !rate.allowed) {
          setError(
            `Слишком много попыток. Подождите ${formatAttemptWait(rate.retryAfterSec)}`,
          );
          setIsLoading(false);
          setOtp("");
          return;
        }
      }
      await withAuthTimeout(signIn("email-otp", formData));
      navigate(redirect);
    } catch (error) {
      console.error("OTP verification error:", error);
      setError("Введённый код подтверждения неверен.");
      setIsLoading(false);
      setOtp("");
    }
  };

  // Повторная отправка кода без выхода с OTP-шага: снова зовём signIn с тем же
  // email (серверный otpRateLimit не даст чаще 1 раза в 60с), очищаем ввод и
  // ошибку. Dev-блок ниже перечитает devOtp.getByEmail и покажет новый код.
  const handleResendCode = async () => {
    // Кнопка живёт только на OTP-шаге, но step — объединение типов: сужаем.
    if (step === "signIn") return;
    const email = step.email;
    setIsLoading(true);
    setError(null);
    setOtp("");
    try {
      // Пред-проверка серверного rate-limit (БЕЗ записи): @convex-dev/auth
      // перевыпускает код ещё до нашего серверного чека, поэтому заблокирован-
      // ный ресенд не должен вообще доходить до signIn — иначе старый код
      // умрёт, а новый останется невидимым. Если окно открыто — шлём как раньше.
      const rate = (await withAuthTimeout(
        convex.query(api.otpRateLimit.canSend, { email }),
      )) as { allowed: boolean; retryAfterSec: number } | null | undefined;
      // undefined = ответа нет (тесты/старый клиент) — пропускаем пред-проверку
      // и идём в signIn: серверный чек в emailOtp всё равно защитит шлюз.
      if (rate && !rate.allowed) {
        setError(`Код уже отправлен. Повторите через ${rate.retryAfterSec} сек.`);
        // Уважаем серверный интервал: таймер пересинхронизируется на N.
        setResendCooldown(rate.retryAfterSec);
        setIsLoading(false);
        return;
      }
      await withAuthTimeout(signIn("email-otp", { email }));
      // Остаёмся на OTP-шаге — devOtpCode обновится через useQuery. Новый
      // код отправлен: отсчёты заново, чтобы сразу не слать третий раз и
      // чтобы срок жизни нового кода считался от его отправки.
      setResendCooldown(resendCooldownSec);
      setOtpRemainingSec(otpMaxAgeSec);
      setIsLoading(false);
    } catch (error) {
      console.error("OTP resend error:", error);
      const message = readableError(error);
      setError(message);
      // Отклонение (rate-limit) тоже ставит таймер — на серверный интервал.
      setResendCooldown(cooldownFromError(message, resendCooldownSec));
      setIsLoading(false);
    }
  };

  // Вернуться с OTP-шага на шаг email: сброс ввода, ошибки и отсчёта, чтобы
  // отправить код на другой адрес («Попробовать снова»).
  const handleBackToEmail = () => {
    setStep("signIn");
    setOtp("");
    setError(null);
    setResendCooldown(0);
    setOtpRemainingSec(0);
  };

  // «Войти через Telegram» в обычном браузере: виджет отдал пользователя,
  // проверка подписи происходит на сервере (telegramLogin provider).
  const handleTelegramWidgetAuth = async (user: TelegramWidgetUser) => {
    setIsLoading(true);
    setError(null);
    try {
      await withAuthTimeout(signIn("telegram", { source: "widget", ...user }));
      navigate(redirect);
    } catch (error) {
      console.error("Telegram sign-in error:", error);
      setError(readableError(error));
      setIsLoading(false);
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
      setError(`Не удалось войти как гость: ${readableError(error)}`);
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
                <FitnessHero className="mx-auto h-20 w-28" />
                <p className="label-overline mt-2 text-muted-foreground">
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
                      {/* aria-label вместо скрытого label: поле визуально
                          подписывается плейсхолдером, но для скринридеров и
                          axe-аудита нужна настоящая доступная метка. */}
                      <Input
                        name="email"
                        placeholder="name@example.com"
                        type="email"
                        aria-label="Электронная почта"
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

                    <TelegramLoginButton
                      onAuth={handleTelegramWidgetAuth}
                      disabled={isLoading}
                    />

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
                        <p className="mt-1.5 text-[10px] text-muted-foreground">
                          {otpRemainingSec > 0
                            ? `Код истекает через ${formatOtpRemaining(otpRemainingSec)}`
                            : "Код истёк — запросите новый"}
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
                        onClick={handleResendCode}
                        disabled={isLoading || resendCooldown > 0}
                        className="underline underline-offset-4 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                      >
                        {resendCooldown > 0
                          ? `Повторить через ${resendCooldown} с`
                          : "Отправить ещё раз"}
                      </button>
                    </div>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={handleBackToEmail}
                        disabled={isLoading}
                        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
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
            {" · "}
            <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
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
