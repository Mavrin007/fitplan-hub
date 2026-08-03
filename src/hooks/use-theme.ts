import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "kilo-theme";

export type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  // SSR-безопасно: в браузере читаем сохранённый выбор, иначе — светлая.
  if (typeof window === "undefined") return "light";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — светлая тема.
  }
  return "light";
}

/** Переключение светлой/тёмной темы: класс .dark на <html> + сохранение
 *  выбора в localStorage. Начальное значение применяется синхронно, поэтому
 *  «мигания» темы при загрузке нет (плюс подстраховка скриптом в index.html). */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage недоступен — тема просто не запомнится между сессиями.
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggle };
}
