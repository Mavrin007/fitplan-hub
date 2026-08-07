import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useAuth } from "@/hooks/use-auth";
import {
  Activity,
  BarChart3,
  LayoutDashboard,
  LogOut,
  Sparkles,
  User,
  UtensilsCrossed,
} from "lucide-react";
import { Outlet, NavLink, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/theme-toggle";
import { GuestSignOutOverlay } from "@/components/guest-sign-out-overlay";
import { OnboardingWizard } from "@/features/onboarding/OnboardingWizard";
import { shouldShowOnboarding } from "@/features/onboarding/onboarding";

const OPEN_ASSISTANT_EVENT = "kilo:open-assistant";

function openAssistant() {
  window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT));
}

const NAV = [
  { to: "/dashboard", label: "Обзор", icon: LayoutDashboard, end: true },
  { to: "/dashboard/meals", label: "Питание", icon: UtensilsCrossed },
  { to: "/dashboard/workouts", label: "Тренировки", icon: Activity },
  { to: "/dashboard/progress", label: "Прогресс", icon: BarChart3 },
  { to: "/dashboard/profile", label: "Профиль", icon: User },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

function todayLabel(): string {
  const s = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function initials(name: string | undefined | null): string {
  const source = (name ?? "К").trim();
  return source.charAt(0).toUpperCase();
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  // Оверлей «у вас N записей» при выходе из гостевой сессии.
  const [signOutOpen, setSignOutOpen] = useState(false);
  // Онбординг на первом входе: показывается, пока профиль не создан.
  const profile = useQuery(api.profiles.getMyProfile);

  // Гость = анонимная сессия (нет email). Для таких выход перехватывается.
  const isGuest = user != null && (user.isAnonymous === true || !user.email);

  // Первый вход: профиля нет и пользователь не пропустил онбординг в этом
  // браузере. Пока профиль ещё грузится (undefined) визард не показываем.
  const showOnboarding = shouldShowOnboarding(profile);
  const [onboardingDone, setOnboardingDone] = useState(false);

  const doSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleSignOut = async () => {
    if (isGuest) {
      // Оверлей сам решит: если записей нет — выйдет сразу.
      setSignOutOpen(true);
      return;
    }
    await doSignOut();
  };

  // Онбординг закрыт (профиль сохранён): при следующем рендере profile уже
  // пришёл с сервера, поэтому визард не вернётся; скип запоминает браузер.
  if (showOnboarding && !onboardingDone) {
    return (
      <OnboardingWizard
        onComplete={() => setOnboardingDone(true)}
        onSkip={() => setOnboardingDone(true)}
      />
    );
  }

  return (
    <div className="bg-aurora isolate relative min-h-screen overflow-x-clip bg-background text-foreground">
      {/* Слои глубины: тонкая сетка сверху + текстурный шум — не мешают
          контенту (ниже по z, чем карточки), но убирают «плоскость» фона. */}
      <div
        aria-hidden
        className="bg-grid mask-fade-radial pointer-events-none fixed inset-x-0 top-0 -z-10 h-[70vh] opacity-40"
      />
      <div
        aria-hidden
        className="bg-noise pointer-events-none fixed inset-0 -z-10 opacity-70"
      />
      <div className="relative mx-auto flex w-full max-w-7xl">
        {/* Navigation rail (desktop) */}
        <aside className="bg-noise sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-background/70 px-5 py-8 backdrop-blur lg:flex">
          <div className="flex items-center justify-between pr-1">
            <NavLink to="/" className="group flex items-baseline gap-1.5">
              <span className="text-sm font-semibold tracking-[0.28em] uppercase transition-opacity group-hover:opacity-70">
                Кило
              </span>
              <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                ®
              </span>
            </NavLink>
            <ThemeToggle />
          </div>

          <nav className="mt-10 flex flex-col gap-1">
            {NAV.map(({ to, label, icon: Icon, end }, i) => (
              <motion.div
                key={to}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
              >
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex items-center gap-2.5 rounded-full px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-secondary-container font-medium text-on-secondary-container"
                        : "text-on-surface-variant hover:bg-secondary-container/50 hover:text-on-secondary-container",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute -left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                        />
                      )}
                      <Icon
                        className={cn(
                          "size-4 transition-transform duration-200 group-hover:translate-x-0.5",
                          isActive && "group-hover:translate-x-0",
                        )}
                      />
                      {label}
                    </>
                  )}
                </NavLink>
              </motion.div>
            ))}
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: NAV.length * 0.05, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                type="button"
                onClick={openAssistant}
                className="group mt-1 flex w-full items-center gap-2.5 rounded-full border border-dashed px-3 py-2 text-sm text-on-surface-variant transition-colors hover:border-primary/40 hover:bg-secondary-container/50 hover:text-on-secondary-container"
              >
                <Sparkles className="size-4 transition-transform duration-200 group-hover:rotate-12" />
                Ассистент
              </button>
            </motion.div>
          </nav>

          <div className="mt-auto">
            <div className="border-t pt-4">
              <div className="flex items-center gap-2.5 px-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary-container text-xs font-semibold num">
                  {initials(user?.name ?? user?.email)}
                </span>
                <p className="min-w-0 truncate text-xs text-muted-foreground">
                  {user?.email ?? user?.name ?? "Вы вошли"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-3 flex w-full items-center gap-2.5 rounded-full px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary-container/50 hover:text-foreground"
              >
                <LogOut className="size-4" />
                Выйти
              </button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <NavLink to="/" className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold tracking-[0.28em] uppercase">
                  Кило
                </span>
                <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                  ®
                </span>
              </NavLink>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <button
                  type="button"
                  onClick={openAssistant}
                  className="flex items-center gap-1 rounded-full bg-gradient-to-br from-brand to-brand-deep px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-elev-1 transition-all hover:shadow-elev-2 hover:brightness-110 active:scale-[0.96]"
                >
                  <Sparkles className="size-3.5" />
                  Ассистент
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <LogOut className="size-3.5" />
                  Выйти
                </button>
              </div>
            </div>
          </header>

          {/* Desktop header: greeting + assistant (переключатель темы живёт
              в рейле — не дублируем его здесь) */}
          <header className="bg-noise sticky top-0 z-10 hidden items-center justify-between border-b bg-background/70 px-8 py-4 backdrop-blur lg:flex lg:px-12">
            <div>
              <p className="text-sm font-medium">{greeting()}</p>
              <p className="label-overline mt-0.5 text-muted-foreground">{todayLabel()}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={openAssistant}
                className="group flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-all hover:border-primary/40 hover:bg-secondary-container/50 active:scale-[0.97]"
              >
                <Sparkles className="size-3.5 transition-transform duration-200 group-hover:rotate-12" />
                Спросить ассистента
              </button>
            </div>
          </header>

          <main className="px-5 pt-8 pb-28 sm:px-8 lg:px-12 lg:py-12">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Защита данных гостя: при выходе из анонимной сессии с записями
          предлагаем привязать почту (оверлей сам закрывается и выходит,
          если данных нет). Монтируем только при открытии — счётчик записей
          (6 запросов) не должен выполняться на каждом рендере дашборда. */}
      {signOutOpen && (
        <GuestSignOutOverlay
          open
          onCancel={() => setSignOutOpen(false)}
          onAttach={() => {
            setSignOutOpen(false);
            navigate("/dashboard/profile");
          }}
          onSignOut={() => {
            setSignOutOpen(false);
            void doSignOut();
          }}
        />
      )}

      {/* Mobile bottom navigation (M3 navigation bar) */}
      <nav
        aria-label="Основная навигация"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1 px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "group flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium transition-colors",
                  isActive
                    ? "text-on-secondary-container"
                    : "text-on-surface-variant hover:text-on-secondary-container",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-all",
                      isActive
                        ? "bg-secondary-container"
                        : "group-hover:bg-secondary-container/50",
                    )}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
