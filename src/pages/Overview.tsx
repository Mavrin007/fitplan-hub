import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { animate, motion } from "framer-motion";
import { WATER_ML_PER_KG, computeTargets, waterGoal } from "@/lib/nutrition";
import {
  todayKey,
  prettyDate,
  lastNDays,
  addDays,
  toDateKey,
  pluralDays,
} from "@/lib/dates";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/progress-ring";
import {
  CALORIES_RING,
  TRAINING_RING,
  WATER_RING,
} from "@/components/rings/colors";
import { PageAurora } from "@/components/page-aurora";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { useAuth } from "@/hooks/use-auth";
import { useTrack } from "@/hooks/use-track";
import {
  Activity,
  Check,
  ChevronRight,
  Droplets,
  Flame,
  Minus,
  Scale,
  Sparkles,
  Target,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildCoachAdvice,
  buildCoachGreeting,
  buildTodayChecklist,
  computeTodayScore,
  liters,
  type ChecklistItem,
  type TodayInput,
} from "@/features/dashboard/today";

const LOOKBACK_DAYS = 84; // 12 недель — горизонт серии/активности

/** Каскадное появление секций (родитель раздаёт staggerChildren). */
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: "easeOut" as const },
  },
};

function formatPct(value: number, target: number) {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((value / target) * 100));
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Число, которое «докручивается» до значения (по-русски, с разделителями).
 * При изменении анимируется от текущего отображаемого значения к новому.
 */
function CountUp({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = Number(node.textContent?.replace(/\s/g, "") || 0);
    const controls = animate(from, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => {
        node.textContent = Math.round(v).toLocaleString("ru-RU");
      },
    });
    return () => controls.stop();
  }, [value]);

  return (
    <span ref={ref} className={className}>
      0
    </span>
  );
}

/** Малое кольцо-привычка: процент в центре, подпись и уточнение внизу. */
function RingMini({
  label,
  pct,
  note,
  color,
  delay = 0,
}: {
  label: string;
  pct: number;
  note?: string;
  color: string;
  delay?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <ProgressRing value={pct} max={100} size={86} stroke={7} color={color} delay={delay}>
        <span className="num text-base font-semibold">{pct}%</span>
      </ProgressRing>
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      {note && <span className="num text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

/** Строка чек-листа: состояние, подпись, уточнение, переход на экран. */
function ChecklistRow({ item }: { item: ChecklistItem }) {
  const inner = (
    <>
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
          item.done
            ? "border-transparent bg-brand text-brand-foreground"
            : "border-border text-transparent",
        )}
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          item.done
            ? "text-muted-foreground line-through decoration-muted-foreground/40"
            : "font-medium text-foreground",
        )}
      >
        {item.label}
      </span>
      {item.detail && (
        <span className="num shrink-0 text-xs text-muted-foreground">
          {item.detail}
        </span>
      )}
      {item.href && (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
      )}
    </>
  );

  const rowClass =
    "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary-container/40";
  const label = `${item.label}, ${item.done ? "выполнено" : "осталось"}`;

  if (!item.href) {
    return (
      <div className={rowClass} aria-label={label}>
        {inner}
      </div>
    );
  }
  return (
    <Link to={item.href} className={rowClass} aria-label={label}>
      {inner}
    </Link>
  );
}

