import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { useTrack } from "@/hooks/use-track";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, parseLocalNumber } from "@/lib/utils";
import { formatConvexError } from "@/lib/errors";
import { motion } from "framer-motion";
import {
  LIMITATION_KEYS,
  TRAINING_STYLE_HINTS,
  type ActivityLevel,
  type ExperienceLevel,
  type FitnessGoal,
  type Gender,
  type Limitation,
  type TrainingStyle,
} from "@/lib/nutrition";
import { EQUIPMENT_KEYS, EQUIPMENT_PRESETS, type Equipment } from "@/lib/workoutLibrary";
import {
  ACTIVITY_LABELS,
  EQUIPMENT_LABELS,
  EXPERIENCE_LABELS,
  GENDER_LABELS,
  GOAL_LABELS,
  LIMITATION_LABELS,
  TRAINING_STYLE_LABELS,
} from "@/lib/i18n";
import { rememberOnboardingSkip } from "./onboarding";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Building2,
  Cable,
  CalendarDays,
  Check,
  Dumbbell,
  Grip,
  Loader2,
  PersonStanding,
  Ruler,
  Sparkles,
  Target,
  Weight,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ACTIVITY_KEYS: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];
const GOAL_KEYS: FitnessGoal[] = [
  "lose_weight",
  "maintain",
  "gain_muscle",
  "improve_endurance",
  "strength",
];
const EXPERIENCE_KEYS: ExperienceLevel[] = ["beginner", "intermediate", "advanced"];
const TRAINING_STYLE_KEYS: TrainingStyle[] = [
  "power",
  "hypertrophy",
  "functional",
  "balanced",
];
const TRAINING_DAY_OPTIONS = [1, 2, 3, 4, 5, 6];

const EQUIPMENT_ICONS: Record<Equipment, LucideIcon> = {
  barbell: Dumbbell,
  dumbbell: Weight,
  machine: Building2,
  cable: Cable,
  kettlebell: Grip,
  bodyweight: PersonStanding,
};

const DECIMAL_INPUT = (v: string) => v.replace(/[^\d.,]/g, "");
const DIGITS_INPUT = (v: string) => v.replace(/\D/g, "").slice(0, 3);

/** Задачи шагов — показываются в заголовке и в прогрессе. */
const STEPS = [
  {
    id: "body",
    title: "Ваши данные",
    subtitle: "Из этого рассчитаем калории и макросы на день",
    icon: Ruler,
  },
  {
    id: "goal",
    title: "Цель и опыт",
    subtitle: "Под цель соберём план тренировок и меню",
    icon: Target,
  },
  {
    id: "gear",
    title: "Инвентарь и дни",
    subtitle: "Упражнения подберём под то, что у вас есть",
    icon: Dumbbell,
  },
] as const;

const GOAL_HINTS: Partial<Record<FitnessGoal, string>> = {
  lose_weight: "Умеренный дефицит калорий и план с акцентом на жиросжигание",
  maintain: "Баланс калорий и сбалансированный план для формы",
  gain_muscle: "Профицит калорий и объёмные тренировки на массу",
  strength: "Больше базовых движений, меньше повторов, длиннее отдых",
  improve_endurance: "Короткий отдых, больше повторений и выносливости",
};

/** Форма визарда: строки для чисел (запятая/пусто), ключи для селектов. */
type WizardForm = {
  age: string;
  gender: Gender;
  heightCm: string;
  weightKg: string;
  /** Целевой вес не редактируется в визарде, но сохраняется из `initial` —
   *  иначе повторный запуск (из Профиля) затёр бы его при upsert. */
  targetWeightKg?: number;
  activityLevel: ActivityLevel;
  fitnessGoal: FitnessGoal;
  experienceLevel: ExperienceLevel;
  equipment: Equipment[];
  limitations: Limitation[];
  preferredTrainingDays: number;
  trainingStyle: TrainingStyle;
};

