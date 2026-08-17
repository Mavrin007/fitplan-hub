/**
 * «Войти через Telegram» — заметная кастомная кнопка поверх официального
 * OAuth-флоу oauth.telegram.org (см. src/lib/telegram/oauth.ts).
 *
 * Официальный Login Widget (iframe) не масштабируется под тему приложения,
 * поэтому используем тот же механизм напрямую (popup-флоу из доков Telegram):
 *   - клик открывает попап oauth.telegram.org/auth с return_to на эту страницу;
 *   - после подтверждения Telegram редиректит попап на return_to с хэшем
 *     #tgAuthResult=<urlencoded JSON>;
 *   - главное окно читает хэш попапа и зовёт onAuth. Пока попап на
 *     oauth.telegram.org (другой origin), чтение location бросает
 *     SecurityError — такие тики пропускаем;
 *   - если попап заблокирован — открываем вкладку: там монтируется та же
 *     страница /auth, mount-обработчик видит #tgAuthResult и входит сам.
 *
 * Подпись (hash) всегда проверяется на сервере
 * (src/convex/auth/telegramLogin.ts) — токен бота на клиент не попадает.
 * Внутри Telegram Mini App кнопка не рендерится: там автовход через initData.
 *
 * Почему кнопка может «не работать»: Telegram разрешает вход только с доменов,
 * добавленных в настройке Login Widget бота (@BotFather → Bot Settings →
 * Login Widget → Allowed URLs). Если домена там нет, oauth.telegram.org
 * отвечает «Bot domain invalid», попап висит на странице Telegram и ничего не
 * происходит — через 10 секунд показываем подсказку с точным действием.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  parseTelegramAuthResult,
  telegramAuthUrl,
  type TelegramWidgetUser,
} from "@/lib/telegram/oauth";
import { TELEGRAM_BOT_USERNAME } from "@/lib/telegram/api";
import { isTelegramWebApp } from "@/lib/telegram/webApp";
import { Loader2, Send } from "lucide-react";

export type { TelegramWidgetUser } from "@/lib/telegram/oauth";

interface TelegramLoginButtonProps {
  /** Вызывается с данными пользователя; signIn выполняет родитель. */
  onAuth: (user: TelegramWidgetUser) => void;
  /** Блокировка на время другой авторизации (например, OTP-шага). */
  disabled?: boolean;
}

const POPUP_POLL_MS = 300;
// Столько попап обычно висит на oauth.telegram.org, когда домен не добавлен
// в Login Widget бота (пользователь быстро подтверждает за 1–3 секунды).
const SETUP_HINT_MS = 10_000;

export function TelegramLoginButton({
  onAuth,
  disabled,
}: TelegramLoginButtonProps) {
  const [pending, setPending] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  // Callback в ref: обработчики живут в эффектах/интервалах, но всегда свежие.
  const onAuthRef = useRef(onAuth);
  useEffect(() => {
    onAuthRef.current = onAuth;
  });

  // Таймеры попапа — в ref, чтобы убить их при размонтировании.
  const pollTimerRef = useRef<number | null>(null);
  const hintTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
      if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    };
  }, []);

  // Внутри Telegram вход уже выполнен (initData) — кнопка не нужна.
  const shown = !isTelegramWebApp();

  const handleAuth = useCallback((user: TelegramWidgetUser) => {
    setPending(false);
    setHint(null);
    onAuthRef.current(user);
  }, []);

  // Результат авторизации, вернувшийся хэшем на ЭТУ страницу. Срабатывает в
  // вкладке-фолбэке (попап заблокирован) и в самом попапе — там монтируется
  // та же /auth, которая входит сама; открыватель параллельно читает его хэш
  // и тоже входит (один и тот же аккаунт — повторный вход идемпотентен).
  useEffect(() => {
    if (!shown) return;
    const user = parseTelegramAuthResult(window.location.hash);
    if (!user) return;
    // Убираем tgAuthResult из URL, чтобы не авторизоваться повторно при F5.
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    // Обработка результата «извне» (хэш URL) — в микрозадаче, чтобы не
    // вызывать setState синхронно в теле эффекта (react-hooks/set-state-in-effect).
    const timer = window.setTimeout(() => handleAuth(user), 0);
    return () => window.clearTimeout(timer);
  }, [shown, handleAuth]);

  const handleClick = () => {
    const origin = window.location.origin;
    const returnTo = origin + window.location.pathname + window.location.search;
    setHint(null);
    setPending(true);
    const popup = window.open(
      telegramAuthUrl(origin, returnTo),
      "telegram-oauth",
      "popup=yes,width=420,height=640",
    );
    if (!popup) {
      // Попап заблокирован браузером — открываем вкладку: она смонтирует /auth
      // с #tgAuthResult и войдёт сама (mount-обработчик выше).
      window.open(telegramAuthUrl(origin, returnTo), "_blank", "noopener");
      setPending(false);
      setHint(
        "Браузер заблокировал всплывающее окно — вход откроется в новой вкладке.",
      );
      return;
    }
    pollTimerRef.current = window.setInterval(() => {
      if (popup.closed) {
        if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
        setPending(false);
        return;
      }
      let hash = "";
      try {
        // До редиректа попапа на наш origin чтение бросает SecurityError.
        hash = popup.location.hash;
      } catch {
        // попап ещё на oauth.telegram.org — ждём следующий тик
      }
      const user = parseTelegramAuthResult(hash);
      if (user) {
        if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
        try {
          popup.close();
        } catch {
          // окно уже закрыто — не критично
        }
        handleAuth(user);
      }
    }, POPUP_POLL_MS);
    // Попап «висит» на oauth.telegram.org дольше 10 секунд — почти всегда
    // домен не добавлен в Login Widget бота. Показываем точную подсказку;
    // поллинг продолжается — пользователь может просто медленно подтверждать.
    hintTimerRef.current = window.setTimeout(() => {
      if (!popup.closed) {
        setHint(
          `Telegram не открывает подтверждение: домен ${window.location.host} не добавлен в Login Widget бота @${TELEGRAM_BOT_USERNAME} (BotFather → Bot Settings → Login Widget → Allowed URLs).`,
        );
      }
    }, SETUP_HINT_MS);
  };

  if (!shown) return null;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={handleClick}
        disabled={disabled || pending}
        data-testid="telegram-login-button"
        // Фирменный синий Telegram поверх темы приложения: bg-none гасит
        // градиент дефолтной вариации кнопки, дальше — свой цвет/наведение.
        className="h-11 w-full bg-none bg-[#229ED9] text-white shadow-elev-1 hover:bg-[#1f8fc4]"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Ожидаем подтверждение в Telegram…
          </>
        ) : (
          <>
            <Send className="size-4 -rotate-45" />
            Войти через Telegram
          </>
        )}
      </Button>
      {hint ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : (
        <p className="text-center text-[11px] text-muted-foreground">
          Вход по аккаунту Telegram — без пароля
        </p>
      )}
    </div>
  );
}