/** Мини-статистика недели: иконка, число, подпись. */
function WeekStat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 shrink-0 text-brand" />
        <span className="text-[10px] uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="num mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function Overview() {
  const { user } = useAuth();
  const profile = useQuery(api.profiles.getMyProfile);
  const todayLog = useQuery(api.mealLog.getByDate, { date: todayKey() });
  // Тренду нужны последние замеры, недельному счётчику — логи: лимиты
  // вместо полной выгрузки всей истории.
  const weights = useQuery(api.weightEntries.listMyWeights, { limit: 90 });
  const workoutLogs = useQuery(api.workouts.listLogs, { limit: 200 });
  const water = useQuery(api.water.getByDate, { date: todayKey() });
  const addWater = useMutation(api.water.addWater);
  const track = useTrack();

  // Диапазон для серии активности (локальная зона, понедельник→сегодня).
  const range = useMemo(() => {
    const keys = lastNDays(LOOKBACK_DAYS);
    return { from: keys[0], to: keys[keys.length - 1] };
  }, []);
  const activity = useQuery(api.activity.getActivityDays, range);

  const targets = profile ? computeTargets(profile) : null;
  const targetWeight = profile?.targetWeightKg ?? null;

  const calories = (todayLog ?? []).reduce((s, e) => s + e.calories, 0);
  const protein = (todayLog ?? []).reduce((s, e) => s + e.protein, 0);

  const calPct = targets ? formatPct(calories, targets.calories) : 0;
  const overCalPct =
    targets && calories > targets.calories
      ? ((calories / targets.calories) - 1) * 100
      : 0;
  const isCalOver = overCalPct > 0;

  // Вода: цель ~33 мл на кг веса; без профиля — дефолт 2 л.
  const waterTarget = profile ? waterGoal(profile.weightKg) : 2000;
  const waterMl = water?.amountMl ?? 0;
  const waterPct = formatPct(waterMl, waterTarget);

  const handleWater = async (delta: number) => {
    const prev = waterMl;
    try {
      await addWater({ date: todayKey(), amountMl: delta });
      if (prev < waterTarget && prev + delta >= waterTarget) {
        toast.success("Цель по воде достигнута! 🎉");
      }
    } catch (err) {
      console.error(`[Overview] Ошибка обновления воды (delta=${delta}):`, err);
      toast.error("Не удалось обновить воду");
    }
  };

  // Недельный счётчик тренировок (Пн–вс текущей недели) и «была ли сегодня».
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek);
  const weekStart = toDateKey(monday);
  const today = todayKey();
  const workoutsThisWeek = (workoutLogs ?? []).filter(
    (l) => l.date >= weekStart,
  ).length;
  const workoutToday = (workoutLogs ?? []).some((l) => l.date === today);

  const breakfast = (todayLog ?? []).some((e) => e.mealType === "breakfast");
  const lunch = (todayLog ?? []).some((e) => e.mealType === "lunch");
  const dinner = (todayLog ?? []).some((e) => e.mealType === "dinner");

  const weightLoggedThisWeek = (weights ?? []).some(
    (w) => w.date >= weekStart,
  );
  const weightTrend = [...(weights ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);
  const lastWeight = weightTrend.length
    ? weightTrend[weightTrend.length - 1].weightKg
    : null;
  // Δ веса за ~неделю: последний замер минус замер старше 7 дней (если есть).
  const weightDelta = useMemo(() => {
    if (!weights || weights.length === 0) return null;
    const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    const weekAgo = toDateKey(addDays(new Date(), -7));
    let prev: (typeof sorted)[number] | null = null;
    for (let i = sorted.length - 2; i >= 0; i--) {
      if (sorted[i].date <= weekAgo) {
        prev = sorted[i];
        break;
      }
    }
    return prev ? last.weightKg - prev.weightKg : null;
  }, [weights]);

  // Текущая серия активных дней (из календаря активности).
  const streak = useMemo(() => {
    if (!activity) return 0;
    const active = new Set(activity.map((a) => a.date));
    const days = lastNDays(400);
    let n = 0;
    let started = false;
    for (let i = days.length - 1; i >= 0; i--) {
      const isActive = active.has(days[i]);
      if (!started) {
        if (isActive) {
          started = true;
        } else if (i === days.length - 1) {
          continue; // сегодня ещё пусто — пробуем от вчера
        } else {
          break;
        }
      }
      if (!isActive) break;
      n++;
    }
    return n;
  }, [activity]);

  /** Все цифры дня — единый вход для оценки, чек-листа и коуча. */
  const todayInput: TodayInput = useMemo(
    () => ({
      calories,
      calorieTarget: targets?.calories ?? 0,
      protein,
      proteinTarget: targets?.protein ?? 0,
      waterMl,
      waterTarget,
      workoutsThisWeek,
      trainingTarget: profile?.preferredTrainingDays ?? 3,
      workoutToday,
      meals: { breakfast, lunch, dinner },
      weightLoggedThisWeek,
    }),
    [
      calories,
      targets?.calories,
      protein,
      targets?.protein,
      waterMl,
      waterTarget,
      workoutsThisWeek,
      profile?.preferredTrainingDays,
      workoutToday,
      breakfast,
      lunch,
      dinner,
      weightLoggedThisWeek,
    ],
  );

  const todayScore = useMemo(() => computeTodayScore(todayInput), [todayInput]);
  const checklist = useMemo(() => buildTodayChecklist(todayInput), [todayInput]);
  const coach = useMemo(() => buildCoachAdvice(todayInput), [todayInput]);

  const doneCount = checklist.filter((i) => i.done).length;
  // «День закрыт» — все привычки выполнены: повод для спокойной, без
  // конфетти, celebration-подсветки (свечение + пружинная галочка).
  const dayComplete = checklist.length > 0 && doneCount === checklist.length;

  // Имя для приветствия: name профиля, иначе локальная часть email.
  const firstName = useMemo(() => {
    const raw =
      user?.name || (user?.email ? user.email.split("@")[0] : undefined);
    return raw ? capitalize(raw.trim()) : undefined;
  }, [user]);

  // Главное действие зависит от состояния: тренировка сегодня → еда.
  const primaryAction = !workoutToday
    ? { label: "Начать тренировку", to: "/dashboard/workouts", icon: Activity }
    : {
        label: "Добавить приём пищи",
        to: "/dashboard/meals",
        icon: UtensilsCrossed,
      };
  const secondaryActions = !workoutToday
    ? [
        {
          label: "Добавить приём пищи",
          to: "/dashboard/meals",
          icon: UtensilsCrossed,
        },
        { label: "Записать вес", to: "/dashboard/progress", icon: Scale },
      ]
    : [
        { label: "Начать тренировку", to: "/dashboard/workouts", icon: Activity },
        { label: "Записать вес", to: "/dashboard/progress", icon: Scale },
      ];

  const openAssistant = () =>
    window.dispatchEvent(
      new CustomEvent("kilo:open-assistant", {
        // Контекстное приветствие: чат открывается с видом на сегодняшний
        // прогресс, а не с пустым «Чем могу помочь?».
        detail: { greeting: buildCoachGreeting(todayInput) },
      }),
    );

  // Аналитика (fire-and-forget, один раз за день/сессию): открытие Today,
  // закрытые кольца и «день закрыт» — это сырьё для retention-воронки.
  useEffect(() => {
    track("today_opened");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const trackedRings = useRef<Set<string>>(new Set());
  useEffect(() => {
    const trainingGoal = profile?.preferredTrainingDays ?? 3;
    const rings: { key: string; done: boolean }[] = [
      { key: "calories", done: calPct >= 100 },
      { key: "water", done: waterPct >= 100 },
      { key: "workout", done: workoutsThisWeek >= trainingGoal },
    ];
    for (const r of rings) {
      if (r.done && !trackedRings.current.has(r.key)) {
        trackedRings.current.add(r.key);
        track("ring_completed", { ring: r.key });
      }
    }
  }, [calPct, waterPct, workoutsThisWeek, profile?.preferredTrainingDays, track]);
  const dayTracked = useRef(false);
  useEffect(() => {
    if (dayComplete && !dayTracked.current) {
      dayTracked.current = true;
      track("day_completed", { score: todayScore.score });
    }
  }, [dayComplete, todayScore.score, track]);

  const noProfile = profile === null;
  const loading =
    profile === undefined ||
    todayLog === undefined ||
    activity === undefined ||
    water === undefined;

  if (loading) {
    return <PageLoading />;
  }

  return (
    <motion.div
      className="relative isolate mx-auto max-w-3xl space-y-6"
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.07 } },
      }}
    >
      <PageAurora />
      <motion.header variants={fadeUp} className="flex flex-col gap-1">
        <p className="label-overline text-muted-foreground">
          {prettyDate(today)}
        </p>
        <h1 className="m3-headline-large mt-1">Сегодня</h1>
        <p className="mt-1 text-base text-muted-foreground">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </p>
      </motion.header>

      {noProfile ? (
        <motion.div variants={fadeUp}>
          <EmptyState
            icon={Target}
            title="Настройте профиль, чтобы начать"
            description="Ваши цели по калориям и воде рассчитываются из возраста, роста, веса и поставленных целей."
            action={
              <Button asChild>
                <Link to="/dashboard/profile">
                  Настроить профиль <ChevronRight className="size-4" />
                </Link>
              </Button>
            }
          />
        </motion.div>
      ) : (
        <>
          {/* ── Оценка дня ── */}
          <motion.section
            variants={fadeUp}
            className="card-lift rounded-xl border bg-card p-6 shadow-elev-1 sm:p-8"
          >
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
              <div className="flex items-center gap-5 sm:gap-7">
                <ProgressRing
                  value={todayScore.score}
                  max={100}
                  size={168}
                  stroke={12}
                  color="var(--brand)"
                  delay={0.1}
                >
                  <span className="num text-5xl font-semibold tracking-tight">
                    <CountUp value={todayScore.score} />
                  </span>
                  <span className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    из 100
                  </span>
                </ProgressRing>
                <div className="max-w-[13rem]">
                  <p className="label-overline text-muted-foreground">
                    Оценка дня
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">
                    {todayScore.label}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Насколько вы близки к сегодняшним целям по еде, воде и
                    тренировке.
                  </p>
                </div>
              </div>

              {/* Расшифровка оценки: привычки с весами */}
              <div className="min-w-0 flex-1 space-y-2.5">
                {todayScore.components.map((c, i) => (
                  <div key={c.key} className="flex items-center gap-3">
                    <span className="flex w-28 shrink-0 items-baseline gap-1 text-xs text-muted-foreground">
                      {c.label}
                      <span className="num text-[9px] font-medium text-muted-foreground">
                        ×{Math.round(c.weight * 100)}%
                      </span>
                    </span>
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className={cn(
                          "h-full rounded-full",
                          c.key === "calories" && isCalOver
                            ? "bg-destructive"
                            : "bg-brand",
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${c.value}%` }}
                        transition={{
                          duration: 0.7,
                          ease: "easeOut",
                          delay: 0.15 + i * 0.06,
                        }}
                      />
                    </div>
                    <span className="num w-8 shrink-0 text-right text-xs text-muted-foreground">
                      {c.value}
                    </span>
                  </div>
                ))}

                {/* Как рассчитывается оценка — раскрывается по клику */}
                <details className="group mt-4 rounded-md bg-secondary/40 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
                  <summary className="cursor-pointer select-none font-medium">
                    Как рассчитан мой Score?
                  </summary>
                  <p className="mt-2 leading-5">
                    Взвешенная сумма пяти привычек: калории — 30%, вода — 25%,
                    тренировки — 20%, белок — 15%, дневник — 10%. Перебор
                    калорий штрафуется. Это поведенческая оценка дня, а не
                    медицинский показатель.
                  </p>
                </details>
              </div>
            </div>
          </motion.section>

          {/* ── День закрыт: все привычки выполнены ── */}
          {dayComplete && (
            <motion.section
              variants={fadeUp}
              className="relative overflow-hidden rounded-xl border border-brand/30 bg-gradient-to-br from-brand/15 via-brand/5 to-transparent p-5"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -top-20 left-1/2 size-56 -translate-x-1/2 rounded-full bg-brand/20 blur-3xl"
              />
              <div className="relative flex items-center gap-4">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.15 }}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-elev-2"
                >
                  <Check className="size-5" strokeWidth={3} />
                </motion.div>
                <div className="min-w-0">
                  <p className="m3-title-medium">День закрыт</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Все привычки выполнены. Оценка дня — {todayScore.score} из 100.
                    Так и держится серия.
                  </p>
                </div>
              </div>
            </motion.section>
          )}

          {/* ── Кольца-привычки ── */}
          <motion.section
            variants={fadeUp}
            className="card-lift grid grid-cols-3 gap-4 rounded-xl border bg-card px-6 py-6 shadow-elev-1"
          >
            <RingMini
              label="Калории"
              pct={calPct}
              note={
                isCalOver
                  ? `+${Math.round(overCalPct)}% сверх`
                  : `${calories.toLocaleString("ru-RU")} / ${(targets?.calories ?? 0).toLocaleString("ru-RU")} ккал`
              }
              color={isCalOver ? "var(--destructive)" : CALORIES_RING.base}
              delay={0.15}
            />
            <RingMini
              label="Тренировка"
              pct={formatPct(workoutsThisWeek, profile?.preferredTrainingDays ?? 3)}
              note={`${workoutsThisWeek} из ${profile?.preferredTrainingDays ?? 3} за нед.`}
              color={TRAINING_RING.base}
              delay={0.25}
            />
            <RingMini
              label="Вода"
              pct={waterPct}
              note={`${liters(waterMl)} л`}
              color={WATER_RING.base}
              delay={0.35}
            />
          </motion.section>

          {/* ── Чек-лист «Сегодня» ── */}
          <motion.section
            variants={fadeUp}
            className="card-lift rounded-xl border bg-card p-6 shadow-elev-1"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="label-overline text-muted-foreground">План на день</p>
              <p className="num text-xs text-muted-foreground">
                {doneCount} из {checklist.length}
              </p>
            </div>
            <div className="mt-3 space-y-0.5">
              {checklist.map((item) => (
                <ChecklistRow key={item.id} item={item} />
              ))}
            </div>

            {/* Быстрая вода — действие прямо с главного экрана */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Вода: ~{WATER_ML_PER_KG} мл на кг веса
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleWater(250)}
                >
                  <Droplets className="size-3.5" /> +250 мл
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleWater(500)}
                >
                  +500 мл
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleWater(-250)}
                  disabled={waterMl === 0}
                  aria-label="Убрать 250 мл"
                >
                  <Minus className="size-3.5" />
                </Button>
              </div>
            </div>
          </motion.section>

          {/* ── AI Coach ── */}
          <motion.section
            variants={fadeUp}
            className="card-lift rounded-xl border bg-card p-6 shadow-elev-1"
          >
            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-brand-foreground">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="label-overline text-muted-foreground">AI Coach</p>
                <p className="mt-1.5 text-sm leading-relaxed">{coach.text}</p>
                {coach.cta &&
                  (coach.cta.to ? (
                    <Button asChild size="sm" className="mt-3">
                      <Link to={coach.cta.to}>{coach.cta.label}</Link>
                    </Button>
                  ) : coach.cta.action === "water" ? (
                    <Button
                      size="sm"
                      className="mt-3"
                      onClick={() => handleWater(250)}
                    >
                      {coach.cta.label}
                    </Button>
                  ) : (
                    <Button size="sm" className="mt-3" onClick={openAssistant}>
                      {coach.cta.label}
                    </Button>
                  ))}
              </div>
            </div>
          </motion.section>

          {/* ── Главное действие ── */}
          <motion.section variants={fadeUp} className="space-y-3">
            <Button asChild className="h-12 w-full text-base sm:text-lg">
              <Link to={primaryAction.to}>
                <primaryAction.icon className="size-5" />
                {primaryAction.label}
              </Link>
            </Button>
            <div className="grid gap-3 sm:grid-cols-2">
              {secondaryActions.map((a) => (
                <Button key={a.to} asChild variant="outline" className="h-11">
                  <Link to={a.to}>
                    <a.icon className="size-4" />
                    {a.label}
                  </Link>
                </Button>
              ))}
            </div>
          </motion.section>

          {/* ── Неделя: компактно, ссылка на полный прогресс ── */}
          <motion.section
            variants={fadeUp}
            className="card-lift rounded-xl border bg-card p-6 shadow-elev-1"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="label-overline text-muted-foreground">Неделя</p>
              <Link
                to="/dashboard/progress"
                className="text-xs text-brand underline-offset-4 hover:underline"
              >
                Вся статистика
              </Link>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-4">
              <WeekStat
                icon={Flame}
                label="Серия"
                value={String(streak)}
                hint={
                  streak === 0
                    ? "начните сегодня"
                    : `${pluralDays(streak)} подряд`
                }
              />
              <WeekStat
                icon={Activity}
                label="Тренировки"
                value={String(workoutsThisWeek)}
                hint={`из ${profile?.preferredTrainingDays ?? 3} за неделю`}
              />
              <WeekStat
                icon={Scale}
                label="Вес"
                value={lastWeight !== null ? lastWeight.toFixed(1) : "—"}
                hint={
                  weightDelta === null
                    ? lastWeight !== null
                      ? "последний замер"
                      : "нет замеров"
                    : `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)} кг за нед.`
                }
              />
            </div>
            {targetWeight !== null && lastWeight !== null && (
              <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                Цель: {targetWeight.toFixed(1)} кг ·{" "}
                {lastWeight > targetWeight
                  ? "осталось сбросить"
                  : "цель достигнута — держим!"}
              </p>
            )}
          </motion.section>
        </>
      )}
    </motion.div>
  );
}
