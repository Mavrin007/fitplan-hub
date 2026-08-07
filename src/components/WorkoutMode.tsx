import { useEffect, useMemo, useState } from "react";
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
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Timer,
  X,
} from "lucide-react";
import { cn, parseLocalNumber } from "@/lib/utils";

/** Одна запись из истории тренировок (для подстановки весов «с прошлого раза»). */
interface LogExercise {
  name: string;
  weightKg: number;
}
interface WorkoutLogLite {
  date: string;
  exercises: LogExercise[];
}

interface SavedExercise {
  name: string;
  sets: number;
  reps: number;
  weightKg: number;
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
  // Сколько подходов сделано по каждому упражнению (по имени).
  const [done, setDone] = useState<Record<string, number>>({});
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

  // Вес «с прошлого раза»: самый свежий лог, где встречалось это упражнение.
  // Вычисляется ДО weights, чтобы ленивый инициализатор useState мог его прочитать.
  const lastWeights = useMemo(() => {
    const map: Record<string, number> = {};
    for (const log of [...logs].sort((a, b) => b.date.localeCompare(a.date))) {
      for (const ex of log.exercises) {
        if (map[ex.name] === undefined && ex.weightKg > 0) {
          map[ex.name] = ex.weightKg;
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
      const last = lastWeights[ex.name];
      initial[ex.name] =
        last !== undefined
          ? String(last)
          : ex.weightKg != null
            ? String(ex.weightKg)
            : "";
    }
    return initial;
  });

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
    setDone((d) => {
      const current = Math.min(d[ex.name] ?? 0, ex.sets);
      const next = current === setIdx ? setIdx - 1 : setIdx;
      // Подход добавился — запускаем таймер отдыха, если ещё не идёт.
      if (next > current && ex.restSeconds > 0) {
        setRest((r) =>
          r && r.left > 0
            ? r
            : { left: ex.restSeconds, total: ex.restSeconds, running: true },
        );
      }
      return { ...d, [ex.name]: next };
    });
  };

  /** «Завершить тренировку» — собираем упражнения и спрашиваем оценку усилия. */
  const handleFinish = () => {
    const exercises = day.exercises
      .filter((ex) => (done[ex.name] ?? 0) > 0)
      .map((ex) => ({
        name: ex.name,
        sets: Math.min(done[ex.name] ?? 0, ex.sets),
        reps: parseInt(ex.reps.match(/^(\d+)/)?.[1] ?? "10", 10),
        weightKg: parseLocalNumber(weights[ex.name] ?? "") ?? 0,
      }));
    if (exercises.length === 0) return;
    setPending(exercises);
  };

  const submitEffort = async (effort: Effort) => {
    if (!pending) return;
    await onSave(pending, effort);
  };

  return (
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
                  size="sm"
                  variant="outline"
                  onClick={() => setRest((r) => (r ? { ...r, running: false } : r))}
                >
                  <Pause className="size-3.5" /> Пауза
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRest((r) => (r ? { ...r, running: true } : r))}
                >
                  <Play className="size-3.5" /> Продолжить
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRest((r) => (r ? { ...r, left: r.total, running: true } : r))}
                aria-label="Сбросить таймер"
              >
                <RotateCcw className="size-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRest(null)}
                aria-label="Пропустить отдых"
              >
                <SkipForward className="size-3.5" />
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
            const last = lastWeights[ex.name];
            const tip = EXERCISE_TIPS[ex.name];
            const barbell = isBarbellExercise(ex.name);
            const warmups = warmUpSets(
              parseLocalNumber(weights[ex.name] ?? "") ?? undefined,
              barbell ? BARBELL_BAR_WEIGHT_KG : 2.5,
            );
            return (
              <section
                key={ex.name}
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
                            "flex size-9 items-center justify-center rounded-full border text-xs font-semibold transition-all",
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

                  {/* Вес */}
                  <div className="w-28">
                    <div className="relative">
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
                        className="pr-8 text-right"
                        aria-label={`Вес для ${ex.name}`}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
                        кг
                      </span>
                    </div>
                    {barbell ? (
                      <p className="mt-1 text-right text-[10px] text-muted-foreground">
                        общий вес · гриф {BARBELL_BAR_WEIGHT_KG} кг включён
                      </p>
                    ) : last !== undefined ? (
                      <p className="mt-1 text-right text-[10px] text-muted-foreground">
                        прошлый раз: <span className="num">{last} кг</span>
                      </p>
                    ) : null}
                  </div>
                </div>

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
      <footer className="border-t bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
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
    </div>
  );
}
