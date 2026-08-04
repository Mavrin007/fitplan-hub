import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { animate, motion } from "framer-motion";
import { computeTargets } from "@/lib/nutrition";
import { projectGoal } from "@/lib/projection";
import {
  todayKey,
  prettyDate,
  shortDate,
  lastNDays,
  addDays,
  toDateKey,
  pluralDays,
  pluralRecords,
} from "@/lib/dates";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ProgressRing } from "@/components/progress-ring";
import { MacroRing } from "@/components/macro-ring";
import { PageAurora } from "@/components/page-aurora";
import {
  Activity,
  ArrowRight,
  Droplets,
  Flame,
  Minus,
  Scale,
  Sparkles,
  Target,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LOOKBACK_DAYS = 84; // 12 недель — горизонт календаря активности

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

/** Цвет ячейки тепловой карты по числу записей за день. */
function activityLevel(count: number): string {
  if (count <= 0) return "bg-muted";
  if (count <= 2) return "bg-brand/25";
  if (count <= 4) return "bg-brand/45";
  if (count <= 6) return "bg-brand/70";
  return "bg-brand";
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

/** Тепловая карта активности за 12 недель (в стиле GitHub). */
function ActivityCalendar({
  activityMap,
}: {
  activityMap: Map<string, number>;
}) {
  const today = todayKey();

  const weeks = useMemo(() => {
    const start = addDays(new Date(), -(LOOKBACK_DAYS - 1));
    const dow = (start.getDay() + 6) % 7; // Понедельник = 0
    const monday = addDays(start, -dow);

    const cells: { key: string; count: number; isToday: boolean }[] = [];
    for (let i = 0; i < LOOKBACK_DAYS + dow; i++) {
      const d = addDays(monday, i);
      const key = toDateKey(d);
      cells.push({
        key,
        count: activityMap.get(key) ?? 0,
        isToday: key === today,
      });
    }

    const grouped: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      grouped.push(cells.slice(i, i + 7));
    }
    return grouped;
  }, [activityMap, today]);

  // Подписи месяцев: показываем месяц первой ячейки недели, если он сменился.
  const monthLabels = useMemo(() => {
    let prev = "";
    return weeks.map((week) => {
      const first = week[0];
      if (!first) return "";
      const [y, m] = first.key.split("-").map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString("ru-RU", {
        month: "short",
      });
      const shown = label === prev ? "" : label;
      prev = label;
      return shown;
    });
  }, [weeks]);

  return (
    <div className="min-w-0">
      {/* Месяцы */}
      <div className="flex gap-1">
        <div className="mr-1 w-5 shrink-0" />
        {monthLabels.map((m, i) => (
          <div
            key={i}
            className="w-2.5 text-center text-[8px] leading-3 text-muted-foreground"
          >
            {m}
          </div>
        ))}
      </div>

      {/* Сетка недель — ячейки «проявляются» каскадом */}
      <div className="mt-1 flex gap-1">
        <div className="mr-1 flex w-5 shrink-0 flex-col gap-1">
          {["Пн", "", "Ср", "", "Пт", ""].map((label, i) => (
            <div
              key={i}
              className="flex h-2.5 items-center text-[8px] leading-none text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((c, i) => (
              <motion.div
                key={c.key}
                title={
                  c.count > 0
                    ? `${shortDate(c.key)} — ${c.count} ${pluralRecords(c.count)}`
                    : `${shortDate(c.key)} — нет записей`
                }
                role="img"
                aria-label={
                  c.count > 0
                    ? `${shortDate(c.key)}, ${c.count} ${pluralRecords(c.count)}`
                    : `${shortDate(c.key)}, нет записей`
                }
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: Math.min(wi * 0.025 + i * 0.01, 0.7),
                  duration: 0.3,
                  ease: "easeOut",
                }}
                className={cn(
                  "size-2.5 rounded-[3px] transition-colors",
                  activityLevel(c.count),
                  c.isToday && "ring-1 ring-brand/60",
                )}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Легенда */}
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>Меньше</span>
        {[0, 1, 3, 5, 7].map((l) => (
          <div key={l} className={cn("size-2.5 rounded-[3px]", activityLevel(l))} />
        ))}
        <span>Больше</span>
      </div>
    </div>
  );
}

export default function Overview() {
  const profile = useQuery(api.profiles.getMyProfile);
  const todayLog = useQuery(api.mealLog.getByDate, { date: todayKey() });
  const weights = useQuery(api.weightEntries.listMyWeights, {});
  const workoutLogs = useQuery(api.workouts.listLogs, {});
  const water = useQuery(api.water.getByDate, { date: todayKey() });
  const addWater = useMutation(api.water.addWater);

  // Дата-диапазон для календаря активности (локальная зона, понедельник→сегодня)
  const range = useMemo(() => {
    const keys = lastNDays(LOOKBACK_DAYS);
    return { from: keys[0], to: keys[keys.length - 1] };
  }, []);
  const activity = useQuery(api.activity.getActivityDays, range);

  const targets = profile ? computeTargets(profile) : null;
  const targetWeight = profile?.targetWeightKg ?? null;

  // Прогноз достижения целевого веса (для карточки «Динамика веса»).
  const overviewProjection = useMemo(() => {
    if (!targetWeight) return null;
    return projectGoal(
      (weights ?? []).map((w) => ({ date: w.date, weightKg: w.weightKg })),
      targetWeight,
    );
  }, [weights, targetWeight]);

  const calories = (todayLog ?? []).reduce((s, e) => s + e.calories, 0);
  const protein = (todayLog ?? []).reduce((s, e) => s + e.protein, 0);
  const carbs = (todayLog ?? []).reduce((s, e) => s + e.carbs, 0);
  const fat = (todayLog ?? []).reduce((s, e) => s + e.fat, 0);

  const calPct = targets ? formatPct(calories, targets.calories) : 0;

  // Вода: цель ~33 мл на кг веса, кратно 250, минимум 1500 мл
  const waterGoal = profile
    ? Math.max(1500, Math.round((profile.weightKg * 33) / 250) * 250)
    : 2000;
  const waterMl = water?.amountMl ?? 0;
  const waterPct = formatPct(waterMl, waterGoal);

  const handleWater = async (delta: number) => {
    const prev = waterMl;
    try {
      await addWater({ date: todayKey(), amountMl: delta });
      if (prev < waterGoal && prev + delta >= waterGoal) {
        toast.success("Цель по воде достигнута! 🎉");
      }
    } catch (err) {
      console.error(`[Overview] Ошибка обновления воды (delta=${delta}):`, err);
      toast.error("Не удалось обновить воду");
    }
  };

  const activityMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of activity ?? []) m.set(a.date, a.count);
    return m;
  }, [activity]);

  /** Текущая серия: подряд активных дней, оканчивающихся сегодня
   *  (если сегодня ещё пусто — вчера). */
  const streak = useMemo(() => {
    if (!activity) return 0;
    const active = new Set(activity.map((a) => a.date));
    const days = lastNDays(400); // от сегодня вглубь
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

  /** Лучшая серия за горизонт календаря (12 недель). */
  const bestStreak = useMemo(() => {
    if (!activity) return 0;
    const active = new Set(activity.map((a) => a.date));
    const days = lastNDays(LOOKBACK_DAYS);
    let best = 0;
    let cur = 0;
    for (const d of days) {
      if (active.has(d)) {
        cur++;
        best = Math.max(best, cur);
      } else {
        cur = 0;
      }
    }
    return best;
  }, [activity]);

  // Weight trend: last 7 entries, oldest first
  const weightTrend = [...(weights ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);

  // Workouts this week (Mon-Sun of current week), local timezone
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek);
  const weekStart = toDateKey(monday);
  const workoutsThisWeek = (workoutLogs ?? []).filter(
    (l) => l.date >= weekStart,
  ).length;

  const noProfile = profile === null;
  const loading =
    profile === undefined ||
    todayLog === undefined ||
    activity === undefined ||
    water === undefined;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-8 w-56 rounded bg-muted" />
        </div>
        <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />
      </div>
    );
  }

  return (
    <motion.div
      className="relative isolate mx-auto max-w-3xl space-y-10"
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.07 } },
      }}
    >
      <PageAurora />
      <motion.header variants={fadeUp}>
        <p className="label-overline text-muted-foreground">
          {prettyDate(todayKey())}
        </p>
        <h1 className="m3-headline-large mt-2">Сегодня</h1>
        <div
          aria-hidden
          className="mt-3 h-1 w-14 rounded-full bg-gradient-to-r from-brand to-brand-deep dark:from-brand-soft dark:to-brand"
        />
      </motion.header>

      {noProfile ? (
        <motion.div variants={fadeUp} className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
          <p className="text-sm font-medium">Настройте профиль, чтобы начать</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ваши цели по калориям и макросам рассчитываются из возраста, роста,
            веса и поставленных целей.
          </p>
          <Button asChild className="mt-5">
            <Link to="/dashboard/profile">
              Настроить профиль <ArrowRight className="size-4" />
            </Link>
          </Button>
        </motion.div>
      ) : (
        <>
          {/* Calorie card */}
          <motion.section
            variants={fadeUp}
            className="card-lift rounded-xl border bg-card p-6 shadow-elev-1 sm:p-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="label-overline text-muted-foreground">Калории</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight num sm:text-5xl">
                  <CountUp value={calories} />
                  <span className="text-xl text-muted-foreground">
                    {" "}
                    / {targets!.calories.toLocaleString("ru-RU")}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {calories > targets!.calories
                    ? "Превышение нормы"
                    : `Осталось ${(targets!.calories - calories).toLocaleString("ru-RU")} ккал`}
                </p>
              </div>
              <ProgressRing
                value={calories}
                max={targets!.calories}
                size={120}
                stroke={9}
                color="var(--brand)"
                delay={0.1}
              >
                <span className="text-2xl font-semibold num">
                  <CountUp value={calPct} />%
                </span>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  от цели
                </span>
              </ProgressRing>
            </div>
            <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-brand"
                initial={{ width: 0 }}
                animate={{ width: `${calPct}%` }}
                transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
              />
            </div>
          </motion.section>

          {/* Macros — кольца вместо баров */}
          <motion.section
            variants={fadeUp}
            className="card-lift grid grid-cols-3 gap-4 rounded-xl border bg-card p-6 shadow-elev-1 sm:p-8"
          >
            <MacroRing label="Белки" value={protein} target={targets!.protein} color="var(--foreground)" delay={0.2} />
            <MacroRing label="Углеводы" value={carbs} target={targets!.carbs} color="var(--muted-foreground)" delay={0.3} />
            <MacroRing label="Жиры" value={fat} target={targets!.fat} color="var(--border)" delay={0.4} />
          </motion.section>

          {/* Активность: серия дней + календарь */}
          <motion.section variants={fadeUp} className="card-lift rounded-xl border bg-card p-6 shadow-elev-1 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Flame className="size-4 text-brand" />
                <p className="label-overline text-muted-foreground">Активность</p>
              </div>
              {bestStreak > 0 && (
                <p className="text-xs text-muted-foreground">
                  Лучшая серия: {bestStreak} {pluralDays(bestStreak)} за 12 недель
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.45, ease: "easeOut", delay: 0.1 }}
                className="flex flex-col items-center"
              >
                <p className="text-5xl font-semibold tracking-tight num text-gradient">
                  {streak}
                </p>
                <p className="mt-1.5 max-w-[9rem] text-center text-xs leading-4 text-muted-foreground">
                  {streak === 0
                    ? "нет серии — начните сегодня"
                    : `${pluralDays(streak)} подряд`}
                </p>
              </motion.div>
              <div className="min-w-0 flex-1">
                <ActivityCalendar activityMap={activityMap} />
              </div>
            </div>

            <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
              Дни, когда вы записывали еду, воду, тренировки или вес. Сегодня
              обведено рамкой — сделайте запись, чтобы продлить серию.
            </p>
          </motion.section>

          {/* Вода */}
          <motion.section variants={fadeUp} className="card-lift rounded-xl border bg-card p-6 shadow-elev-1 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="label-overline flex items-center gap-1.5 text-muted-foreground">
                  <Droplets className="size-3.5 text-brand" /> Вода
                </p>
                <p className="mt-2 text-4xl font-semibold tracking-tight num sm:text-5xl">
                  <CountUp value={waterMl} />
                  <span className="text-xl text-muted-foreground">
                    {" "}
                    / {waterGoal} мл
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {waterPct >= 100
                    ? "Цель достигнута — отлично!"
                    : `Осталось ${(waterGoal - waterMl).toLocaleString("ru-RU")} мл`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
            <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className={cn(
                  "h-full rounded-full",
                  waterPct >= 100 ? "bg-brand" : "bg-brand/70",
                )}
                initial={{ width: 0 }}
                animate={{ width: `${waterPct}%` }}
                transition={{ duration: 0.9, ease: "easeOut", delay: 0.2 }}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Цель рассчитана из вашего веса: ~33 мл на кг.
            </p>
          </motion.section>

          {/* Quick stats */}
          <motion.section
            variants={fadeUp}
            className="grid gap-px overflow-hidden rounded-xl border bg-border shadow-elev-1 sm:grid-cols-3"
          >
            <div className="bg-card p-6">
              <div className="flex items-center gap-2 text-muted-foreground">
                <UtensilsCrossed className="size-4" />
                <span className="text-xs">Приёмов пищи</span>
              </div>
              <p className="mt-2 text-2xl font-semibold num">
                {todayLog!.length}
              </p>
            </div>
            <div className="bg-card p-6">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Activity className="size-4" />
                <span className="text-xs">Тренировок за неделю</span>
              </div>
              <p className="mt-2 text-2xl font-semibold num">
                {workoutsThisWeek}
              </p>
            </div>
            <div className="bg-card p-6">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Scale className="size-4" />
                <span className="text-xs">Последний вес</span>
              </div>
              <p className="mt-2 text-2xl font-semibold num">
                {weightTrend.length
                  ? `${weightTrend[weightTrend.length - 1].weightKg.toFixed(1)}`
                  : "—"}
                {weightTrend.length > 0 && (
                  <span className="text-sm text-muted-foreground"> кг</span>
                )}
              </p>
            </div>
          </motion.section>

          {/* Weight trend */}
          {weightTrend.length >= 2 && (
            <motion.section variants={fadeUp} className="card-lift rounded-xl border bg-card p-6 shadow-elev-1 sm:p-8">
              <div className="flex items-center justify-between">
                <p className="label-overline text-muted-foreground">
                  Динамика веса
                </p>
                <Link
                  to="/dashboard/progress"
                  className="text-xs text-brand underline-offset-4 hover:underline"
                >
                  Смотреть всё
                </Link>
              </div>
              {overviewProjection && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-brand">
                  <Target className="size-3.5 shrink-0" />
                  При таком темпе — {targetWeight?.toFixed(1)} кг к{" "}
                  {new Date(overviewProjection.etaDate).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                  })}
                  <span className="text-muted-foreground">
                    ({overviewProjection.ratePerWeek.toFixed(1)} кг/нед)
                  </span>
                </p>
              )}
              <div className="mt-6 flex items-end gap-2">
                {weightTrend.map((w) => (
                  <div
                    key={w._id}
                    className="flex flex-1 flex-col items-center gap-2"
                  >
                    <span className="text-[10px] num text-muted-foreground">
                      {w.weightKg.toFixed(1)}
                    </span>
                    <div
                      className="w-full rounded-sm bg-brand/80"
                      style={{
                        height: `${Math.max(
                          12,
                          (w.weightKg /
                            Math.max(...weightTrend.map((x) => x.weightKg))) *
                            72,
                        )}px`,
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {shortDate(w.date)}
                    </span>
                  </div>
                ))}
              </div>
            </motion.section>
          )}

          <Separator />

          {/* AI assistant CTA */}
          <motion.section
            variants={fadeUp}
            className="card-lift flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-6 shadow-elev-1"
          >
            <div className="flex items-center gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                <Sparkles className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Спросите ИИ-ассистента</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  «Запиши обед: курица 200 г и гречка», «Сколько белка мне
                  нужно?»
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("kilo:open-assistant"))
              }
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-elev-1 active:scale-[0.97]"
            >
              Открыть чат
            </button>
          </motion.section>

          <Separator />

          {/* Quick actions — M3 filled/tonal buttons */}
          <motion.section variants={fadeUp} className="space-y-3">
            <p className="label-overline text-muted-foreground">Быстрые действия</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild className="h-12">
                <Link to="/dashboard/meals">
                  <UtensilsCrossed className="size-4" />
                  Добавить приём пищи
                </Link>
              </Button>
              <Button asChild variant="secondary" className="h-12">
                <Link to="/dashboard/workouts">
                  <Activity className="size-4" />
                  Начать тренировку
                </Link>
              </Button>
            </div>
          </motion.section>
        </>
      )}
    </motion.div>
  );
}
