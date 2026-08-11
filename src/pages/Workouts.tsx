import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { WorkoutMode } from "@/components/WorkoutMode";
import { useTrack } from "@/hooks/use-track";
import { EmptyState } from "@/components/empty-state";
import { FitnessHero } from "@/components/illustrations";
import { ChartCard, LegendChip } from "@/components/chart-card";
import { PageAurora } from "@/components/page-aurora";
import { PageLoading } from "@/components/page-loading";
import { SVGBarChart } from "@/lib/charts";
import {
  applyProgression,
  equipmentSummary,
  estimateSessionMinutes,
  EXERCISE_TIPS,
  generateWorkoutTemplate,
  normalizeEquipment,
  normalizeLimitations,
  profileSignature,
  type TrainingProfile,
  type WorkoutDay,
  type WorkoutTemplate,
} from "@/lib/workoutLibrary";
import {
  ACTIVITY_LABELS,
  EXPERIENCE_LABELS,
  GENDER_LABELS,
  GOAL_LABELS,
  LIMITATION_LABELS,
  TRAINING_STYLE_LABELS,
  WEEKDAYS,
} from "@/lib/i18n";
import {
  applyEffortAdjustment,
  effortAdjustedCount,
  EFFORT_LABELS,
  type Effort,
} from "@/lib/effort";
import {
  type TrainingStyle,
} from "@/lib/nutrition";
import { todayKey, shortDate, prettyDate } from "@/lib/dates";
import {
  ArrowUpDown,
  Bike,
  ChevronDown,
  Clock,
  Dumbbell,
  Flame,
  Footprints,
  Info,
  MoveUp,
  Play,
  RefreshCw,
  Repeat,
  Timer,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Placeholder-иллюстрация тренировки (M3: градиент + иконка фокуса,
 *  единый стиль с карточками приёмов на «Питании»). */
const WORKOUT_ART: Record<string, { icon: LucideIcon; gradient: string }> = {
  "Фулбоди A": { icon: Dumbbell, gradient: "to-primary-container/50" },
  "Фулбоди B": { icon: Dumbbell, gradient: "to-primary-container/50" },
  "Жимовая": { icon: MoveUp, gradient: "to-tertiary-container/40" },
  "Тяговая": { icon: ArrowUpDown, gradient: "to-primary-container/40" },
  "Ноги": { icon: Footprints, gradient: "to-tertiary-container/50" },
  "Плечи и руки": { icon: MoveUp, gradient: "to-tertiary-container/50" },
  "Круговая": { icon: Repeat, gradient: "to-primary-container/60" },
  HIIT: { icon: Zap, gradient: "to-tertiary-container/60" },
  "Метаболический круг": { icon: Flame, gradient: "to-primary-container/40" },
  "Лёгкое кардио": { icon: Bike, gradient: "to-tertiary-container/40" },
};

/** Арт по имени фокуса с запасным вариантом. */
function workoutArt(focus: string): { icon: LucideIcon; gradient: string } {
  return (
    WORKOUT_ART[focus] ?? { icon: Dumbbell, gradient: "to-primary-container/50" }
  );
}

/** Понедельник недели для даты «YYYY-MM-DD» — по нему группируем тоннаж. */
function weekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const offset = (dt.getDay() + 6) % 7; // Пн = 0
  dt.setDate(dt.getDate() - offset);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Собирает краткий итог того, что изменилось при пересборке плана:
 *  какие поля профиля обновились (по старой сигнатуре) и сколько
 *  упражнений было заменено под новый профиль. */
function planChangeSummary(
  oldPlan: {
    name: string;
    days: { day: number; exercises: { name: string }[] }[];
  } | null,
  oldSignature: string | null,
  template: WorkoutTemplate,
  profile: TrainingProfile,
): string {
  const parts: string[] = [];

  // Что изменилось в данных профиля (порядок полей совпадает с profileSignature).
  if (oldSignature) {
    const s = oldSignature.split("|");
    if (s.length >= 8) {
      const [gender, age, height, weight, target, activity, goal, experience] = s;
      if (gender !== profile.gender)
        parts.push(`пол: ${GENDER_LABELS[profile.gender].toLowerCase()}`);
      if (age !== String(profile.age)) parts.push(`возраст: ${profile.age} лет`);
      if (height !== String(profile.heightCm))
        parts.push(`рост: ${profile.heightCm} см`);
      if (weight !== String(profile.weightKg))
        parts.push(`вес: ${profile.weightKg} кг`);
      if (target !== String(profile.targetWeightKg ?? 0))
        parts.push(`целевой вес: ${profile.targetWeightKg ?? "—"} кг`);
      if (activity !== profile.activityLevel)
        parts.push(`активность: ${ACTIVITY_LABELS[profile.activityLevel].toLowerCase()}`);
      if (goal !== profile.fitnessGoal)
        parts.push(`цель: ${GOAL_LABELS[profile.fitnessGoal].toLowerCase()}`);
      if (experience !== profile.experienceLevel)
        parts.push(`опыт: ${EXPERIENCE_LABELS[profile.experienceLevel].toLowerCase()}`);
      // 9-й сегмент (с версии с инвентарём) — отсортированные ключи инвентаря.
      const oldEquip = s[8] ?? "";
      const newEquip = normalizeEquipment(profile.equipment).slice().sort().join(",");
      if (oldEquip !== newEquip) parts.push(`инвентарь: ${equipmentSummary(profile.equipment)}`);
      // 10-й сегмент — ограничения, 11-й — предпочитаемые дни в неделю.
      const oldLimits = s[9] ?? "";
      const newLimits = normalizeLimitations(profile.limitations)
        .slice()
        .sort()
        .join(",");
      if (oldLimits !== newLimits) parts.push("учтены новые ограничения");
      if (s.length >= 11) {
        const oldDays = s[10] ?? "";
        const newDays = String(profile.preferredTrainingDays ?? "");
        if (oldDays !== newDays && newDays) parts.push(`дней в неделю: ${newDays}`);
      }
      // 12-й сегмент (с версии со стилем тренировок) — предпочтение стиля.
      if (s.length >= 12) {
        const oldStyle = s[11] ?? "";
        const newStyle = profile.trainingStyle ?? "";
        if (oldStyle !== newStyle && newStyle) {
          parts.push(`стиль: ${TRAINING_STYLE_LABELS[newStyle as TrainingStyle].toLowerCase()}`);
        }
      }
    }
  }

  // Изменения структуры плана: число тренировок и замены упражнений.
  if (oldPlan && template) {
    if (oldPlan.days.length !== template.days.length) {
      parts.push(`тренировок: ${oldPlan.days.length} → ${template.days.length}`);
    }
    let substitutions = 0;
    for (const day of template.days) {
      const oldDay = oldPlan.days.find((d) => d.day === day.day);
      if (!oldDay) continue;
      const oldNames = new Set(oldDay.exercises.map((e) => e.name));
      for (const exercise of day.exercises) {
        if (!oldNames.has(exercise.name)) substitutions++;
      }
    }
    if (substitutions > 0) parts.push(`${substitutions} замен упражнений`);
  }

  return parts.slice(0, 3).join(" · ");
}

export default function Workouts() {
  const profile = useQuery(api.profiles.getMyProfile);
  const plan = useQuery(api.workouts.getMyPlan);
  const logs = useQuery(api.workouts.listLogs, {});
  const savePlan = useMutation(api.workouts.savePlan);
  const logWorkout = useMutation(api.workouts.logWorkout);
  const deleteLog = useMutation(api.workouts.deleteLog);
  const track = useTrack();

  const [generating, setGenerating] = useState(false);
  const [trainingDay, setTrainingDay] = useState<WorkoutDay | null>(null);
  const [savingLog, setSavingLog] = useState(false);
  const [weekIdx, setWeekIdx] = useState(0);
  // Раскрытые подсказки по технике: ключ «день-упражнение».
  const [tipsOpen, setTipsOpen] = useState<Record<string, boolean>>({});
  // Выбранная запись истории для просмотра деталей.
  const [viewingLog, setViewingLog] = useState<Doc<"workoutLogs"> | null>(null);
  const generatingRef = useRef(false);

  // Слепок профиля — по нему определяется, устарел ли сохранённый план.
  const currentSignature = profile ? profileSignature(profile) : "";

  // ВАЖНО: все хуки должны вызываться до ранних return ниже, иначе React
  // ругается «Rendered more hooks than during the previous render».

  // Генерация/пересборка плана. Объявлена ДО useEffect (который её вызывает),
  // чтобы правило react-hooks/immutability не считало обращение «до объявления».
  const handleGenerate = async (silent = false) => {
    if (!profile) return;
    generatingRef.current = true;
    setGenerating(true);
    try {
      // План учитывает весь профиль: пол, возраст, рост, вес, активность,
      // целевой вес, опыт, инвентарь, ограничения и дни в неделю — влияют на
      // выбор упражнений, веса, отдых, темп и замены движений.
      let template = generateWorkoutTemplate(profile);
      // Авторегуляция: стартовые веса следующего цикла отталкиваются от
      // последних фактически поднятых весов и оценки усилия («легко/норм/тяжело»).
      template = applyEffortAdjustment(template, logs ?? []);
      await savePlan({
        name: template.name,
        adaptedFor: template.adaptedFor,
        profileSignature: currentSignature,
        goal: profile.fitnessGoal,
        experienceLevel: profile.experienceLevel,
        splitType: template.splitType,
        sessionsPerWeek: template.sessionsPerWeek,
        durationWeeks: template.durationWeeks,
        howCalculated: template.howCalculated,
        days: template.days,
        // Цикл прогрессии: 4 недели (база → +1 повтор → +2.5 кг → разгрузка).
        weeks: applyProgression(template),
      });
      setWeekIdx(0);
      // Краткий итог изменений для тоста.
      const summary = planChangeSummary(
        plan ?? null,
        plan?.profileSignature ?? null,
        template,
        profile,
      );
      const adjusted = effortAdjustedCount(template);
      const desc = [
        summary,
        adjusted > 0 ? `${adjusted} вес(а) скорректированы по усилию` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      if (!silent) {
        toast.success("План тренировок сгенерирован", {
          description: desc || undefined,
        });
      } else {
        toast.success("План обновлён под новый профиль", {
          description: desc || undefined,
        });
      }
    } catch (err) {
      console.error("[Workouts] Ошибка генерации плана тренировок:", err);
      if (!silent) toast.error("Не удалось сгенерировать план");
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  };

  // Автопересборка плана: если данные профиля изменились (вес, рост, пол,
  // возраст, активность, цель, инвентарь, ограничения), план пересобирается сам.
  useEffect(() => {
    if (!profile || !plan || generatingRef.current) return;
    if (plan.profileSignature !== currentSignature) {
      const t = window.setTimeout(() => void handleGenerate(true), 0);
      return () => window.clearTimeout(t);
    }
    // handleGenerate намеренно не в deps — иначе эффект перезапускался бы
    // на каждый рендер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSignature, plan?.profileSignature, plan != null]);

  // Недельный тоннаж: вес × повторы × подходы по всем упражнениям за неделю.
  const tonnageData = useMemo(() => {
    const byWeek = new Map<string, number>();
    for (const log of logs ?? []) {
      let sum = 0;
      for (const ex of log.exercises) {
        if (ex.weightKg > 0) sum += ex.weightKg * ex.reps * ex.sets;
      }
      if (sum === 0) continue;
      const wk = weekStart(log.date);
      byWeek.set(wk, (byWeek.get(wk) ?? 0) + sum);
    }
    return [...byWeek.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-10)
      .map(([wk, tonnage]) => ({ label: shortDate(wk), tonnage: Math.round(tonnage) }));
  }, [logs]);

  // Личные рекорды: максимальный вес по каждому упражнению.
  const prs = useMemo(() => {
    const best = new Map<
      string,
      { weightKg: number; date: string; sets: number; reps: number }
    >();
    for (const log of logs ?? []) {
      for (const ex of log.exercises) {
        if (ex.weightKg <= 0) continue;
        const cur = best.get(ex.name);
        if (!cur || ex.weightKg > cur.weightKg) {
          best.set(ex.name, {
            weightKg: ex.weightKg,
            date: log.date,
            sets: ex.sets,
            reps: ex.reps,
          });
        }
      }
    }
    return [...best.entries()]
      .sort((a, b) => b[1].weightKg - a[1].weightKg)
      .slice(0, 8)
      .map(([name, p]) => ({ name, ...p }));
  }, [logs]);

  const loading = profile === undefined || plan === undefined || logs === undefined;

  if (loading) {
    return <PageLoading />;
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="label-overline text-muted-foreground">Тренировки</p>
          <h1 className="m3-headline-large mt-2">Тренировки</h1>
        </header>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Настройте профиль, чтобы получить план тренировок под вашу цель.
          </p>
          <Button asChild className="mt-4">
            <a href="/dashboard/profile">Перейти в профиль</a>
          </Button>
        </div>
      </div>
    );
  }

  // Цикл прогрессии: недели плана, если есть (старые планы — без недель).
  const weeks = plan?.weeks && plan.weeks.length > 0 ? plan.weeks : null;
  const safeWeekIdx = weeks ? Math.min(weekIdx, weeks.length - 1) : 0;
  const currentWeek = weeks ? weeks[safeWeekIdx] : null;
  const visibleDays = currentWeek ? currentWeek.days : (plan?.days ?? []);

  /** Сохранение результата из режима тренировки (с оценкой усилия). */
  const handleSaveTraining = async (
    exercises: { name: string; sets: number; reps: number; weightKg: number }[],
    effort: Effort,
  ) => {
    if (!trainingDay) return;
    setSavingLog(true);
    try {
      await logWorkout({
        date: todayKey(),
        workoutName: `${plan?.name ?? ""} — ${trainingDay.focus}`,
        exercises,
        effort,
      });
      toast.success("Тренировка записана");
      // Не закрываем режим здесь: WorkoutMode после сохранения показывает
      // сводку («Тренировка завершена») и сам зовёт onClose по «Готово».
      void track("workout_completed", {
        exercises: exercises.length,
        sets: exercises.reduce((s, e) => s + e.sets, 0),
      });
    } catch (err) {
      console.error("[Workouts] Ошибка сохранения тренировки:", err);
      toast.error("Не удалось записать тренировку");
    } finally {
      setSavingLog(false);
    }
  };

  const handleDeleteLog = async (id: Doc<"workoutLogs">["_id"]) => {
    try {
      await deleteLog({ id });
      if (viewingLog?._id === id) setViewingLog(null);
      toast.success("Запись удалена");
    } catch (err) {
      console.error("[Workouts] Ошибка удаления записи тренировки:", err);
      toast.error("Не удалось удалить запись");
    }
  };

  const equipmentText = equipmentSummary(profile.equipment);
  const sessionsText =
    plan?.sessionsPerWeek ?? plan?.days.length ?? profile.preferredTrainingDays ?? "—";
  const cycleWeeks = plan?.durationWeeks ?? weeks?.length;

  return (
    <div className="relative isolate mx-auto max-w-4xl space-y-10">
      <PageAurora />
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="label-overline text-muted-foreground">Тренировки</p>
          <h1 className="m3-headline-large mt-2">План тренировок</h1>
          <div
            aria-hidden
            className="mt-3 h-1 w-14 rounded-full bg-gradient-to-r from-brand to-brand-deep dark:from-brand-soft dark:to-brand"
          />
        </div>
        <FitnessHero className="hidden h-24 w-32 shrink-0 sm:block" />
      </header>

      {/* Сводная карточка плана: сплит, частота, цикл и профиль, под который собран план */}
      <section className="card-lift rounded-xl border bg-card p-6 shadow-elev-1 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="label-overline text-muted-foreground">Текущий план</p>
            <h2 className="m3-title-large mt-1">
              {plan?.name ?? "Плана пока нет"}
            </h2>
            {plan ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {plan.splitType ? `${plan.splitType} · ` : ""}
                {sessionsText} тренировок в неделю
                {cycleWeeks ? ` · цикл ${cycleWeeks} недели` : ""} ·{" "}
                {GOAL_LABELS[plan.goal ?? profile.fitnessGoal].toLowerCase()}
                {profile.trainingStyle && profile.trainingStyle !== "balanced"
                  ? ` · стиль: ${TRAINING_STYLE_LABELS[profile.trainingStyle].toLowerCase()}`
                  : ""}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Для {EXPERIENCE_LABELS[profile.experienceLevel].toLowerCase()} ·{" "}
                {GOAL_LABELS[profile.fitnessGoal].toLowerCase()}
                {profile.trainingStyle && profile.trainingStyle !== "balanced"
                  ? ` · стиль: ${TRAINING_STYLE_LABELS[profile.trainingStyle].toLowerCase()}`
                  : ""}
              </p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {GENDER_LABELS[profile.gender].toLowerCase()}, {profile.age} лет ·{" "}
              {profile.heightCm} см / {profile.weightKg} кг ·{" "}
              {ACTIVITY_LABELS[profile.activityLevel].toLowerCase()} · инвентарь:{" "}
              {equipmentText}
              {profile.limitations && profile.limitations.length > 0 ? (
                <> · ограничения:{" "}
                  {profile.limitations
                    .map((l) => LIMITATION_LABELS[l])
                    .join(", ")}
                </>
              ) : null}
            </p>
            {plan?.adaptedFor && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <Info className="size-3.5 shrink-0" />
                {plan.adaptedFor}
              </p>
            )}
            {generating && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <RefreshCw className="size-3.5 animate-spin" />
                Пересобираем план под обновлённые данные профиля…
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {plan && (
              <Button variant="outline" onClick={() => handleGenerate(false)} disabled={generating}>
                <RefreshCw className={cn("size-4", generating && "animate-spin")} />
                {generating ? "Пересборка…" : "Сгенерировать заново"}
              </Button>
            )}
            {!plan && (
              <Button onClick={() => handleGenerate(false)} disabled={generating}>
                <Dumbbell className="size-4" />
                {generating ? "Генерация…" : "Сгенерировать план"}
              </Button>
            )}
          </div>
        </div>

        {/* Как считается этот план */}
        {plan?.howCalculated && plan.howCalculated.length > 0 && (
          <div className="mt-5 rounded-md bg-secondary/40 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Info className="size-3.5 text-primary" />
              Как этот план рассчитан
            </p>
            <ul className="mt-2 space-y-1.5">
              {plan.howCalculated.map((bullet, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-xs leading-5 text-muted-foreground"
                >
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/60" />
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* План по неделям */}
      {plan ? (
        <section className="space-y-5">
          {/* Переключатель недель цикла — M3 чипы */}
          {weeks && currentWeek && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-1 text-xs font-medium text-muted-foreground">
                  Неделя цикла
                </p>
                {weeks.map((w, i) => (
                  <Chip
                    key={w.week}
                    selected={i === safeWeekIdx}
                    onClick={() => setWeekIdx(i)}
                    ariaLabel={`Неделя ${w.week} цикла`}
                  >
                    Неделя {w.week}
                  </Chip>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {currentWeek.label}
                </span>
                {currentWeek.weightNote && (
                  <span className="ml-1.5">· {currentWeek.weightNote}</span>
                )}
              </p>
            </div>
          )}

          {visibleDays
            .slice()
            .sort((a, b) => a.day - b.day)
            .map((day, idx) => {
              const art = workoutArt(day.focus);
              const ArtIcon = art.icon;
              // Длительность сессии считаем из подходов и отдыха (хранимые
              // в БД планы могут быть старой версии, без approxMinutes).
              const minutes = estimateSessionMinutes(day as WorkoutDay);
              return (
                <motion.div
                  key={day.day}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: "easeOut", delay: idx * 0.06 }}
                  className="card-lift overflow-hidden rounded-xl border bg-card shadow-elev-1"
                >
                  {/* Placeholder-иллюстрация тренировки */}
                  <div
                    className={cn(
                      "relative h-20 overflow-hidden bg-gradient-to-br from-secondary-container/80",
                      art.gradient,
                    )}
                  >
                    <ArtIcon className="absolute -right-2 -bottom-3 size-24 rotate-[-8deg] text-on-primary-container/25" />
                    <div className="absolute inset-0 flex items-end justify-between p-3">
                      <span className="label-overline text-on-secondary-container">
                        {WEEKDAYS[day.day]} · {day.focus}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="gap-1 bg-background/50">
                          <Clock className="size-3" />
                          ≈ {minutes} мин
                        </Badge>
                        <Badge className="gap-1">
                          <Dumbbell className="size-3" />
                          {day.exercises.length} упражнений
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Разминка дня */}
                  {day.warmup && day.warmup.length > 0 && (
                    <div className="border-b bg-secondary/40 px-4 py-3">
                      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <Flame className="size-3 text-primary" />
                        Разминка
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {day.warmup.map((w, i) => (
                          <li
                            key={i}
                            className="flex gap-2 text-xs leading-5 text-muted-foreground"
                          >
                            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-secondary-foreground/30" />
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Персональные заметки (замены под профиль) */}
                  {day.notes && day.notes.length > 0 && (
                    <div className="space-y-1.5 border-b bg-secondary/40 px-4 py-3">
                      {day.notes.map((n, i) => (
                        <p
                          key={i}
                          className="flex gap-2 text-xs leading-5 text-muted-foreground"
                        >
                          <Info className="mt-0.5 size-3 shrink-0" />
                          {n}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Упражнения — чипы в стиле приёмов пищи */}
                  <div className="p-4">
                    <ul className="space-y-2">
                      {day.exercises.map((ex) => {
                        const tipKey = `${day.day}-${ex.name}`;
                        const tip = EXERCISE_TIPS[ex.name];
                        const tipOpen = !!tipsOpen[tipKey];
                        return (
                          <li key={tipKey}>
                            <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low px-3 py-2.5">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {ex.name}
                                </p>
                                <p className="mt-1 flex flex-wrap items-center gap-1.5">
                                  {ex.priority && (
                                    <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                                      приоритет
                                    </span>
                                  )}
                                  {ex.tempo && (
                                    <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                                      темп {ex.tempo}
                                    </span>
                                  )}
                                  {ex.weightNote && (
                                    <span className="rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                      {ex.weightNote}
                                    </span>
                                  )}
                                  {tip && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setTipsOpen((t) => ({ ...t, [tipKey]: !t[tipKey] }))
                                      }
                                      aria-expanded={tipOpen}
                                      aria-label={
                                        tipOpen
                                          ? `Скрыть технику для ${ex.name}`
                                          : `Показать технику для ${ex.name}`
                                      }
                                      className={cn(
                                        "flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                                        tipOpen
                                          ? "bg-foreground/10 text-foreground"
                                          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                                      )}
                                    >
                                      <Info className="size-3" />
                                      техника
                                      <ChevronDown
                                        className={cn(
                                          "size-2.5 transition-transform",
                                          tipOpen && "rotate-180",
                                        )}
                                      />
                                    </button>
                                  )}
                                </p>
                              </div>
                              {/* Подходы × повторы + отдых с иконкой — видно и на мобильных */}
                              <div className="shrink-0 text-right">
                                <p className="text-sm font-medium num">
                                  {ex.weightKg != null ? `${ex.weightKg} кг · ` : ""}
                                  {ex.sets} × {ex.reps}
                                </p>
                                <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-muted-foreground">
                                  <Timer className="size-3" />
                                  {ex.restSeconds > 0 ? `${ex.restSeconds} с` : "—"}
                                </p>
                              </div>
                            </div>
                            {tip && tipOpen && (
                              <p className="mt-1.5 flex gap-2 rounded-md bg-secondary/40 px-2.5 py-2 text-xs leading-5 text-muted-foreground">
                                <Info className="mt-0.5 size-3 shrink-0" />
                                {tip}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    {/* Главное действие — filled M3 кнопка */}
                    <Button
                      className="mt-3 w-full"
                      onClick={() => {
                        track("workout_started", { focus: day.focus });
                        setTrainingDay(day);
                      }}
                    >
                      <Play className="size-4" />
                      Начать тренировку
                    </Button>
                  </div>
                </motion.div>
              );
            })}
        </section>
      ) : (
        <EmptyState
          icon={Dumbbell}
          illustration={<FitnessHero className="h-24 w-32" />}
          title="Плана тренировок пока нет"
          description={
            <>
              Сгенерируйте 4-недельный цикл с прогрессией нагрузки: база → те же
              веса +1 повтор → +2.5 кг → разгрузка. Упражнения подбираются под
              весь профиль — рост, вес, пол, возраст, цель, опыт, инвентарь и
              ограничения — а стартовые веса следующего цикла автоматически
              подстраиваются под ваши прошлые тренировки и оценку усилия
              («легко / норм / тяжело»).
            </>
          }
          action={
            <Button onClick={() => handleGenerate(false)} disabled={generating}>
              <Dumbbell className="size-4" />
              {generating ? "Генерация…" : "Сгенерировать план"}
            </Button>
          }
        />
      )}

      <Separator />

      {/* Статистика: тоннаж и рекорды */}
      <section className="space-y-4">
        <div>
          <p className="label-overline text-muted-foreground">Статистика</p>
          <h2 className="m3-title-large mt-1">Объём и рекорды</h2>
        </div>

        <ChartCard
          title="Недельный тоннаж"
          subtitle="Тоннаж = вес × повторы × подходы. Рост тоннажа по неделям — признак прогресса в силе и массе."
          legend={<LegendChip color="var(--accent-activity)" label="Тоннаж (кг)" />}
        >
          {tonnageData.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center">
              <EmptyState
                compact
                icon={Dumbbell}
                illustration={<FitnessHero className="h-20 w-24" />}
                title="Пока нет графика объёма"
                description="Запишите пару тренировок в режиме «Начать тренировку» — недельный тоннаж появится здесь."
              />
            </div>
          ) : (
            <SVGBarChart
              key={`tonnage-${tonnageData.length}`}
              data={tonnageData}
              xKey="label"
              series={[
                { key: "tonnage", name: "Тоннаж", fill: "var(--accent-activity)" },
              ]}
              height={200}
              labelInterval={Math.max(0, Math.floor(tonnageData.length / 6) - 1)}
              maxBarSize={36}
              yTickFormatter={(v: number) =>
                v >= 1000 ? `${(v / 1000).toFixed(1)}т` : `${v}`
              }
              tooltipFormatter={(value: number) =>
                `${Number(value).toLocaleString("ru-RU")} кг`
              }
            />
          )}
        </ChartCard>

        {/* Личные рекорды */}
        <div className="card-lift rounded-xl border bg-card p-6 shadow-elev-1">
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-amber-500" />
            <h2 className="m3-title-small">Личные рекорды</h2>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Максимальный рабочий вес по каждому упражнению. Например: жим лёжа —
            40 кг × 10, приседания — 60 кг × 8.
          </p>
          {prs.length === 0 ? (
            <EmptyState
              compact
              icon={Trophy}
              title="Рекордов пока нет"
              description="Они появятся после первых записанных тренировок — максимальный рабочий вес по каждому упражнению."
              className="mt-4"
            />
          ) : (
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {prs.map((pr) => (
                <div
                  key={pr.name}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{pr.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground num">
                      {shortDate(pr.date)} · {pr.sets} × {pr.reps}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-semibold num text-amber-700 dark:text-amber-400">
                      {pr.weightKg}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      кг
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Separator />

      {/* Recent logs — клик по записи открывает детали */}
      <section className="space-y-4">
        <div>
          <p className="label-overline text-muted-foreground">История</p>
          <h2 className="m3-title-large mt-1">Выполненные тренировки</h2>
        </div>

        {(logs ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока нет записей — нажмите «Начать тренировку» у любой сессии выше.
          </p>
        ) : (
          <div className="card-lift overflow-hidden rounded-xl border bg-card shadow-elev-1">
            <div className="divide-y">
              {(logs ?? []).slice(0, 12).map((l) => (
                <div key={l._id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <button
                    type="button"
                    onClick={() => setViewingLog(l)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity hover:opacity-75"
                    aria-label={`Открыть детали тренировки от ${shortDate(l.date)}`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <Dumbbell className="size-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{l.workoutName}</span>
                      <span className="block text-xs text-muted-foreground num">
                        {shortDate(l.date)} · {l.exercises.length} упражнений ·{" "}
                        {l.exercises.reduce((s, e) => s + e.sets, 0)} подходов
                        {l.effort ? ` · ${EFFORT_LABELS[l.effort].toLowerCase()}` : ""}
                      </span>
                    </span>
                  </button>
                  <ConfirmDelete
                    iconOnly
                    busy={false}
                    onConfirm={() => void handleDeleteLog(l._id)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Режим тренировки — полноэкранный оверлей */}
      {trainingDay && (
        <WorkoutMode
          day={trainingDay}
          planName={plan?.name ?? ""}
          weekLabel={currentWeek?.label}
          logs={(logs ?? []).map((l) => ({
            date: l.date,
            effort: l.effort ?? undefined,
            exercises: l.exercises.map((e) => ({
              name: e.name,
              weightKg: e.weightKg,
              reps: e.reps,
              rpe: e.rpe,
            })),
          }))}
          saving={savingLog}
          onClose={() => setTrainingDay(null)}
          onSave={handleSaveTraining}
        />
      )}

      {/* Детали выполненной тренировки */}
      <Dialog
        open={viewingLog !== null}
        onOpenChange={(o) => !o && setViewingLog(null)}
      >
        <DialogContent className="max-w-md">
          {viewingLog && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">{viewingLog.workoutName}</DialogTitle>
                <DialogDescription>
                  {prettyDate(viewingLog.date)}
                  {viewingLog.effort
                    ? ` · усилие: ${EFFORT_LABELS[viewingLog.effort].toLowerCase()}`
                    : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {viewingLog.exercises.map((ex) => (
                  <div
                    key={`${ex.name}-${ex.sets}-${ex.reps}-${ex.weightKg}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low px-3 py-2.5"
                  >
                    <p className="min-w-0 truncate text-sm font-medium">{ex.name}</p>
                    <p className="shrink-0 text-sm text-muted-foreground num">
                      {ex.sets} × {ex.reps}
                      {ex.weightKg > 0 ? ` · ${ex.weightKg} кг` : ""}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  Тоннаж:{" "}
                  <span className="num font-medium text-foreground">
                    {viewingLog.exercises
                      .reduce((s, e) => s + e.weightKg * e.reps * e.sets, 0)
                      .toLocaleString("ru-RU")}{" "}
                    кг
                  </span>
                </p>
                <ConfirmDelete
                  onConfirm={() => void handleDeleteLog(viewingLog._id)}
                  label="Удалить запись"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
