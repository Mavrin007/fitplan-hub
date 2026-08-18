/**
 * Хук-состояние страницы «Тренировки» (/dashboard/workouts): запросы Convex,
 * генерация/автопересборка плана, выбор недели цикла, режим тренировки,
 * подсказки и история. Вынесен из src/pages/Workouts.tsx — страница стала
 * тонкой композицией, поведение гарантируют тесты страницы.
 */

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { useTrack } from "@/hooks/use-track";
import {
  applyProgression,
  equipmentSummary,
  generateWorkoutTemplate,
  profileSignature,
  type WorkoutDay,
} from "@/lib/workoutLibrary";
import { applyEffortAdjustment, effortAdjustedCount, type Effort } from "@/lib/effort";
import { todayKey } from "@/lib/dates";
import { planChangeSummary } from "../lib/workoutFormatting";
import { useWorkoutStats } from "./useWorkoutStats";

/** Одна неделя цикла прогрессии (схема workoutPlans.weeks). */
export interface CycleWeek {
  week: number;
  label: string;
  weightNote?: string;
  days: WorkoutDay[];
}

export interface WorkoutPlanState {
  // Данные
  profile: ReturnType<typeof useQuery<typeof api.profiles.getMyProfile>>;
  plan: ReturnType<typeof useQuery<typeof api.workouts.getMyPlan>>;
  logs: ReturnType<typeof useQuery<typeof api.workouts.listLogs>>;
  loading: boolean;
  // Неделя цикла
  weeks: CycleWeek[] | null;
  safeWeekIdx: number;
  currentWeek: CycleWeek | null;
  visibleDays: WorkoutDay[];
  weekIdx: number;
  setWeekIdx: (i: number) => void;
  // Состояние страницы
  generating: boolean;
  trainingDay: WorkoutDay | null;
  setTrainingDay: (d: WorkoutDay | null) => void;
  savingLog: boolean;
  tipsOpen: Record<string, boolean>;
  setTipsOpen: Dispatch<SetStateAction<Record<string, boolean>>>;
  viewingLog: Doc<"workoutLogs"> | null;
  setViewingLog: (l: Doc<"workoutLogs"> | null) => void;
  // Действия
  handleGenerate: (silent?: boolean) => Promise<void>;
  handleSaveTraining: (
    exercises: {
      name: string;
      sets: number;
      reps: number;
      weightKg: number;
      rpe?: number;
      setDetails?: { weightKg: number; reps: number; rpe?: number }[];
    }[],
    effort: Effort,
  ) => Promise<boolean>;
  handleDeleteLog: (id: Doc<"workoutLogs">["_id"]) => Promise<void>;
  // Производные тексты
  equipmentText: string;
  sessionsText: string | number;
  cycleWeeks: number | undefined;
  // Статистика (тоннаж + рекорды)
  tonnageData: ReturnType<typeof useWorkoutStats>["tonnageData"];
  prs: ReturnType<typeof useWorkoutStats>["prs"];
}

export function useWorkoutPlan(): WorkoutPlanState {
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

  const { tonnageData, prs } = useWorkoutStats(logs);

  const loading = profile === undefined || plan === undefined || logs === undefined;

  // Цикл прогрессии: недели плана, если есть (старые планы — без недель).
  const weeks: CycleWeek[] | null =
    plan?.weeks && plan.weeks.length > 0 ? plan.weeks : null;
  const safeWeekIdx = weeks ? Math.min(weekIdx, weeks.length - 1) : 0;
  const currentWeek = weeks ? weeks[safeWeekIdx] : null;
  const visibleDays = currentWeek ? currentWeek.days : (plan?.days ?? []);

  /** Сохранение результата из режима тренировки (с оценкой усилия).
   *  Возвращает успех — WorkoutMode по нему решает, показывать ли сводку
   *  и стирать ли черновик (иначе при ошибке сети черновик терялся бы,
   *  а пользователь видел бы «Тренировка завершена» без сохранения). */
  const handleSaveTraining = async (
    exercises: {
      name: string;
      sets: number;
      reps: number;
      weightKg: number;
      rpe?: number;
      setDetails?: { weightKg: number; reps: number; rpe?: number }[];
    }[],
    effort: Effort,
  ): Promise<boolean> => {
    if (!trainingDay) return false;
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
      return true;
    } catch (err) {
      console.error("[Workouts] Ошибка сохранения тренировки:", err);
      toast.error("Не удалось записать тренировку");
      return false;
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

  const equipmentText = equipmentSummary(profile?.equipment ?? []);
  const sessionsText =
    plan?.sessionsPerWeek ?? plan?.days.length ?? profile?.preferredTrainingDays ?? "—";
  const cycleWeeks = plan?.durationWeeks ?? weeks?.length;

  return {
    profile,
    plan,
    logs,
    loading,
    weeks,
    safeWeekIdx,
    currentWeek,
    visibleDays,
    weekIdx,
    setWeekIdx,
    generating,
    trainingDay,
    setTrainingDay,
    savingLog,
    tipsOpen,
    setTipsOpen,
    viewingLog,
    setViewingLog,
    handleGenerate,
    handleSaveTraining,
    handleDeleteLog,
    equipmentText,
    sessionsText,
    cycleWeeks,
    tonnageData,
    prs,
  };
}
