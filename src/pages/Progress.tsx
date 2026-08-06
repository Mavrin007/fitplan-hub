import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { ChartCard, LegendChip } from "@/components/chart-card";
import { PageAurora } from "@/components/page-aurora";
import { ChartScene } from "@/components/illustrations";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import {
  axisProps,
  gridProps,
  tooltipStyle,
  tooltipCursor,
  barRadius,
  lineAnim,
  barAnim,
  goalLabel,
  CHART_HEIGHT,
} from "@/lib/charts";
import { computeTargets } from "@/lib/nutrition";
import { lastNDays, shortDate, todayKey } from "@/lib/dates";
import { projectGoal, humanizeDistance } from "@/lib/projection";
import {
  exportWeights,
  exportMeals,
  exportWorkouts,
  exportWater,
  exportFoods,
} from "@/lib/export";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  const profile = useQuery(api.profiles.getMyProfile);
  const weights = useQuery(api.weightEntries.listMyWeights, {});
  const workoutLogs = useQuery(api.workouts.listLogs, {});
  const waterLogs = useQuery(api.water.listMyWater, {});
  const foods = useQuery(api.foods.listMyFoods, {});

  const [period, setPeriod] = useState<Period>(30);
  const days = useMemo(() => lastNDays(period), [period]);

  const mealRange = useQuery(api.mealLog.getByRange, {
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

  const calorieData = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const e of mealRange ?? []) {
      byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.calories);
    }
    return days.map((d) => ({
      date: shortDate(d),
      calories: byDate.get(d) ?? 0,
    }));
  }, [mealRange, days]);

  const macroData = useMemo(() => {
    const byDate = new Map<string, { p: number; c: number; f: number }>();
    for (const e of mealRange ?? []) {
      const cur = byDate.get(e.date) ?? { p: 0, c: 0, f: 0 };
      byDate.set(e.date, {
        p: cur.p + e.protein,
        c: cur.c + e.carbs,
        f: cur.f + e.fat,
      });
    }
    return days.map((d) => {
      const cur = byDate.get(d) ?? { p: 0, c: 0, f: 0 };
      return {
        date: shortDate(d),
        Белки: Math.round(cur.p),
        Углеводы: Math.round(cur.c),
        Жиры: Math.round(cur.f),
      };
    });
  }, [mealRange, days]);

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
    mealRange === undefined ||
    allMeals === undefined ||
    workoutLogs === undefined ||
    waterLogs === undefined ||
    foods === undefined;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-72 animate-pulse rounded-lg border bg-muted/40" />
          <div className="h-72 animate-pulse rounded-lg border bg-muted/40" />
        </div>
      </div>
    );
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

      {/* Карточка-инсайт: прогноз достижения цели */}
      {projection && (
        <section className="card-lift overflow-hidden rounded-xl border bg-card shadow-elev-1">
          <div className="flex flex-wrap items-center justify-between gap-4 p-6 sm:p-8">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                <Target className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="label-overline text-muted-foreground">
                  Прогноз по текущему темпу
                </p>
                <p className="m3-title-large mt-0.5">
                  {targetWeight?.toFixed(1)} кг — около{" "}
                  {new Date(projection.etaDate).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                  })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Темп {projection.ratePerWeek.toFixed(1)} кг/нед · до цели{" "}
                  {humanizeDistance(projection.etaDate, todayKey())} · осталось{" "}
                  {projection.remainingKg.toFixed(1)} кг
                  {!projection.confident && " · прогноз предварительный"}
                </p>
              </div>
            </div>
            <div className="w-full max-w-56">
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Сейчас</span>
                <span>Цель {targetWeight?.toFixed(1)}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-700"
                  style={{
                    width: `${Math.min(100, Math.max(4, (projection.remainingKg / Math.max(1, projection.remainingKg + 5)) * 100))}%`,
                  }}
                />
              </div>
              <p className="mt-1.5 text-right text-[10px] text-muted-foreground num">
                путь к цели
              </p>
            </div>
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
                <LegendChip color="var(--foreground)" label="Вес (кг)" />
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
              <ResponsiveContainer key={`weight-${period}`} width="100%" height={CHART_HEIGHT}>
                <AreaChart data={weightData}>
                  <defs>
                    <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="var(--foreground)"
                        stopOpacity={0.18}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--foreground)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" interval={labelInterval} {...axisProps} />
                  <YAxis
                    domain={["dataMin - 1", "dataMax + 1"]}
                    width={34}
                    {...axisProps}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  {targetWeight && (
                    <ReferenceLine
                      y={targetWeight}
                      stroke="var(--muted-foreground)"
                      strokeDasharray="4 4"
                      label={goalLabel(`Цель ${targetWeight.toFixed(1)}`)}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="weight"
                    name="Вес (кг)"
                    stroke="var(--foreground)"
                    strokeWidth={1.5}
                    fill="url(#weightFill)"
                    activeDot={{ r: 3 }}
                    {...lineAnim}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Калории */}
          <ChartCard
            title="Калории"
            subtitle={`Последние ${period} дней против цели`}
            legend={
              <>
                <LegendChip color="var(--foreground)" label="Потреблено" />
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
              <ResponsiveContainer key={`cal-${period}`} width="100%" height={CHART_HEIGHT}>
                <BarChart data={calorieData}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" interval={labelInterval} {...axisProps} />
                  <YAxis width={34} {...axisProps} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={tooltipCursor}
                  />
                  <ReferenceLine
                    y={targets.calories}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                    label={goalLabel("Цель")}
                  />
                  <Bar
                    dataKey="calories"
                    name="ккал"
                    radius={barRadius}
                    maxBarSize={32}
                    fill="var(--foreground)"
                    {...barAnim}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Макросы */}
          <ChartCard
            title="Макросы"
            subtitle={`Белки · Углеводы · Жиры, последние ${period} дн. (г)`}
            legend={
              <>
                <LegendChip color="var(--foreground)" label="Белки" />
                <LegendChip color="var(--muted-foreground)" label="Углеводы" />
                <LegendChip color="var(--border)" label="Жиры" />
              </>
            }
          >
            {macrosEmpty ? (
              <EmptyChart
                icon={<UtensilsCrossed className="size-5" />}
                text="Записывайте еду — макросы по дням появятся здесь."
              />
            ) : (
              <ResponsiveContainer key={`mac-${period}`} width="100%" height={CHART_HEIGHT}>
                <BarChart data={macroData}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" interval={labelInterval} {...axisProps} />
                  <YAxis width={30} {...axisProps} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={tooltipCursor}
                  />
                  <Bar
                    dataKey="Белки"
                    stackId="m"
                    fill="var(--foreground)"
                    radius={[0, 0, 0, 0]}
                    {...barAnim}
                  />
                  <Bar
                    dataKey="Углеводы"
                    stackId="m"
                    fill="var(--muted-foreground)"
                    {...barAnim}
                  />
                  <Bar
                    dataKey="Жиры"
                    stackId="m"
                    fill="var(--border)"
                    radius={barRadius}
                    {...barAnim}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Тренировки */}
          <ChartCard
            title="Тренировки"
            subtitle={`Выполненные тренировки по неделям за ${period} дн.`}
            legend={<LegendChip color="var(--foreground)" label="Сессий в неделю" />}
          >
            {workoutsEmpty ? (
              <EmptyChart
                icon={<Activity className="size-5" />}
                text="Запишите первую тренировку из плана — появится недельная активность."
              />
            ) : (
              <ResponsiveContainer key={`wk-${period}`} width="100%" height={CHART_HEIGHT}>
                <BarChart data={workoutData}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis width={30} allowDecimals={false} {...axisProps} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={tooltipCursor}
                  />
                  <Bar
                    dataKey="sessions"
                    name="Тренировки"
                    fill="var(--foreground)"
                    radius={barRadius}
                    maxBarSize={32}
                    {...barAnim}
                  />
                </BarChart>
              </ResponsiveContainer>
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
            value: String((mealRange ?? []).length),
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