const DEFAULT_FORM: WizardForm = {
  age: "30",
  gender: "male",
  heightCm: "175",
  weightKg: "75",
  activityLevel: "moderate",
  fitnessGoal: "maintain",
  experienceLevel: "beginner",
  equipment: ["bodyweight"],
  limitations: [],
  preferredTrainingDays: 3,
  trainingStyle: "balanced",
};

export function OnboardingWizard({
  onComplete,
  onSkip,
  initial,
  persistSkip = true,
}: {
  /** Вызывается после успешного сохранения профиля (переход на дашборд). */
  onComplete: () => void;
  /** Вызывается при «Пропустить». */
  onSkip: () => void;
  /** Предзаполнение из существующего профиля (переоткрытие из Профиля). */
  initial?: WizardForm;
  /** Запоминать ли пропуск в localStorage (только для первого входа). */
  persistSkip?: boolean;
}) {
  const upsertProfile = useMutation(api.profiles.upsertProfile);
  const track = useTrack();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Числовые поля — строки, чтобы «пусто» и запятая обрабатывались при сохранении.
  const [form, setForm] = useState<WizardForm>(() => initial ?? DEFAULT_FORM);

  const core = {
    age: parseLocalNumber(form.age),
    heightCm: parseLocalNumber(form.heightCm),
    weightKg: parseLocalNumber(form.weightKg),
  };
  const stepValid = useMemo(() => {
    if (step === 0) {
      return (
        core.age !== null &&
        core.age >= 10 &&
        core.age <= 120 &&
        core.heightCm !== null &&
        core.heightCm >= 100 &&
        core.heightCm <= 250 &&
        core.weightKg !== null &&
        core.weightKg >= 20 &&
        core.weightKg <= 500
      );
    }
    if (step === 1) return true; // селекты всегда валидны
    return form.equipment.length > 0; // минимум один инвентарь
  }, [step, core.age, core.heightCm, core.weightKg, form.equipment.length]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };

  const toggleEquipment = (eq: Equipment) => {
    setForm((f) => ({
      ...f,
      equipment: f.equipment.includes(eq)
        ? f.equipment.filter((e) => e !== eq)
        : [...f.equipment, eq],
    }));
    setError(null);
  };

  const toggleLimitation = (lim: Limitation) => {
    setForm((f) => ({
      ...f,
      limitations: f.limitations.includes(lim)
        ? f.limitations.filter((l) => l !== lim)
        : [...f.limitations, lim],
    }));
  };

  const handleFinish = async () => {
    if (core.age === null || core.heightCm === null || core.weightKg === null) return;
    setSaving(true);
    setError(null);
    try {
      await upsertProfile({
        age: core.age,
        gender: form.gender,
        heightCm: core.heightCm,
        weightKg: core.weightKg,
        targetWeightKg: form.targetWeightKg,
        activityLevel: form.activityLevel,
        fitnessGoal: form.fitnessGoal,
        experienceLevel: form.experienceLevel,
        equipment: form.equipment,
        limitations: form.limitations,
        preferredTrainingDays: form.preferredTrainingDays,
        trainingStyle: form.trainingStyle,
      });
      toast.success(initial ? "Профиль обновлён — план пересобран" : "Профиль создан — план готов");
      // Первое заполнение профиля = завершённый онбординг (часть активации).
      if (!initial) track("onboarding_completed");
      onComplete();
    } catch (err) {
      console.error(err);
      setError(
        formatConvexError(err, "Не удалось сохранить профиль. Попробуйте ещё раз."),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    if (persistSkip) rememberOnboardingSkip();
    onSkip();
  };

  const next = () => {
    if (!stepValid) {
      setError(
        step === 0
          ? "Проверьте возраст (10–120), рост (100–250 см) и вес (20–500 кг)."
          : "Выберите хотя бы один вариант инвентаря — под него соберём план.",
      );
      return;
    }
    setError(null);
    if (step < STEPS.length - 1) setStep(step + 1);
    else void handleFinish();
  };

  // Старт онбординга — первый шаг воронки. Из Профиля (initial задан) это
  // редактирование, а не онбординг — воронку не засоряем.
  useEffect(() => {
    if (!initial) track("onboarding_started");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Step = STEPS[step];
  const StepIcon = Step.icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Онбординг: настройте профиль за 2 минуты"
      // z-[90] — выше плавающей кнопки ассистента (z-[80]): полноэкранный
      // модальный диалог не должен перекрываться FAB, иначе на мобильном
      // кнопки визарда внизу справа недостижимы (перехват кликов).
      className="bg-aurora fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="card-lift relative w-full max-w-xl rounded-2xl border bg-card p-6 shadow-elev-2 sm:p-8"
      >
        {/* Прогресс */}
        <div className="flex items-center justify-between">
          <p className="label-overline text-muted-foreground">
            Шаг {step + 1} из {STEPS.length}
          </p>
          <p className="text-xs font-medium num text-muted-foreground">
            ~2 минуты
          </p>
        </div>
        <div className="mt-3 flex gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                i <= step ? "bg-brand" : "bg-muted",
              )}
            />
          ))}
        </div>

        {/* Заголовок шага */}
        <div className="mt-6 flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
            <StepIcon className="size-5" />
          </div>
          <div>
            <h2 className="m3-headline-small">{Step.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{Step.subtitle}</p>
          </div>
        </div>

        {/* Шаг 1: антропометрия */}
        {step === 0 && (
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="onb-age">Возраст</Label>
              <Input
                id="onb-age"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="30"
                value={form.age}
                onChange={(e) => set("age", DIGITS_INPUT(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Пол</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => set("gender", g)}
                    aria-pressed={form.gender === g}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                      form.gender === g
                        ? "border-transparent bg-secondary-container text-on-secondary-container"
                        : "border-outline-variant text-on-surface-variant hover:border-outline",
                    )}
                  >
                    {form.gender === g && <Check className="size-3.5" />}
                    {GENDER_LABELS[g]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="onb-height">Рост (см)</Label>
              <Input
                id="onb-height"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="175"
                value={form.heightCm}
                onChange={(e) => set("heightCm", DECIMAL_INPUT(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="onb-weight">Вес (кг)</Label>
              <Input
                id="onb-weight"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="75"
                value={form.weightKg}
                onChange={(e) => set("weightKg", DECIMAL_INPUT(e.target.value))}
              />
              <p className="text-[11px] text-muted-foreground">
                Запятая — разделитель: 75,5
              </p>
            </div>
          </div>
        )}

        {/* Шаг 2: цель, активность, опыт, стиль */}
        {step === 1 && (
          <div className="mt-6 space-y-5">
            <div>
              <Label>Цель</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {GOAL_KEYS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => set("fitnessGoal", g)}
                    aria-pressed={form.fitnessGoal === g}
                    className={cn(
                      "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
                      form.fitnessGoal === g
                        ? "border-transparent bg-secondary-container text-on-secondary-container"
                        : "border-outline-variant text-on-surface-variant hover:border-outline",
                    )}
                  >
                    <Target className="mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {GOAL_LABELS[g]}
                      </span>
                      {GOAL_HINTS[g] && (
                        <span className="mt-0.5 block text-[11px] opacity-70">
                          {GOAL_HINTS[g]}
                        </span>
                      )}
                    </span>
                    {form.fitnessGoal === g && (
                      <Check className="ml-auto mt-0.5 size-4 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Уровень активности</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {ACTIVITY_KEYS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => set("activityLevel", a)}
                    aria-pressed={form.activityLevel === a}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors",
                      form.activityLevel === a
                        ? "border-transparent bg-secondary-container text-on-secondary-container"
                        : "border-outline-variant text-on-surface-variant hover:border-outline",
                    )}
                  >
                    {form.activityLevel === a && <Check className="size-3" />}
                    {ACTIVITY_LABELS[a]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Уровень подготовки</Label>
                <div className="grid gap-2">
                  {EXPERIENCE_KEYS.map((x) => (
                    <button
                      key={x}
                      type="button"
                      onClick={() => set("experienceLevel", x)}
                      aria-pressed={form.experienceLevel === x}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                        form.experienceLevel === x
                          ? "border-transparent bg-secondary-container text-on-secondary-container"
                          : "border-outline-variant text-on-surface-variant hover:border-outline",
                      )}
                    >
                      {form.experienceLevel === x && <Check className="size-3.5" />}
                      {EXPERIENCE_LABELS[x]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Стиль тренировок</Label>
                <div className="grid gap-2">
                  {TRAINING_STYLE_KEYS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set("trainingStyle", s)}
                      aria-pressed={form.trainingStyle === s}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                        form.trainingStyle === s
                          ? "border-transparent bg-secondary-container text-on-secondary-container"
                          : "border-outline-variant text-on-surface-variant hover:border-outline",
                      )}
                      title={TRAINING_STYLE_HINTS[s]}
                    >
                      {form.trainingStyle === s && <Check className="size-3.5" />}
                      {TRAINING_STYLE_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Шаг 3: инвентарь и дни */}
        {step === 2 && (
          <div className="mt-6 space-y-6">
            <div>
              <Label className="inline-flex items-center gap-1.5">
                <Dumbbell className="size-3.5 text-muted-foreground" />
                Инвентарь
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Выберите, что у вас есть — план заменит движения, которые нельзя выполнить.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {EQUIPMENT_KEYS.map((eq) => {
                  const active = form.equipment.includes(eq);
                  const Icon = EQUIPMENT_ICONS[eq];
                  return (
                    <button
                      key={eq}
                      type="button"
                      onClick={() => toggleEquipment(eq)}
                      aria-pressed={active}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
                        active
                          ? "border-transparent bg-secondary-container text-on-secondary-container"
                          : "border-outline-variant text-on-surface-variant hover:border-outline",
                      )}
                    >
                      <Icon className="size-3.5" />
                      {EQUIPMENT_LABELS[eq]}
                      {active && <Check className="size-3" />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Быстрые пресеты:</span>
                {EQUIPMENT_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => set("equipment", p.items)}
                    className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-muted-foreground" />
                Тренировок в неделю
              </Label>
              <div className="grid grid-cols-6 gap-2">
                {TRAINING_DAY_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set("preferredTrainingDays", d)}
                    aria-pressed={form.preferredTrainingDays === d}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-xl border text-sm font-semibold num transition-colors",
                      form.preferredTrainingDays === d
                        ? "border-transparent bg-secondary-container text-on-secondary-container"
                        : "border-outline-variant text-on-surface-variant hover:border-outline",
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="inline-flex items-center gap-1.5">
                <Activity className="size-3.5 text-muted-foreground" />
                Ограничения (необязательно)
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Если что-то болит — план заменит рискованные упражнения на безопасные.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {LIMITATION_KEYS.map((lim) => {
                  const active = form.limitations.includes(lim);
                  return (
                    <button
                      key={lim}
                      type="button"
                      onClick={() => toggleLimitation(lim)}
                      aria-pressed={active}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
                        active
                          ? "border-transparent bg-error-container text-on-error-container"
                          : "border-outline-variant text-on-surface-variant hover:border-outline",
                      )}
                    >
                      {LIMITATION_LABELS[lim]}
                      {active && <Check className="size-3" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-5 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <Zap className="size-4 shrink-0" />
            {error}
          </p>
        )}

        {/* Управление */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
          >
            Пропустить
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep(step - 1);
                  setError(null);
                }}
                disabled={saving}
              >
                <ArrowLeft className="size-4" />
                Назад
              </Button>
            )}
            <Button type="button" onClick={next} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Сохраняем…
                </>
              ) : step < STEPS.length - 1 ? (
                <>
                  Далее
                  <ArrowRight className="size-4" />
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Создать план
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
