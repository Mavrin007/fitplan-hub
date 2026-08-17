/**
 * «Войти через Telegram» — официальный Login Widget (oauth.telegram.org).
 *
 * Виджет подменяет себя iframe с кнопкой входа; после подтверждения вызывает
 * глобальный window.onTelegramAuth с полями id/first_name/last_name/username/
 * photo_url/auth_date/hash. Подпись (hash) проверяется на сервере
 * (src/convex/auth/telegramLogin.ts) — токен бота на клиент не попадает.
 *
 * Внутри Telegram Mini App кнопка не нужна: там автовход через initData
 * (см. src/pages/Auth.tsx), поэтому виджет не рендерится.
 */

import { useEffect, useRef } from "react";
import { TELEGRAM_BOT_USERNAME } from "@/lib/telegram/api";
import { isTelegramWebApp } from "@/lib/telegram/webApp";

/** Пользователь из callback Login Widget (oauth.telegram.org). */
export interface TelegramWidgetUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

interface TelegramLoginButtonProps {
  /** Вызывается с объектом виджета; signIn выполняет родитель. */
  onAuth: (user: TelegramWidgetUser) => void;
}

export function TelegramLoginButton({ onAuth }: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Callback в ref: эффект виджета монтируется один раз, но обработчик всегда
  // свежий (обновление — в эффекте, не во время рендера).
  const onAuthRef = useRef(onAuth);
  useEffect(() => {
    onAuthRef.current = onAuth;
  });

  // Внутри Telegram вход уже выполнен (initData) — виджет не нужен.
  const shown = !isTelegramWebApp();

  useEffect(() => {
    if (!shown || !containerRef.current) return;
    const container = containerRef.current;

    // data-onauth="onTelegramAuth(user)" — виджет зовёт глобальную функцию.
    const callback = (user: TelegramWidgetUser) => {
      onAuthRef.current(user);
    };
    window.onTelegramAuth = callback;

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", TELEGRAM_BOT_USERNAME);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    container.appendChild(script);

    return () => {
      // Убираем и кнопку виджета, и глобальный callback (виджет подменяет
      // script на iframe — удаляем весь контейнер, чтобы не оставалось дублей).
      container.replaceChildren();
      if (window.onTelegramAuth === callback) {
        delete window.onTelegramAuth;
      }
    };
  }, [shown]);

  if (!shown) return null;

  return (
    <div
      ref={containerRef}
      className="flex justify-center"
      data-testid="telegram-login-widget"
    />
  );
}
