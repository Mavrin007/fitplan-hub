import { motion } from "framer-motion";
import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router";

/** Страница 404: аккуратный M3-пустой стейт с понятными действиями. */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold uppercase tracking-[0.28em] transition-opacity group-hover:opacity-70">
            Кило
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            ®
          </span>
        </Link>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center justify-center px-6 pb-24 pt-10 text-center"
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
          <Compass className="size-5" />
        </div>
        <p className="label-overline mt-6 text-muted-foreground">Ошибка 404</p>
        <h1 className="mt-3 m3-display-small">Страница не найдена</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Такой страницы нет или она была перемещена. Вернитесь на главную или в
          свой дневник.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            <ArrowLeft className="size-4" />
            На главную
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
          >
            Войти в Кило
          </Link>
        </div>
      </motion.main>
    </div>
  );
}
