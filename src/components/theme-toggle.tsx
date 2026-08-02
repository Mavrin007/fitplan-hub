import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

/** Кнопка переключения светлой/тёмной темы. Иконка плавно вращается и
 *  масштабируется при смене темы. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
      title={isDark ? "Светлая тема" : "Тёмная тема"}
      className="flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors hover:bg-secondary"
    >
      <motion.span
        key={theme}
        initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex"
      >
        {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </motion.span>
    </button>
  );
}
