import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ChartCard, LegendChip } from "@/components/chart-card";
import { ProgressRing } from "@/components/progress-ring";
import { PageAurora } from "@/components/page-aurora";
import { PageLoading } from "@/components/page-loading";
import { ChartScene } from "@/components/illustrations";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { CHART_HEIGHT, SVGAreaChart, SVGBarChart } from "@/lib/charts";
import { computeTargets, waterGoal } from "@/lib/nutrition";
import { lastNDays, shortDate, todayKey } from "@/lib/dates";
import { describeProjection, projectGoal } from "@/lib/projection";
import {
  exportWeights,
  exportMeals,
  exportWorkouts,
  exportWater,
  exportFoods,
} from "@/lib/export";
import { buildNextWeekPlan, buildWeeklyInsight } from "@/lib/digest";
import {
  Scale,
  Flame,
  UtensilsCrossed,
  Activity,
  TrendingDown,
  TrendingUp,
  Target,
  Download,
  GlassWater,
  Apple,
  CalendarDays,
  Sparkles,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { UNITS } from "@/lib/i18n";
import { WATER_RING } from "@/components/rings/colors";
import { cn } from "@/lib/utils";
import { useTrack } from "@/hooks/use-track";
import { Link } from "react-router";

const PERIODS = [
  { value: 7, label: "7 дней" },
  { value: 30, label: "30 дней" },
  { value: 90, label: "90 дней" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

function PeriodToggle({
  value,
  onChange,
}: {
  value: Period;
  onChange: (v: Period) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PERIODS.map((p) => (
        <Chip
          key={p.value}
          selected={value === p.value}
          onClick={() => onChange(p.value)}
        >
          {p.label}
        </Chip>
      ))}
    </div>
  );
}

/** Плитка «Итогов недели»: иконка, крупное значение, подсказка и прогресс-бар. */
function WeekTile({
  icon: Icon,
  label,
  value,
  hint,
  pct,
  color,
  delay = 0,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  /** 0–100; null — без бара (например, дельта веса). */
  pct: number | null;
  color: string;
  delay?: number;
}) {
  return (
    <div className="rounded-xl border bg-surface-container-low/60 p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" style={{ color }} />
        <span className="text-[10px] uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="num mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>
      {pct !== null && (
        <div className="mt-3 h-1.5 min-w-0 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
            transition={{ duration: 0.7, ease: "easeOut", delay }}
          />
        </div>
      )}
    </div>
  );
}

function EmptyChart({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex h-[220px] flex-col items-center justify-center gap-2.5 text-muted-foreground">
      <ChartScene className="h-16 w-24 opacity-90" />
      <span className="flex size-9 items-center justify-center rounded-full bg-secondary/60">
        {icon}
      </span>
      <p className="max-w-[220px] text-center text-xs">{text}</p>
    </div>
  );
}

export default function Progress() {
  const track = useTrack();
  // Просмотр недельного обзора — событие retention-воронки (один раз за сессию).
  useEffect(() => {
    track("weekly_review_opened");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const profile = useQuery(api.profiles.getMyProfile);
  // Графики/тренды: лимиты вместо полной выгрузки (730 записей ≈ 2 года
  // ежедневных замеров — для чартов с запасом; экспорт «Скачать свои данные»
  // остаётся без лимита и выгружает всё).
  const weights = useQuery(api.weightEntries.listMyWeights, { limit: 730 });
  const workoutLogs = useQuery(api.workouts.listLogs, { limit: 500 });
  const waterLogs = useQuery(api.water.listMyWater, { limit: 730 });
  const foods = useQuery(api.foods.listMyFoods, {});
  // Итоги за последние 7 дней — та же сводка, что уходит в письмо по
  // понедельникам (src/convex/digest.ts): вес, питание, тренировки, вода.
  const weeklyDigest = useQuery(api.digest.getMyWeeklyDigest);

  const [period, setPeriod] = useState<Period>(30);
  const days = useMemo(() => lastNDays(period), [period]);

  // Итоги дней считаются на сервере (getDailyTotals): график получает одну
  // строку на дату вместо тысяч записей дневника целиком (projection+sum).
  const dailyTotals = useQuery(api.mealLog.getDailyTotals, {
    from: days[0],
    to: days[days.length - 1],
  });
  // Для экспорта нужны все записи питания, а не только за выбранный период.
  const allMeals = useQuery(api.mealLog.getByRange, {
    from: "0000-01-01",
    to: "9999-12-31",
  });

  const targets = profile ? computeTargets(profile) : null;
  const targetWeight = profile?.targetWeightKg ?? null;

  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];

  // Цели для оценки воды/тренировок берём из профиля, как на главном экране.
  const waterTargetMl = profile ? waterGoal(profile.weightKg) : 2000;
  const trainingTarget = profile?.preferredTrainingDays ?? 3;

  const weeklyInsight = useMemo(
    () =>
      weeklyDigest
        ? buildWeeklyInsight(weeklyDigest, { waterTargetMl, trainingTarget })
        : "",
    [weeklyDigest, waterTargetMl, trainingTarget],
  );

  // «На следующей неделе» — один конкретный шаг вперёд из сводки недели.
  const nextWeekPlan = useMemo(
    () =>
      weeklyDigest
        ? buildNextWeekPlan(weeklyDigest, {
            waterTargetMl,
            trainingTarget,
            proteinTargetG: targets?.protein ?? null,
          })
        : "",
    [weeklyDigest, waterTargetMl, trainingTarget, targets],
  );

  // Плитки «Итогов недели»: значения и бары от сводки за окно.
  const weekTiles = useMemo(() => {
    const d = weeklyDigest;
    const pct = (v: number | null, target: number) =>
      v !== null && target > 0 ? Math.round((v / target) * 100) : 0;
    return [
      {
        key: "weight",
        icon: Scale,
        label: "Вес",
        value:
          d?.weightDeltaKg !== null && d?.weightDeltaKg !== undefined
            ? `${d.weightDeltaKg > 0 ? "+" : ""}${d.weightDeltaKg.toFixed(1)} кг`
            : "—",
        hint:
          d?.weightDeltaKg !== null && d?.weightDeltaKg !== undefined
            ? "изменение за неделю"
            : "нужно 2+ замера",
        pct: null as number | null,
        color: "var(--brand)",
      },
      {
        key: "workouts",
        icon: Activity,
        label: "Тренировки",
        value: String(d?.workoutCount ?? 0),
        hint: `из ${trainingTarget} за неделю`,
        pct: pct(d?.workoutCount ?? 0, trainingTarget),
        color: "var(--accent-activity)",
      },
      {
        key: "nutrition",
        icon: UtensilsCrossed,
        label: "Питание",
        value: d?.caloriePct !== null && d?.caloriePct !== undefined ? `${d.caloriePct}%` : "—",
        hint:
          d?.caloriePct !== null && d?.caloriePct !== undefined
            ? "среднее от цели по калориям"
            : "запишите приёмы пищи",
        pct: d?.caloriePct ?? null,
        color: "var(--macro-protein)",
      },
      {
        key: "water",
        icon: GlassWater,
        label: "Вода",
        value:
          d?.avgWaterMl !== null && d?.avgWaterMl !== undefined
            ? `${(d.avgWaterMl / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} л`
            : "—",
        hint: "в среднем в день",
        pct: pct(d?.avgWaterMl ?? null, waterTargetMl),
        color: WATER_RING.base,
      },
      {
        key: "consistency",
        icon: Flame,
        label: "Активность",
        value: `${d?.trackedDays ?? 0}/7`,
        hint: "дней с записями",
        pct: pct(d?.trackedDays ?? 0, 7),
        color: "#f59e0b",
      },
    ] as const;
  }, [weeklyDigest, trainingTarget, waterTargetMl]);

  const openAssistant = () =>
    window.dispatchEvent(new CustomEvent("kilo:open-assistant"));

  // Количество подписей на оси X: чем длиннее период, тем реже.
  const labelInterval = Math.max(0, Math.floor(period / 8) - 1);

  const weightData = useMemo(() => {
    return [...(weights ?? [])]
      .filter((w) => w.date >= rangeStart && w.date <= rangeEnd)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((w) => ({ date: shortDate(w.date), weight: w.weightKg }));
  }, [weights, rangeStart, rangeEnd]);

  const weightDelta = useMemo(() => {
    if (weightData.length < 2) return null;
    return weightData[weightData.length - 1].weight - weightData[0].weight;
  }, [weightData]);

  // Прогноз достижения цели: линейная регрессия по всем замерам.
  const projection = useMemo(() => {
    if (!targetWeight) return null;
    return projectGoal(
      (weights ?? []).map((w) => ({ date: w.date, weightKg: w.weightKg })),
      targetWeight,
    );
  }, [weights, targetWeight]);

  // Текущий (последний по дате) вес — для объяснения прогноза («осталось X кг»).
  const latestWeightKg = useMemo(() => {
    const sorted = [...(weights ?? [])].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    return sorted.length > 0 ? sorted[sorted.length - 1].weightKg : null;
  }, [weights]);

  // Пройденный путь к цели: от первого замера к текущему, доля от всего
  // расстояния до целевого веса. Работает в обе стороны (похудение и набор):
  // старт = 0%, достижение цели = 100%. Перебор (goalProgress > 1) — цель
  // достигнута и пройдена дальше: кольцо загорается зелёным «цель достигнута».
  const goalProgress = useMemo(() => {
    if (!targetWeight) return 0;
    const sorted = [...(weights ?? [])].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    if (sorted.length === 0) return 0;
    const start = sorted[0].weightKg;
    const current = sorted[sorted.length - 1].weightKg;
    const span = targetWeight - start;
    if (Math.abs(span) < 0.01) return 1; // уже на цели
    // Верхний предел не клампим: перебор = «прошли цель» (зелёная подсветка).
    return Math.max(0, (current - start) / span);
  }, [weights, targetWeight]);

  const calorieData = useMemo(() => {
    const byDate = new Map((dailyTotals ?? []).map((t) => [t.date, t.calories]));
    return days.map((d) => ({
      date: shortDate(d),
      calories: byDate.get(d) ?? 0,
    }));
  }, [dailyTotals, days]);

  const macroData = useMemo(() => {
    const byDate = new Map(
      (dailyTotals ?? []).map((t) => [t.date, { p: t.protein, c: t.carbs, f: t.fat }]),
    );
    return days.map((d) => {
      const cur = byDate.get(d) ?? { p: 0, c: 0, f: 0 };
      return {
        date: shortDate(d),
        Белки: Math.round(cur.p),
        Углеводы: Math.round(cur.c),
        Жиры: Math.round(cur.f),
      };
    });
  }, [dailyTotals, days]);

  const workoutData = useMemo(() => {
    const weeks = Math.max(1, Math.ceil(period / 7));
    const out: { label: string; sessions: number }[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - ((now.getDay() + 6) % 7) - i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      const count = (workoutLogs ?? []).filter((l) => {
        const d = new Date(l.date + "T00:00:00");
        return d >= start && d < end;
      }).length;
      out.push({ label: `Н-${weeks - i}`, sessions: count });
    }
    return out;
  }, [workoutLogs, period]);

  const workoutsInPeriod = (workoutLogs ?? []).filter(
    (l) => l.date >= rangeStart && l.date <= rangeEnd,
  ).length;

  const caloriesEmpty = calorieData.every((d) => d.calories === 0);
  const macrosEmpty = macroData.every(
    (d) => d.Белки === 0 && d.Углеводы === 0 && d.Жиры === 0,
  );
  const workoutsEmpty = workoutData.every((d) => d.sessions === 0);

  const loading =
    profile === undefined ||
    weights === undefined ||
    dailyTotals === undefined ||
    allMeals === undefined ||
    workoutLogs === undefined ||
    waterLogs === undefined ||
    foods === undefined ||
    weeklyDigest === undefined;

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div className="relative isolate mx-auto max-w-4xl space-y-10">
      <PageAurora />
      <header>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-overline text-muted-foreground">Прогресс</p>
            <h1 className="m3-headline-large mt-2">
              Тренды
            </h1>
            <div
              aria-hidden
              className="mt-3 h-1 w-14 rounded-full bg-gradient-to-r from-brand to-brand-deep dark:from-brand-soft dark:to-brand"
            />
          </div>
          <PeriodToggle value={period} onChange={setPeriod} />
          <ChartScene className="hidden h-20 w-32 shrink-0 sm:block" />
        </div>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Ваши данные в графиках. Последовательность окупается — маленькие
          ежедневные шаги превращаются в заметные тренды за недели.
        </p>
      </header>

      {/* ── Итоги недели: сводка, которая уходит в письмо по понедельникам ── */}
      <section className="card-lift rounded-xl border bg-card p-6 shadow-elev-1 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label-overline flex items-center gap-1.5 text-muted-foreground">
              <CalendarDays className="size-3.5" />
              Ваша неделя
            </p>
            <h2 className="m3-title-large mt-1">Итоги за 7 дней</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            та же сводка приходит на почту по понедельникам
          </p>
        </div>

        {weeklyDigest && weeklyDigest.hasData ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {weekTiles.map((t, i) => (
                <WeekTile
                  key={t.key}
                  icon={t.icon}
                  label={t.label}
                  value={t.value}
                  hint={t.hint}
                  pct={t.pct}
                  color={t.color}
                  delay={0.05 * i}
                />
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-3 rounded-xl border border-brand/20 bg-gradient-to-br from-brand/10 to-transparent p-4 sm:flex-row sm:items-center">
              <Sparkles className="size-5 shrink-0 text-brand" />
              <p className="min-w-0 flex-1 text-sm leading-relaxed">
                <span className="font-medium text-foreground">
                  AI-разбор недели.{" "}
                </span>
                <span className="text-muted-foreground">{weeklyInsight}</span>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={openAssistant}
              >
                <Sparkles className="size-3.5" />
                Спросить коуча
              </Button>
            </div>

            {/* Следующий шаг: неделя не только объясняет прошлое, но и
                формирует, что делать дальше. */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-4">
              <div className="flex min-w-0 items-start gap-3">
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-brand" />
                <p className="min-w-0 text-sm leading-relaxed">
                  <span className="font-medium text-foreground">
                    На следующей неделе:{" "}
                  </span>
                  <span className="text-muted-foreground">{nextWeekPlan}</span>
                </p>
              </div>
              {/* Замкнутый недельный цикл: обзор → конкретный шаг → Today,
                  где шаг уже виден в чек-листе и у коуча. */}
              <Button asChild size="sm">
                <Link
                  to="/dashboard"
                  onClick={() => track("next_week_plan_viewed")}
                >
                  <ArrowRight className="size-3.5" />
                  Начать новую неделю
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Неделя начинается с первой записи — добавьте воду, приём пищи или
              тренировку, и здесь появятся итоги: вес, питание, активность и
              последовательность.
            </p>
          </div>
        )}
      </section>

      {/* Карточка-инсайт: прогноз достижения цели (и состояние «цель
          достигнута», когда прогноз уже не строится — projectGoal честно
          возвращает null после пересечения цели). */}
      {targetWeight && (projection || goalProgress >= 1) && (
        <section className="card-lift overflow-hidden rounded-xl border bg-card shadow-elev-1">
          <div className="flex flex-wrap items-center justify-between gap-4 p-6 sm:p-8">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                <Target className="size-5" />
              </div>
              <div className="min-w-0">
                {goalProgress >= 1 ? (
                  <>
                    <p className="label-overline text-muted-foreground">
                      Цель достигнута
                    </p>
                    <p className="m3-title-large mt-0.5">
                      {targetWeight.toFixed(1)} кг — вы справились! 🎉
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Осталось удержать результат — малые ежедневные шаги по-прежнему окупаются.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="label-overline text-muted-foreground">
                      Прогноз по текущему темпу
                    </p>
                    <p className="m3-title-large mt-0.5">
                      {targetWeight?.toFixed(1)} кг — около{" "}
                      {new Date(projection!.etaDate).toLocaleDateString("ru-RU", {
                        day: "numeric",
                        month: "long",
                      })}
                    </p>
                    {latestWeightKg !== null && (
                      <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                        {describeProjection(
                          projection!,
                          targetWeight!,
                          latestWeightKg,
                          todayKey(),
                        )}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
            <ProgressRing
              value={goalProgress * 100}
              max={100}
              size={92}
              stroke={7}
              color="var(--brand)"
              // Достижение цели — позитив: зелёный перебор, а не красный.
              overColor="var(--macro-over)"
              delay={0.1}
            >
              {goalProgress > 1 ? (
                <>
                  <span className="text-lg font-semibold num" style={{ color: "var(--macro-over)" }}>
                    +{Math.round((goalProgress - 1) * 100)}%
                  </span>
                  <span
                    className="text-[9px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--macro-over)" }}
                  >
                    цель достигнута
                  </span>
                </>
              ) : (
                <>
                  <span className="text-lg font-semibold num">
                    {Math.round(goalProgress * 100)}%
                  </span>
                  <span
                    className={
                      goalProgress >= 1
                        ? "text-[9px] font-semibold uppercase tracking-wider text-[var(--macro-over)]"
                        : "text-[9px] uppercase tracking-wider text-muted-foreground"
                    }
                  >
                    {goalProgress >= 1 ? "цель достигнута" : `к цели ${targetWeight?.toFixed(1)} кг`}
                  </span>
                </>
              )}
            </ProgressRing>
          </div>
        </section>
      )}

      {!targets ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Настройте профиль, чтобы видеть цели на графиках.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Вес */}
          <ChartCard
            title="Вес"
            subtitle={
              targetWeight
                ? `Замеры за ${period} дн. · пунктир — цель`
                : `Замеры за ${period} дн.`
            }
            legend={
              <>
                <LegendChip color="var(--brand)" label="Вес (кг)" />
                {targetWeight !== null && (
                  <LegendChip
                    color="var(--muted-foreground)"
                    dashed
                    label={`Цель ${targetWeight.toFixed(1)} кг`}
                  />
                )}
                {weightDelta !== null && (
                  <span
                    className={cn(
                      "flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em]",
                      weightDelta < 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400",
                    )}
                  >
                    {weightDelta < 0 ? (
                      <TrendingDown className="size-3" />
                    ) : (
                      <TrendingUp className="size-3" />
                    )}
                    {weightDelta > 0 ? "+" : ""}
                    {weightDelta.toFixed(1)} кг
                  </span>
                )}
              </>
            }
          >
            {weightData.length < 2 ? (
              <EmptyChart
                icon={<Scale className="size-5" />}
                text={
                  targetWeight
                    ? `Записывайте вес, чтобы увидеть путь к цели ${targetWeight.toFixed(1)} кг.`
                    : "Записывайте вес в профиле, чтобы построить кривую."
                }
              />
            ) : (
              <SVGAreaChart
                key={`weight-${period}`}
                data={weightData}
                xKey="date"
                yKey="weight"
                name="Вес (кг)"
                height={CHART_HEIGHT}
                labelInterval={labelInterval}
                yDomainPad={1}
                referenceY={targetWeight ?? undefined}
                referenceLabel={
                  targetWeight ? `Цель ${targetWeight.toFixed(1)}` : undefined
                }
                color="var(--brand)"
              />
            )}
          </ChartCard>

          {/* Калории */}
          <ChartCard
            title="Калории"
            subtitle={`Последние ${period} дней против цели`}
            legend={
              <>
                <LegendChip color="var(--brand)" label="Потреблено" />
                <LegendChip
                  color="var(--muted-foreground)"
                  dashed
                  label={`Цель ${targets.calories.toLocaleString("ru-RU")} ккал`}
                />
              </>
            }
          >
            {caloriesEmpty ? (
              <EmptyChart
                icon={<Flame className="size-5" />}
                text="Записывайте приёмы пищи в дневнике — здесь появится линия калорий."
              />
            ) : (
              <SVGBarChart
                key={`cal-${period}`}
                data={calorieData}
                xKey="date"
                series={[{ key: "calories", name: UNITS.kcal, fill: "var(--brand)" }]}
                height={CHART_HEIGHT}
                labelInterval={labelInterval}
                referenceY={targets.calories}
                referenceLabel="Цель"
              />
            )}
          </ChartCard>

          {/* Макросы */}
          <ChartCard
            title="Макросы"
            subtitle={`Белки · Углеводы · Жиры, последние ${period} дн. (г)`}
            legend={
              <>
                <LegendChip color="var(--macro-protein)" label="Белки" />
                <LegendChip color="var(--macro-carbs)" label="Углеводы" />
                <LegendChip color="var(--macro-fat)" label="Жиры" />
              </>
            }
          >
            {macrosEmpty ? (
              <EmptyChart
                icon={<UtensilsCrossed className="size-5" />}
                text="Записывайте еду — макросы по дням появятся здесь."
              />
            ) : (
              <SVGBarChart
                key={`mac-${period}`}
                data={macroData}
                xKey="date"
                series={[
                  { key: "Белки", name: "Белки", fill: "var(--macro-protein)" },
                  { key: "Углеводы", name: "Углеводы", fill: "var(--macro-carbs)" },
                  { key: "Жиры", name: "Жиры", fill: "var(--macro-fat)" },
                ]}
                height={CHART_HEIGHT}
                labelInterval={labelInterval}
              />
            )}
          </ChartCard>

          {/* Тренировки */}
          <ChartCard
            title="Тренировки"
            subtitle={`Выполненные тренировки по неделям за ${period} дн.`}
            legend={
              <LegendChip color="var(--accent-activity)" label="Сессий в неделю" />
            }
          >
            {workoutsEmpty ? (
              <EmptyChart
                icon={<Activity className="size-5" />}
                text="Запишите первую тренировку из плана — появится недельная активность."
              />
            ) : (
              <SVGBarChart
                key={`wk-${period}`}
                data={workoutData}
                xKey="label"
                series={[
                  {
                    key: "sessions",
                    name: "Тренировки",
                    fill: "var(--accent-activity)",
                  },
                ]}
                height={CHART_HEIGHT}
                allowDecimals={false}
              />
            )}
          </ChartCard>
        </div>
      )}

      {/* Stat strip */}
      <section className="grid gap-px overflow-hidden rounded-xl border bg-border shadow-elev-1 sm:grid-cols-4">
        {[
          {
            icon: Flame,
            label: "Средние калории",
            value: (
              calorieData.reduce((s, d) => s + d.calories, 0) / days.length
            ).toFixed(0),
          },
          {
            icon: UtensilsCrossed,
            label: "Приёмов пищи",
            value: String(
              (dailyTotals ?? []).reduce((s, t) => s + t.count, 0),
            ),
          },
          {
            icon: Activity,
            label: "Тренировок",
            value: String(workoutsInPeriod),
          },
          {
            icon: Scale,
            label: "Замеров веса",
            value: String(weightData.length),
          },
        ].map((s) => (
          <div key={s.label} className="bg-background p-5">
            <s.icon className="size-4 text-muted-foreground" />
            <p className="mt-2 text-xl font-semibold num">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </section>

      {/* Экспорт данных */}
      <section className="card-lift rounded-xl border bg-card p-6 shadow-elev-1 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="label-overline flex items-center gap-1.5 text-muted-foreground">
              <Download className="size-3.5" />
              Экспорт данных
            </p>
            <h2 className="m3-title-large mt-1">Скачать свои данные</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              CSV-файлы открываются в Excel и Google Sheets. Данные принадлежат
              вам — заберите их в любой момент.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportWeights(
                  (weights ?? []).map((w) => ({
                    date: w.date,
                    weightKg: w.weightKg,
                  })),
                )
              }
            >
              <Scale className="size-3.5" />
              Вес ({weights?.length ?? 0})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportMeals(
                  (allMeals ?? []).map((e) => ({
                    date: e.date,
                    mealType: e.mealType,
                    name: e.name,
                    quantity: e.quantity,
                    calories: e.calories,
                    protein: e.protein,
                    carbs: e.carbs,
                    fat: e.fat,
                  })),
                )
              }
            >
              <UtensilsCrossed className="size-3.5" />
              Питание ({allMeals?.length ?? 0})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportWorkouts(workoutLogs ?? [])}
            >
              <Activity className="size-3.5" />
              Тренировки ({workoutLogs?.length ?? 0})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportWater(
                  (waterLogs ?? []).map((w) => ({
                    date: w.date,
                    amountMl: w.amountMl,
                  })),
                )
              }
            >
              <GlassWater className="size-3.5" />
              Вода ({waterLogs?.length ?? 0})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportFoods(
                  (foods ?? []).map((f) => ({
                    name: f.name,
                    amount: f.amount,
                    unit: f.unit,
                    calories: f.calories,
                    protein: f.protein,
                    carbs: f.carbs,
                    fat: f.fat,
                  })),
                )
              }
            >
              <Apple className="size-3.5" />
              Продукты ({foods?.length ?? 0})
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
