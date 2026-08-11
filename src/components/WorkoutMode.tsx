import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  BARBELL_BAR_WEIGHT_KG,
  EXERCISE_TIPS,
  isBarbellExercise,
  warmUpSets,
  type Exercise,
  type WorkoutDay,
} from "@/lib/workoutLibrary";
import {
  buildWorkoutSummary,
  loadEquipmentFor,
  recommendLoad,
  shiftAvailableWeight,
  type WorkoutSummary,
} from "@/lib/workoutIntelligence";
import { WEEKDAYS } from "@/lib/i18n";
import {
  EFFORT_COLORS,
  EFFORT_HINTS,
  EFFORT_LABELS,
  type Effort,
} from "@/lib/effort";
import {
  Check,
  ChevronDown,
  Dumbbell,
  Flame,
  Info,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Sparkles,
  Timer,
  Trophy,
  X,
} from "lucide-react";
import { cn, parseLocalNumber } from "@/lib/utils";

/** Одна запись из истории тренировок (для подстановки весов «с прошлого раза»). */
interface LogExercise {
  name: string;
  weightKg: number;
  /** Повторы из лога — чтобы показывать «прошлый раз: 70 × 10». */
  reps?: number;
  /** RPE подхода (1–10), если заполнен. */
  rpe?: number;
  /** Подходы (для объёма в сводке завершения). */
  sets?: number;
  /** Фактические подходы прошлой сессии — «прошлый раз» списком. */
  setDetails?: { weightKg: number; reps: number; rpe?: number }[];
}
interface WorkoutLogLite {
  date: string;
  /** Усилие тренировки (фолбэк для рекомендации, когда RPE нет). */
  effort?: Effort;
  exercises: LogExercise[];
}

interface SavedExercise {
  name: string;
  sets: number;
  reps: number;
  weightKg: number;
  rpe?: number;
  /** Фактические подходы (вес × повторы × RPE) — пишутся в лог. */
  setDetails: { weightKg: number; reps: number; rpe?: number }[];
}

/** Ввод одного подхода в редакторе: вес/повторы строками (как в полях). */
interface SetInput {
  weight: string;
  reps: string;
  rpe?: number;
}

/** Повторы по умолчанию из строки плана: «8-12» → 8, «5» → 5, «30s» → 30. */
function defaultReps(planReps: string): number {
  return parseInt(planReps.match(/\d+/)?.[0] ?? "10", 10);
}

/** Число без лишних нулей: 22.5 → «22.5», 20 → «20». */
function fmtWeight(kg: number): string {
  return String(Math.round(kg * 10) / 10);
}

/** «Прошлый раз» для упражнения: полная прошлая сессия (подходы) при наличии
 *  setDetails, иначе — вес × повторы (или только вес/повторы). */
function lastSessionLabel(
  last:
    | {
        weightKg: number;
        reps?: number;
        setDetails?: { weightKg: number; reps: number; rpe?: number }[];
      }
    | undefined,
): string | null {
  if (!last) return null;
  if (last.setDetails && last.setDetails.length > 0) {
    return last.setDetails
      .slice(0, 4)
      .map((d) =>
        d.weightKg > 0
          ? `${fmtWeight(d.weightKg)} × ${d.reps}`
          : `${d.reps} повт`,
      )
      .join(" · ");
  }
  if (last.reps) {
    return last.weightKg > 0
      ? `${fmtWeight(last.weightKg)} × ${last.reps}`
      : `${last.reps} повт`;
  }
  return last.weightKg > 0 ? `${fmtWeight(last.weightKg)} кг` : null;
}

interface WorkoutModeProps {
  day: WorkoutDay;
  planName: string;
  weekLabel?: string;
  logs: WorkoutLogLite[];
  saving: boolean;
  onClose: () => void;
  onSave: (exercises: SavedExercise[], effort: Effort) => Promise<void>;
}

/** Формат mm:ss из секунд. */
function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const EFFORT_KEYS: Effort[] = ["easy", "normal", "hard"];

/** Черновик тренировки в sessionStorage: введённые подходы не теряются при
 *  закрытии режима, перезагрузке или случайном выходе. Очищается после
 *  успешного сохранения. */
interface DraftState {
  done: Record<string, number>;
  weights: Record<string, string>;
  setLogs: Record<string, Record<number, SetInput>>;
  /** Редактируемый подход — возвращаемся к тому, где остановились. */
  activeSet: { name: string; idx: number } | null;
}

function readDraft(key: string): DraftState | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftState>;
    return {
      done: parsed.done ?? {},
      weights: parsed.weights ?? {},
      setLogs: parsed.setLogs ?? {},
      activeSet: parsed.activeSet ?? null,
    };
  } catch {
    return null;
  }
}

/** Полноэкранный режим тренировки: отмечаем подходы, отдыхаем по таймеру,
 *  веса подставлены из последних логов («с прошлого раза»), под упражнениями —
 *  подсказки по технике и разминочные подходы. Для штанговых упражнений вес
 *  указывается общим (гриф 20 кг включён), разминка не опускается ниже
 *  пустого грифа. После завершения спрашиваем «насколько тяжело было» —
 *  оценка влияет на веса следующего цикла. */
export function WorkoutMode({
  day,
  planName,
  weekLabel,
  logs,
  saving,
  onClose,
  onSave,
}: WorkoutModeProps) {
  // Ключ черновика: день плана + название — разные дни не затирают друг друга.
  const draftKey = `kilo:workout-draft:${day.day}:${planName}`;
  // Восстановленный черновик (лениво, один раз при монтировании).
  const [draft] = useState(() => readDraft(draftKey));

  // Сколько подходов сделано по каждому упражнению (по имени).
  const [done, setDone] = useState<Record<string, number>>(() => draft?.done ?? {});
  // Открытые подсказки по технике.
  const [tipsOpen, setTipsOpen] = useState<Record<string, boolean>>({});
  // Таймер отдыха: сколько секунд осталось, от какого значения, идёт ли отсчёт.
  const [rest, setRest] = useState<{
    left: number;
    total: number;
    running: boolean;
  } | null>(null);
  // Подготовленные к сохранению упражнения — ожидают оценку усилия.
  const [pending, setPending] = useState<SavedExercise[] | null>(null);
  // Редактируемый подход: упражнение + номер (1-based).
  const [activeSet, setActiveSet] = useState<{ name: string; idx: number } | null>(
    () => draft?.activeSet ?? null,
  );
  // Данные подходов (вес × повторы × RPE) по упражнению и номеру подхода.
  const [setLogs, setSetLogs] = useState<Record<string, Record<number, SetInput>>>(
    () => draft?.setLogs ?? {},
  );
  // Сводка завершённой тренировки — показывается после сохранения.
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);

  // «С прошлого раза»: самый свежий лог, где встречалось это упражнение — вес и
  // повторы. Вычисляется ДО weights, чтобы ленивый инициализатор useState мог
  // его прочитать.
  const lastEntries = useMemo(() => {
    const map: Record<
      string,
      {
        weightKg: number;
        reps?: number;
        rpe?: number;
        effort?: Effort;
        setDetails?: { weightKg: number; reps: number; rpe?: number }[];
      }
    > = {};
    for (const log of [...logs].sort((a, b) => b.date.localeCompare(a.date))) {
      for (const ex of log.exercises) {
        // Упражнения с собственным весом логируются с весом 0 — для них
        // «прошлый раз» важен по повторам (вес тела не меняется).
        const bodyweight =
          ex.weightKg === 0 && loadEquipmentFor(ex.name) === "bodyweight";
        if (map[ex.name] === undefined && (ex.weightKg > 0 || bodyweight)) {
          map[ex.name] = {
            weightKg: ex.weightKg,
            reps: ex.reps,
            rpe: ex.rpe,
            effort: log.effort,
            setDetails: ex.setDetails,
          };
        }
      }
    }
    return map;
  }, [logs]);

  // Введённые веса (кг) по упражнениям. Ленивая инициализация: веса из последних
  // логов, иначе — стартовые из плана (выполняется один раз при открытии дня).
  const [weights, setWeights] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const ex of day.exercises) {
      const last = lastEntries[ex.name];
      initial[ex.name] =
        draft?.weights?.[ex.name] ??
        (last !== undefined && last.weightKg > 0
          ? String(last.weightKg)
          : ex.weightKg != null
            ? String(ex.weightKg)
            : "");
    }
    return initial;
  });

  // Черновик в sessionStorage: каждый сдвиг состояния подхватывается сразу.
  // Ошибки хранилища (приватный режим) не должны ломать тренировку.
  useEffect(() => {
    try {
      const payload: DraftState = { done, weights, setLogs, activeSet };
      sessionStorage.setItem(draftKey, JSON.stringify(payload));
    } catch {
      /* не критично — черновик просто не сохранится */
    }
  }, [done, weights, setLogs, activeSet, draftKey]);

  // Ссылки на секции упражнений — для автопрокрутки к следующему подходу.
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  // Какие упражнения уже были закрыты на прошлом рендере — чтобы прокручивать
  // ровно в момент «закрытия», а не при каждом изменении done.
  const prevComplete = useRef<Set<string>>(new Set());

  // Автопрокрутка: упражнение закрыто → плавно ведём к следующему недоделанному.
  // Пользователь не думает, куда идти дальше — экран сам подводит.
  useEffect(() => {
    for (const ex of day.exercises) {
      const complete = (done[ex.name] ?? 0) >= ex.sets;
      if (complete && !prevComplete.current.has(ex.name)) {
        const idx = day.exercises.indexOf(ex);
        const next =
          day.exercises
            .slice(idx + 1)
            .find((e) => (done[e.name] ?? 0) < e.sets) ??
          day.exercises.find((e) => (done[e.name] ?? 0) < e.sets);
        sectionRefs.current[next?.name ?? ""]?.scrollIntoView?.({
          behavior: "smooth",
          block: "start",
        });
        break;
      }
    }
    prevComplete.current = new Set(
      day.exercises
        .filter((e) => (done[e.name] ?? 0) >= e.sets)
        .map((e) => e.name),
    );
  }, [done, day.exercises]);

  // Отсчёт таймера отдыха. Зависим только от флага running (а не от всего
  // объекта rest), чтобы интервал не пересоздавался на каждый тик.
  const restRunning = rest?.running ?? false;
  useEffect(() => {
    if (!restRunning) return;
    const id = window.setInterval(() => {
      setRest((r) => {
        if (!r || !r.running) return r;
        const left = r.left - 1;
        return left <= 0 ? { ...r, left: 0, running: false } : { ...r, left };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [restRunning]);

  const totalSets = day.exercises.reduce((s, ex) => s + ex.sets, 0);
  const doneSets = day.exercises.reduce(
    (s, ex) => s + Math.min(done[ex.name] ?? 0, ex.sets),
    0,
  );
  const progress = totalSets === 0 ? 0 : Math.round((doneSets / totalSets) * 100);
  const allDone = doneSets >= totalSets;

  /** Отметить/снять подход с номером setIdx (1-based) у упражнения ex. */
  const toggleSet = (ex: Exercise, setIdx: number) => {
    const current = Math.min(done[ex.name] ?? 0, ex.sets);
    const next = current === setIdx ? setIdx - 1 : setIdx;
    if (next > current) {
      // Подход отмечен — открываем редактор только что выполненного подхода
      // (вес × повторы × RPE): вписал данные → отметил следующий круг.
      setActiveSet({ name: ex.name, idx: setIdx });
      // Подход добавился — запускаем таймер отдыха, если ещё не идёт.
      if (ex.restSeconds > 0) {
        setRest((r) =>
          r && r.left > 0
            ? r
            : { left: ex.restSeconds, total: ex.restSeconds, running: true },
        );
      }
    } else {
      // Подход снят — удаляем данные снятых и более поздних подходов.
      setSetLogs((m) => {
        const exLogs = m[ex.name] ? { ...m[ex.name] } : {};
        for (let i = next + 1; i <= current; i++) delete exLogs[i];
        const copy = { ...m };
        if (Object.keys(exLogs).length === 0) delete copy[ex.name];
        else copy[ex.name] = exLogs;
        return copy;
      });
      setActiveSet((a) => (a?.name === ex.name && a.idx > next ? null : a));
    }
    setDone((d) => ({ ...d, [ex.name]: next }));
  };

  /** «Завершить тренировку» — собираем упражнения (по подходам из setLogs,
   *  фолбэк — вес упражнения и повторы из плана) и спрашиваем оценку усилия. */
  const handleFinish = () => {
    const exercises = day.exercises
      .filter((ex) => (done[ex.name] ?? 0) > 0)
      .map((ex) => {
        const doneCount = Math.min(done[ex.name] ?? 0, ex.sets);
        const fallbackWeight = parseLocalNumber(weights[ex.name] ?? "") ?? 0;
        const fallbackReps = defaultReps(ex.reps);
        const sets = Array.from({ length: doneCount }, (_, i) => {
          const input = setLogs[ex.name]?.[i + 1];
          return {
            weightKg:
              parseLocalNumber(input?.weight ?? "") ?? fallbackWeight,
            reps: Math.max(
              1,
              Math.round(
                parseLocalNumber(input?.reps ?? "") ?? fallbackReps,
              ),
            ),
            ...(input?.rpe !== undefined ? { rpe: input.rpe } : {}),
          };
        });
        const lastSet = sets[sets.length - 1];
        return {
          name: ex.name,
          sets: doneCount,
          reps: lastSet.reps,
          weightKg: lastSet.weightKg,
          ...(lastSet.rpe !== undefined ? { rpe: lastSet.rpe } : {}),
          setDetails: sets,
        };
      });
    if (exercises.length === 0) return;
    setPending(exercises);
  };

  /** Сохранили + сразу показываем сводку (сравнение с прошлой тренировкой). */
  const submitEffort = async (effort: Effort) => {
    if (!pending) return;
    await onSave(pending, effort);
    // Тренировка сохранена — черновик больше не нужен.
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      /* не критично */
    }
    setSummary(
      buildWorkoutSummary({
        exercises: pending,
        prevLogs: logs.map((l) => ({
          date: l.date,
          exercises: l.exercises.map((e) => ({
            name: e.name,
            sets: e.sets ?? 1,
            reps: e.reps ?? 0,
            weightKg: e.weightKg,
            ...(e.setDetails ? { setDetails: e.setDetails } : {}),
          })),
        })),
        planMinutes: day.approxMinutes,
      }),
    );
    setPending(null);
  };

  // Портал в document.body: полноэкранный оверлей не должен попадать в
  // stacking context страницы (`isolate` на обёртке) — иначе sticky-шапки
  // приложения (z-10/z-20) перехватывают клики над шапкой режима тренировки.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <header className="border-b px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {planName}
              {weekLabel ? ` · ${weekLabel}` : ""} ·{" "}
              {WEEKDAYS[day.day]} — {day.focus}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Dumbbell className="size-4 text-muted-foreground" />
              <p className="text-sm font-semibold sm:text-base">
                {doneSets} из {totalSets} подходов
              </p>
              {allDone && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="size-3" /> Готово
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Закрыть режим тренировки"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="mx-auto mt-3 max-w-3xl">
          <Progress value={progress} className="h-1.5" />
        </div>
      </header>

      {/* Sticky rest timer */}
      {rest && rest.left > 0 && (
        <div className="border-b bg-secondary/30">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <Timer className="size-4 text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Отдых
              </span>
              <span
                role="timer"
                aria-live="polite"
                aria-label="Таймер отдыха"
                className={cn(
                  "font-mono text-2xl font-semibold tabular-nums num",
                  rest.left <= 10 && "text-orange-500",
                  rest.left <= 5 && "animate-pulse text-red-500",
                )}
              >
                {fmt(rest.left)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {rest.running ? (
                <Button
                  size="default"
                  variant="outline"
                  onClick={() => setRest((r) => (r ? { ...r, running: false } : r))}
                >
                  <Pause className="size-4" /> Пауза
                </Button>
              ) : (
                <Button
                  size="default"
                  variant="outline"
                  onClick={() => setRest((r) => (r ? { ...r, running: true } : r))}
                >
                  <Play className="size-4" /> Продолжить
                </Button>
              )}
              <Button
                size="icon"
                className="size-10"
                variant="ghost"
                onClick={() => setRest((r) => (r ? { ...r, left: r.total, running: true } : r))}
                aria-label="Сбросить таймер"
              >
                <RotateCcw className="size-4" />
              </Button>
              <Button
                size="icon"
                className="size-10"
                variant="ghost"
                onClick={() => setRest(null)}
                aria-label="Пропустить отдых"
              >
                <SkipForward className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Exercises */}
      <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {day.notes && day.notes.length > 0 && (
            <div className="space-y-1.5 rounded-lg border bg-secondary/30 px-4 py-3">
              {day.notes.map((n, i) => (
                <p key={i} className="text-xs leading-5 text-muted-foreground">
                  {n}
                </p>
              ))}
            </div>
          )}

          {day.exercises.map((ex) => {
            const doneCount = Math.min(done[ex.name] ?? 0, ex.sets);
            const complete = doneCount >= ex.sets;
            const last = lastEntries[ex.name];
            const tip = EXERCISE_TIPS[ex.name];
            const barbell = isBarbellExercise(ex.name);
            const equipment = loadEquipmentFor(ex.name);
            // −/+ шагают к реально доступному следующему весу снаряда
            // (гантели 20 → 22.5, гири 20 → 24, штанга 70 → 72.5).
            const weightStep = (dir: 1 | -1) => {
              const cur = parseLocalNumber(weights[ex.name] ?? "") ?? 0;
              if (cur <= 0) return;
              const next = shiftAvailableWeight(
                equipment,
                cur,
                dir,
                barbell ? BARBELL_BAR_WEIGHT_KG : 2.5,
              );
              if (next !== undefined) {
                setWeights((w) => ({ ...w, [ex.name]: fmtWeight(next) }));
              }
            };
            const warmups = warmUpSets(
              parseLocalNumber(weights[ex.name] ?? "") ?? undefined,
              barbell ? BARBELL_BAR_WEIGHT_KG : 2.5,
            );
            // «Рекомендация KILO»: вес × повторы на сегодня по прошлой
            // тренировке (RPE/усилие). При недостатке данных — не выдаётся.
            const rec = recommendLoad({
              name: ex.name,
              planWeightKg: ex.weightKg,
              planReps: ex.reps,
              last,
              effort: last?.effort,
            });
            // Редактируемый подход: значения по умолчанию — вес упражнения и
            // повторы из плана (или введённые ранее для этого подхода).
            const setInput: SetInput =
              activeSet?.name === ex.name
                ? (setLogs[ex.name]?.[activeSet.idx] ?? {
                    weight: weights[ex.name] ?? "",
                    reps: String(defaultReps(ex.reps)),
                  })
                : { weight: "", reps: "" };
            const updateSetInput = (patch: Partial<SetInput>) => {
              if (!activeSet || activeSet.name !== ex.name) return;
              const current =
                setLogs[ex.name]?.[activeSet.idx] ?? {
                  weight: weights[ex.name] ?? "",
                  reps: String(defaultReps(ex.reps)),
                };
              setSetLogs((m) => ({
                ...m,
                [ex.name]: {
                  ...(m[ex.name] ?? {}),
                  [activeSet.idx]: { ...current, ...patch },
                },
              }));
            };
            return (
              <section
                key={ex.name}
                ref={(node) => {
                  sectionRefs.current[ex.name] = node;
                }}
                className={cn(
                  "rounded-lg border p-4 transition-colors",
                  complete && "border-emerald-500/40 bg-emerald-500/5",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{ex.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground num">
                      {ex.sets} × {ex.reps}
                      {ex.restSeconds > 0
                        ? ` · отдых ${ex.restSeconds} с`
                        : ""}
                    </p>
                  </div>
                  {complete && (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check className="size-3.5" />
                    </span>
                  )}
                </div>

                {/* Разминочные подходы (пересчитываются от введённого веса).
                    Для штанги не опускаются ниже пустого грифа (20 кг). */}
                {warmups.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-secondary/40 px-3 py-2">
                    <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <Flame className="size-3.5 text-orange-500" />
                      Разминка
                    </span>
                    {warmups.map((w, i) => (
                      <span
                        key={i}
                        className="rounded-sm bg-background px-1.5 py-0.5 text-[11px] num text-muted-foreground"
                      >
                        {w.weightKg} кг × {w.reps}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                  {/* Подходы */}
                  <div className="flex items-center gap-2">
                    {Array.from({ length: ex.sets }, (_, i) => {
                      const setIdx = i + 1;
                      const active = setIdx <= doneCount;
                      return (
                        <button
                          key={setIdx}
                          type="button"
                          onClick={() => toggleSet(ex, setIdx)}
                          aria-label={`Подход ${setIdx} — ${active ? "отметить как невыполненный" : "отметить выполненным"}`}
                          className={cn(
                            "flex size-11 items-center justify-center rounded-full border text-xs font-semibold transition-all",
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-border text-muted-foreground hover:border-foreground/40",
                          )}
                        >
                          {active ? <Check className="size-4" /> : setIdx}
                        </button>
                      );
                    })}
                  </div>

                  {/* Вес: −/+ шагают к реально доступному весу снаряда */}
                  <div className={equipment === "bodyweight" ? "w-28" : "w-36"}>
                    <div className="flex items-center gap-1">
                      {equipment !== "bodyweight" && (
                        <button
                          type="button"
                          onClick={() => weightStep(-1)}
                          disabled={!parseLocalNumber(weights[ex.name] ?? "")}
                          className="flex size-10 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-40"
                          aria-label={`Предыдущий вес для ${ex.name}`}
                        >
                          <Minus className="size-4" />
                        </button>
                      )}
                      <div className="relative min-w-0 flex-1">
                        <Input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="—"
                          value={weights[ex.name] ?? ""}
                          onChange={(e) =>
                            setWeights((w) => ({
                              ...w,
                              [ex.name]: e.target.value.replace(/[^\d.,]/g, ""),
                            }))
                          }
                          className="h-10 pr-8 text-right"
                          aria-label={`Вес для ${ex.name}`}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
                          кг
                        </span>
                      </div>
                      {equipment !== "bodyweight" && (
                        <button
                          type="button"
                          onClick={() => weightStep(1)}
                          disabled={!parseLocalNumber(weights[ex.name] ?? "")}
                          className="flex size-10 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-40"
                          aria-label={`Следующий вес для ${ex.name}`}
                        >
                          <Plus className="size-4" />
                        </button>
                      )}
                    </div>
                    {barbell ? (
                      <p className="mt-1 text-right text-[10px] text-muted-foreground">
                        общий вес · гриф {BARBELL_BAR_WEIGHT_KG} кг включён
                      </p>
                    ) : lastSessionLabel(last) ? (
                      <p className="mt-1 text-right text-[10px] text-muted-foreground">
                        прошлый раз:{" "}
                        <span className="num">{lastSessionLabel(last)}</span>
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Рекомендация KILO — рекомендуемая нагрузка по прошлому разу */}
                {rec.kind !== "new" && rec.weightKg !== undefined && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-brand/25 bg-brand/5 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-brand">
                        <Sparkles className="size-3.5" />
                        Рекомендация KILO
                        {rec.stepLabel ? ` · ${rec.stepLabel}` : ""}
                      </p>
                      <p className="mt-1 text-sm font-semibold num">
                        {rec.weightKg} кг
                        {rec.repsMin !== null && rec.repsMax !== null
                          ? rec.repsMin === rec.repsMax
                            ? ` × ${rec.repsMin}`
                            : ` × ${rec.repsMin}–${rec.repsMax}`
                          : ""}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                        {rec.reasoning}
                      </p>
                    </div>
                    {parseLocalNumber(weights[ex.name] ?? "") !== rec.weightKg && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setWeights((w) => ({
                            ...w,
                            [ex.name]: String(rec.weightKg),
                          }))
                        }
                      >
                        Применить {rec.weightKg} кг
                      </Button>
                    )}
                  </div>
                )}

                {/* Редактор подхода: вес × повторы × RPE. Открывается при отметке
                    подхода; изменения сразу пишутся в setLogs и попадут в лог. */}
                {activeSet?.name === ex.name && (
                  <div className="mt-3 rounded-md border bg-secondary/30 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Подход {activeSet.idx}
                      </span>
                      <div className="relative w-16">
                        <Input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={setInput.weight}
                          onChange={(e) =>
                            updateSetInput({
                              weight: e.target.value.replace(/[^\d.,]/g, ""),
                            })
                          }
                          className="h-9 pr-5 text-right"
                          aria-label={`Вес подхода ${activeSet.idx} для ${ex.name}`}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[10px] text-muted-foreground">
                          кг
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">×</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={setInput.reps}
                        onChange={(e) =>
                          updateSetInput({
                            reps: e.target.value.replace(/[^\d]/g, ""),
                          })
                        }
                        className="h-9 w-14 text-center"
                        aria-label={`Повторы подхода ${activeSet.idx} для ${ex.name}`}
                      />
                      <div className="ml-auto flex items-center gap-1">
                        {[7, 8, 9, 10].map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() =>
                              updateSetInput({
                                rpe: setInput.rpe === r ? undefined : r,
                              })
                            }
                            aria-pressed={setInput.rpe === r}
                            aria-label={`RPE ${r} для подхода ${activeSet.idx}`}
                            className={cn(
                              "flex size-9 items-center justify-center rounded-full border text-xs font-semibold num transition-colors",
                              setInput.rpe === r
                                ? "border-transparent bg-foreground text-background"
                                : "border-border text-muted-foreground hover:border-foreground/40",
                            )}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Техника выполнения */}
                {tip && (
                  <div className="mt-3 border-t pt-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setTipsOpen((t) => ({ ...t, [ex.name]: !t[ex.name] }))
                      }
                      className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                      aria-expanded={!!tipsOpen[ex.name]}
                    >
                      <Info className="size-3.5" />
                      Техника выполнения
                      <ChevronDown
                        className={cn(
                          "size-3 transition-transform",
                          tipsOpen[ex.name] && "rotate-180",
                        )}
                      />
                    </button>
                    {tipsOpen[ex.name] && (
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {tip}
                      </p>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-background/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            <Flame className="mr-1 inline size-3.5" />
            Отмечайте подходы — таймер отдыха запустится сам. Разминка
            пересчитывается от введённого веса.
          </p>
          <Button onClick={handleFinish} disabled={doneSets === 0 || saving} className="min-w-44">
            {saving ? "Сохранение…" : "Завершить тренировку"}
            <Check className="size-4" />
          </Button>
        </div>
      </footer>

      {/* Оценка усилия после завершения */}
      {pending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg">
            <p className="text-sm font-semibold">Насколько тяжело было?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ответ повлияет на веса в следующем цикле: легче — прибавим,
              тяжело — дадим восстановиться.
            </p>
            <div className="mt-4 space-y-2">
              {EFFORT_KEYS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => submitEffort(e)}
                  disabled={saving}
                  className="flex w-full items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm font-medium transition-colors hover:border-foreground/40 hover:bg-muted disabled:opacity-60"
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "size-2.5 rounded-full",
                        EFFORT_COLORS[e],
                      )}
                    />
                    {EFFORT_LABELS[e]}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {EFFORT_HINTS[e]}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="mt-3 w-full text-center text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Вернуться к тренировке
            </button>
          </div>
        </div>
      )}

      {/* Сводка завершённой тренировки: факты + сравнение с прошлым разом */}
      {summary && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Check className="size-5" strokeWidth={3} />
              </div>
              <div className="min-w-0">
                <p className="m3-title-medium">Тренировка завершена</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {summary.exerciseCount} упражн.
                  {summary.exerciseCount === 1 ? "е" : summary.exerciseCount < 5 ? "ия" : "ий"} ·{" "}
                  {summary.setCount} подходов
                  {summary.minutes ? ` · ≈ ${summary.minutes} мин` : ""}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-secondary/40 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Объём
                </p>
                <p className="num mt-1 text-lg font-semibold">
                  {Math.round(summary.tonnage).toLocaleString("ru-RU")} кг
                </p>
              </div>
              <div className="rounded-lg bg-secondary/40 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Повторы
                </p>
                <p className="num mt-1 text-lg font-semibold">{summary.totalReps}</p>
              </div>
            </div>

            {summary.tonnageDeltaPct !== null &&
              summary.tonnageDeltaPct !== 0 && (
                <p
                  className={cn(
                    "mt-3 flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium",
                    summary.tonnageDeltaPct > 0
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                  )}
                >
                  <Flame className="size-3.5" />
                  Объём{" "}
                  {summary.tonnageDeltaPct > 0
                    ? `+${Math.round(summary.tonnageDeltaPct)}%`
                    : `${Math.round(summary.tonnageDeltaPct)}%`}{" "}
                  к прошлой тренировке
                </p>
              )}

            {summary.prs.length > 0 && (
              <p className="mt-3 flex items-center gap-1.5 rounded-md bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                <Trophy className="size-3.5" />
                Лучший результат: {summary.prs.join(", ")}
              </p>
            )}

            <Button className="mt-4 w-full" onClick={onClose}>
              Готово
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
