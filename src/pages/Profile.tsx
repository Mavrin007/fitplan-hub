import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ChartCard, LegendChip } from "@/components/chart-card";
import { PageAurora } from "@/components/page-aurora";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { axisProps, gridProps, tooltipStyle, lineAnim, goalLabel } from "@/lib/charts";
import {
  ACTIVITY_LABELS,
  ACTIVITY_MULTIPLIERS,
  GENDER_LABELS,
  GOAL_ADJUSTMENTS,
  GOAL_LABELS,
  EXPERIENCE_LABELS,
  LIMITATION_KEYS,
  LIMITATION_LABELS,
  LIMITATION_DESCRIPTIONS,
  computeTargets,
  type ActivityLevel,
  type ExperienceLevel,
  type FitnessGoal,
  type Gender,
  type Limitation,
} from "@/lib/nutrition";
import {
  EQUIPMENT_KEYS,
  EQUIPMENT_LABELS,
  EQUIPMENT_PRESETS,
  type Equipment,
} from "@/lib/workoutLibrary";
import { todayKey, shortDate } from "@/lib/dates";
import { cn, parseLocalNumber } from "@/lib/utils";
import { formatConvexError } from "@/lib/errors";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Building2,
  Cable,
  CalendarDays,
  Check,
  Dumbbell,
  Grip,
  Link2,
  Loader2,
  Mail,
  PersonStanding,
  Plus,
  Scale,
  Target,
  Trash2,
  Weight,
  Activity,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

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
];
const EXPERIENCE_KEYS: ExperienceLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
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

/** Допустимые в числовом поле символы: цифры, запятая, точка. */
const DECIMAL_INPUT = (v: string) => v.replace(/[^\d.,]/g, "");
/** Для целых полей (возраст) — только цифры. */
const DIGITS_INPUT = (v: string) => v.replace(/\D/g, "").slice(0, 3);

/** Категория ИМТ по классификации ВОЗ. */
function bmiCategory(bmi: number): { label: string; tone: "ok" | "low" | "high" } {
  if (bmi < 18.5) return { label: "Недостаточный вес", tone: "low" };
  if (bmi < 25) return { label: "Норма", tone: "ok" };
  if (bmi < 30) return { label: "Избыточный вес", tone: "high" };
  return { label: "Ожирение", tone: "high" };
}

/** Ожидаемый темп изменения веса при дефиците/профиците: 1 кг ≈ 7700 ккал. */
function weeklyRateKg(adjustment: number, tdee: number): number {
  return Math.abs((adjustment * tdee * 7) / 7700);
}

export default function Profile() {
  const profile = useQuery(api.profiles.getMyProfile);
  const weights = useQuery(api.weightEntries.listMyWeights, {});
  const upsertProfile = useMutation(api.profiles.upsertProfile);
  const addWeight = useMutation(api.weightEntries.addWeight);
  const deleteWeight = useMutation(api.weightEntries.deleteWeight);
  const { user, signIn } = useAuth();

  // Привязка почты к гостевому аккаунту: данные, сохранённые под анонимной
  // сессией, после этого доступны и при входе по почте с любого устройства.
  const [attachEmail, setAttachEmail] = useState("");
  const [attachStep, setAttachStep] = useState<"email" | "otp">("email");
  const [attachOtp, setAttachOtp] = useState("");
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const handleAttachEmail = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAttachBusy(true);
    setAttachError(null);
    try {
      const formData = new FormData(e.currentTarget);
      await signIn("email-otp", formData);
      setAttachEmail(String(formData.get("email") ?? ""));
      setAttachStep("otp");
    } catch (err) {
      console.error("Attach email error:", err);
      setAttachError(
        err instanceof Error
          ? err.message
          : "Не удалось отправить код. Попробуйте ещё раз.",
      );
    } finally {
      setAttachBusy(false);
    }
  };

  const handleAttachOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAttachBusy(true);
    setAttachError(null);
    try {
      const formData = new FormData(e.currentTarget);
      await signIn("email-otp", formData);
      toast.success("Почта привязана — данные привязаны к вашему аккаунту");
      setAttachStep("email");
      setAttachEmail("");
      setAttachOtp("");
    } catch (err) {
      console.error("Attach OTP error:", err);
      setAttachError("Введённый код подтверждения неверен.");
      setAttachOtp("");
    } finally {
      setAttachBusy(false);
    }
  };

  // Числовые поля — строки, чтобы поле можно было очистить, а «пусто» и
  // запятая как десятичный разделитель («74,5») обрабатывались при сохранении.
  const [form, setForm] = useState({
    age: "30",
    gender: "male" as Gender,
    heightCm: "175",
    weightKg: "75",
    targetWeightKg: "",
    activityLevel: "moderate" as ActivityLevel,
    fitnessGoal: "maintain" as FitnessGoal,
    experienceLevel: "beginner" as ExperienceLevel,
    equipment: [] as Equipment[],
    limitations: [] as Limitation[],
    preferredTrainingDays: 3,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [weightInput, setWeightInput] = useState("");

  // Sync form when the profile loads
  const [hydrated, setHydrated] = useState(false);
  if (profile && !hydrated) {
    setHydrated(true);
    setForm({
      age: String(profile.age),
      gender: profile.gender,
      heightCm: String(profile.heightCm),
      weightKg: String(profile.weightKg),
      targetWeightKg: profile.targetWeightKg
        ? String(profile.targetWeightKg)
        : "",
      activityLevel: profile.activityLevel,
      fitnessGoal: profile.fitnessGoal,
      experienceLevel: profile.experienceLevel,
      equipment: (profile.equipment ?? []) as Equipment[],
      limitations: (profile.limitations ?? []) as Limitation[],
      preferredTrainingDays: profile.preferredTrainingDays ?? 3,
    });
  }

  // Разобранные числа формы: null = поле пустое или нечитаемое.
  const core = {
    age: parseLocalNumber(form.age),
    heightCm: parseLocalNumber(form.heightCm),
    weightKg: parseLocalNumber(form.weightKg),
  };
  const coreValid =
    core.age !== null &&
    core.age >= 10 &&
    core.heightCm !== null &&
    core.heightCm >= 100 &&
    core.weightKg !== null &&
    core.weightKg >= 20;

  const targets = coreValid
    ? computeTargets({
        age: core.age!,
        gender: form.gender,
        heightCm: core.heightCm!,
        weightKg: core.weightKg!,
        activityLevel: form.activityLevel,
        fitnessGoal: form.fitnessGoal,
      })
    : null;
  const targetWeight = profile?.targetWeightKg ?? null;
  const targetWeightValue = parseLocalNumber(form.targetWeightKg);

  // ИМТ и категория — считаются «на лету» от текущей формы.
  const bmi =
    core.heightCm !== null &&
    core.heightCm > 0 &&
    core.weightKg !== null &&
    core.weightKg > 0
      ? core.weightKg / Math.pow(core.heightCm / 100, 2)
      : null;
  const bmiInfo = bmi === null ? null : bmiCategory(bmi);

  // Данные графика: замеры по возрастанию даты
  const weightData = useMemo(() => {
    return [...(weights ?? [])]
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((w) => ({ date: shortDate(w.date), weight: w.weightKg }));
  }, [weights]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFormError(null);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Локальная проверка до отправки — понятная ошибка у кнопки, а не
    // загадочный ответ сервера. Диапазоны совпадают с серверными.
    const age = core.age;
    const heightCm = core.heightCm;
    const weightKg = core.weightKg;
    const targetRaw = form.targetWeightKg.trim();

    if (age === null || age < 10 || age > 120) {
      setFormError("Возраст: укажите число от 10 до 120 лет.");
      return;
    }
    if (heightCm === null || heightCm < 100 || heightCm > 250) {
      setFormError("Рост: укажите число от 100 до 250 см.");
      return;
    }
    if (weightKg === null || weightKg < 20 || weightKg > 500) {
      setFormError("Вес: укажите число от 20 до 500 кг.");
      return;
    }

    let targetWeightKg: number | undefined;
    if (targetRaw === "") {
      targetWeightKg = undefined;
    } else {
      const parsed = parseLocalNumber(targetRaw);
      if (parsed === null || parsed <= 0) {
        setFormError("Целевой вес: укажите число, например 72,5.");
        return;
      }
      targetWeightKg = parsed;
    }

    setSaving(true);
    try {
      await upsertProfile({
        age,
        gender: form.gender,
        heightCm,
        weightKg,
        activityLevel: form.activityLevel,
        fitnessGoal: form.fitnessGoal,
        experienceLevel: form.experienceLevel,
        targetWeightKg,
        equipment: form.equipment,
        limitations: form.limitations,
        preferredTrainingDays: form.preferredTrainingDays,
      });
      toast.success("Профиль сохранён");
    } catch (err) {
      console.error(err);
      // Сервер теперь кидает ConvexError с понятным { message } — показываем
      // его пользователю; если причина не пришла, показываем запасной текст.
      toast.error(
        formatConvexError(
          err,
          "Не удалось сохранить профиль. Попробуйте ещё раз.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddWeight = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const kg = parseLocalNumber(weightInput);
    if (kg === null || kg <= 0 || kg > 400) {
      toast.error("Вес: укажите число от 0 до 400 кг, например 74,5.");
      return;
    }
    try {
      await addWeight({ date: todayKey(), weightKg: kg });
      setWeightInput("");
      toast.success("Вес записан");
    } catch (err) {
      console.error(err);
      toast.error(
        formatConvexError(err, "Не удалось записать вес. Попробуйте ещё раз."),
      );
    }
  };

  const toggleEquipment = (eq: Equipment) => {
    setForm((f) => ({
      ...f,
      equipment: f.equipment.includes(eq)
        ? f.equipment.filter((e) => e !== eq)
        : [...f.equipment, eq],
    }));
  };

  const toggleLimitation = (lim: Limitation) => {
    setForm((f) => ({
      ...f,
      limitations: f.limitations.includes(lim)
        ? f.limitations.filter((l) => l !== lim)
        : [...f.limitations, lim],
    }));
  };

  // M3 onboarding: шаги заполнения профиля
  const onboardingSteps = [
    { label: "Данные", done: true },
    { label: "Цель веса", done: form.targetWeightKg.trim() !== "" },
    { label: "Инвентарь", done: form.equipment.length > 0 },
    { label: "Замеры", done: (weights ?? []).length > 0 },
  ];
  const onboardingDone = onboardingSteps.filter((s) => s.done).length;
  const onboardingPct = Math.round(
    (onboardingDone / onboardingSteps.length) * 100,
  );

  if (profile === undefined || weights === undefined) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded-lg border bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="relative isolate mx-auto max-w-4xl space-y-10">
      <PageAurora />
      <header>
        <p className="label-overline text-muted-foreground">Профиль</p>
        <h1 className="mt-2 m3-headline-large">
          Ваши цифры
        </h1>
        <div
          aria-hidden
          className="mt-3 h-1 w-14 rounded-full bg-gradient-to-r from-brand to-brand-deep dark:from-brand-soft dark:to-brand"
        />
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Дневные цели по калориям и макросам рассчитываются из этих данных по
          формуле Миффлина–Сан Жеора. Целевой вес показывается пунктиром на
          графиках веса — здесь и в разделе «Прогресс». Инвентарь, ограничения
          и число тренировок в неделю влияют на план тренировок.
        </p>
      </header>

      {/* Гостевой аккаунт без почты: привязка email, чтобы данные не терялись
          при входе с другого устройства / после выхода из гостевой сессии. */}
      {user && !user.email && (
        <section className="card-lift rounded-xl border bg-secondary-container/30 p-5 shadow-elev-1">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-secondary-container p-2">
              <Link2 className="size-4 text-on-secondary-container" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="label-overline text-muted-foreground">Аккаунт</p>
              <h2 className="mt-1 m3-title-medium">
                Привяжите почту, чтобы сохранить данные
              </h2>
              <p className="mt-1 max-w-lg text-xs text-muted-foreground">
                Сейчас вы вошли как гость: профиль и логи хранятся только в
                этой сессии. Привяжите email — данные останутся за вашим
                аккаунтом и будут доступны при входе с любого устройства.
              </p>

              {attachStep === "email" ? (
                <form
                  onSubmit={handleAttachEmail}
                  className="mt-4 flex max-w-sm flex-col gap-2 sm:flex-row sm:items-end"
                >
                  <div className="relative flex-1 space-y-2">
                    <Label htmlFor="attach-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="attach-email"
                        name="email"
                        type="email"
                        placeholder="name@example.com"
                        className="h-10 pl-9"
                        disabled={attachBusy}
                        required
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="h-10"
                    disabled={attachBusy}
                  >
                    {attachBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        Отправить код
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleAttachOtp} className="mt-4 max-w-sm space-y-3">
                  <input type="hidden" name="email" value={attachEmail} />
                  <input type="hidden" name="code" value={attachOtp} />
                  <p className="text-xs text-muted-foreground">
                    Мы отправили код на{" "}
                    <span className="num font-medium text-foreground">{attachEmail}</span>.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <InputOTP
                      value={attachOtp}
                      onChange={setAttachOtp}
                      maxLength={6}
                      disabled={attachBusy}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && attachOtp.length === 6 && !attachBusy) {
                          (e.target as HTMLElement).closest("form")?.requestSubmit();
                        }
                      }}
                    >
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                    <Button
                      type="submit"
                      className="h-10"
                      disabled={attachBusy || attachOtp.length !== 6}
                    >
                      {attachBusy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Подтвердить"
                      )}
                    </Button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachStep("email");
                      setAttachError(null);
                    }}
                    className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
                  >
                    ← Изменить email
                  </button>
                </form>
              )}

              {attachError && (
                <p className="mt-2 text-xs text-destructive">{attachError}</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* M3 onboarding: линейный прогресс + шаги */}
      <section className="card-lift rounded-xl border bg-card p-5 shadow-elev-1">
        <div className="flex items-center justify-between gap-3">
          <p className="label-overline text-muted-foreground">Онбординг</p>
          <p className="text-xs font-medium num">{onboardingPct}%</p>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-variant">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${onboardingPct}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {onboardingSteps.map((s) => (
            <span
              key={s.label}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                s.done
                  ? "border-transparent bg-secondary-container text-on-secondary-container"
                  : "border-outline-variant text-on-surface-variant",
              )}
            >
              {s.done ? (
                <Check className="size-3" />
              ) : (
                <span className="size-3 rounded-full border border-outline-variant" />
              )}
              {s.label}
            </span>
          ))}
        </div>
      </section>

      <form onSubmit={handleSave} className="space-y-8">
        <section className="card-lift rounded-xl border bg-card p-6 shadow-elev-1 sm:p-8">
          <p className="label-overline text-muted-foreground">Основное</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="age">Возраст</Label>
              <Input
                id="age"
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
              <Select
                value={form.gender}
                onValueChange={(v) => set("gender", v as Gender)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
                    <SelectItem key={g} value={g}>
                      {GENDER_LABELS[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="height">Рост (см)</Label>
              <Input
                id="height"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="175"
                value={form.heightCm}
                onChange={(e) => set("heightCm", DECIMAL_INPUT(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">Вес (кг)</Label>
              <Input
                id="weight"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="75"
                value={form.weightKg}
                onChange={(e) => set("weightKg", DECIMAL_INPUT(e.target.value))}
              />
              <p className="text-[11px] text-muted-foreground">
                Запятая работает как разделитель: 75,5
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-weight" className="inline-flex items-center gap-1.5">
                Целевой вес (кг)
                <Target className="size-3 text-muted-foreground" />
              </Label>
              <Input
                id="target-weight"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="не задано"
                value={form.targetWeightKg}
                onChange={(e) =>
                  set("targetWeightKg", DECIMAL_INPUT(e.target.value))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Ориентир на графике веса. Можно оставить пустым.
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2 lg:col-span-1">
              <Label>Уровень активности</Label>
              <Select
                value={form.activityLevel}
                onValueChange={(v) => set("activityLevel", v as ActivityLevel)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_KEYS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACTIVITY_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Цель</Label>
              <Select
                value={form.fitnessGoal}
                onValueChange={(v) => set("fitnessGoal", v as FitnessGoal)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_KEYS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {GOAL_LABELS[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Уровень подготовки</Label>
              <Select
                value={form.experienceLevel}
                onValueChange={(v) =>
                  set("experienceLevel", v as ExperienceLevel)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPERIENCE_KEYS.map((x) => (
                    <SelectItem key={x} value={x}>
                      {EXPERIENCE_LABELS[x]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="inline-flex items-center gap-1.5">
                Тренировок в неделю
                <CalendarDays className="size-3 text-muted-foreground" />
              </Label>
              <Select
                value={String(form.preferredTrainingDays)}
                onValueChange={(v) =>
                  set("preferredTrainingDays", Number(v))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRAINING_DAY_OPTIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} {d === 1 ? "раз" : d < 5 ? "раза" : "раз"} в неделю
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                План тренировок строится под это число.
              </p>
            </div>
          </div>
        </section>

        {/* Ограничения / травмы */}
        <section className="card-lift rounded-xl border bg-card p-6 shadow-elev-1 sm:p-8">
          <p className="label-overline flex items-center gap-1.5 text-muted-foreground">
            <AlertTriangle className="size-3.5" />
            Ограничения и травмы
          </p>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Если что-то из этого есть — план заменит рискованные упражнения на
            безопасные аналоги с объяснением. Можно не выбирать.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {LIMITATION_KEYS.map((lim) => {
              const active = form.limitations.includes(lim);
              return (
                <button
                  key={lim}
                  type="button"
                  onClick={() => toggleLimitation(lim)}
                  aria-pressed={active}
                  title={LIMITATION_DESCRIPTIONS[lim]}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
                    active
                      ? "border-transparent bg-error-container text-on-error-container"
                      : "border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-error-container",
                  )}
                >
                  <AlertTriangle className="size-3.5" />
                  {LIMITATION_LABELS[lim]}
                  {active && <Check className="size-3" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Инвентарь */}
        <section className="card-lift rounded-xl border bg-card p-6 shadow-elev-1 sm:p-8">
          <p className="label-overline text-muted-foreground">Инвентарь</p>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            План тренировок подберёт упражнения под то, что у вас есть, и
            заменит движения, которые нельзя выполнить. Можно выбрать несколько.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
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
                      : "border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-secondary-container",
                  )}
                >
                  <Icon className="size-3.5" />
                  {EQUIPMENT_LABELS[eq]}
                  {active && <Check className="size-3" />}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
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
        </section>

        {/* Live targets */}
        <section className="card-lift rounded-xl border bg-card p-6 shadow-elev-1 sm:p-8">
          <div className="flex items-baseline justify-between gap-3">
            <p className="label-overline text-muted-foreground">Дневные цели</p>
            {targets && (
              <p className="text-xs text-muted-foreground">
                BMR {targets.bmr} · TDEE {targets.tdee}
              </p>
            )}
          </div>
          {targets ? (
            <>
              <div className="mt-5 grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4">
                {[
                  { label: "Калории", value: targets.calories.toLocaleString("ru-RU"), unit: "ккал" },
                  { label: "Белки", value: targets.protein, unit: "г" },
                  { label: "Углеводы", value: targets.carbs, unit: "г" },
                  { label: "Жиры", value: targets.fat, unit: "г" },
                ].map((t) => (
                  <div key={t.label} className="bg-background p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t.label}
                    </p>
                    <p className="mt-1 text-2xl font-semibold num">
                      {t.value}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {t.unit}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
              {form.targetWeightKg.trim() !== "" &&
                targetWeightValue !== null &&
                core.weightKg !== null && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    🎯 Целевой вес:{" "}
                    <span className="num font-medium text-foreground">
                      {targetWeightValue.toFixed(1)} кг
                    </span>
                    {" · "}
                    {core.weightKg > targetWeightValue
                      ? `осталось сбросить ${(core.weightKg - targetWeightValue).toFixed(1)} кг`
                      : core.weightKg < targetWeightValue
                        ? `осталось набрать ${(targetWeightValue - core.weightKg).toFixed(1)} кг`
                        : "вы на целевой отметке"}
                  </p>
                )}
            </>
          ) : (
            <p className="mt-4 rounded-md bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
              Заполните возраст, рост и вес — дневные цели появятся здесь.
            </p>
          )}
        </section>

        {/* Разбор калорий: ИМТ + BMR → активность → TDEE → дефицит/профицит */}
        <section className="card-lift rounded-xl border bg-card p-6 shadow-elev-1 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="label-overline flex items-center gap-1.5 text-muted-foreground">
              <Activity className="size-3.5" />
              Разбор калорий
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">ИМТ</span>
              <span className="text-sm font-semibold num">
                {bmi === null ? "—" : bmi.toFixed(1)}
              </span>
              {bmiInfo && (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                    bmiInfo.tone === "ok"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : bmiInfo.tone === "low"
                        ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                  )}
                >
                  {bmiInfo.label}
                </span>
              )}
            </div>
          </div>

          {targets ? (
            <>
              {/* Цепочка расчёта */}
              <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
                <div className="rounded-md bg-secondary-container px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-on-secondary-container/70">
                    BMR
                  </p>
                  <p className="font-semibold num text-on-secondary-container">
                    {targets.bmr}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                <div className="rounded-md bg-surface-variant px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/70">
                    ×{ACTIVITY_MULTIPLIERS[form.activityLevel].toFixed(2)} активность
                  </p>
                  <p className="font-semibold num text-on-surface-variant">
                    {targets.tdee} ккал
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                <div
                  className={cn(
                    "rounded-md px-3 py-2 text-center",
                    GOAL_ADJUSTMENTS[form.fitnessGoal] < 0
                      ? "bg-error-container"
                      : GOAL_ADJUSTMENTS[form.fitnessGoal] > 0
                        ? "bg-tertiary-container"
                        : "bg-secondary-container",
                  )}
                >
                  <p
                    className={cn(
                      "text-[10px] uppercase tracking-wider",
                      GOAL_ADJUSTMENTS[form.fitnessGoal] < 0
                        ? "text-on-error-container/70"
                        : GOAL_ADJUSTMENTS[form.fitnessGoal] > 0
                          ? "text-on-tertiary-container/70"
                          : "text-on-secondary-container/70",
                    )}
                  >
                    {GOAL_ADJUSTMENTS[form.fitnessGoal] < 0
                      ? `−${Math.round(Math.abs(GOAL_ADJUSTMENTS[form.fitnessGoal]) * 100)}% ${GOAL_LABELS[form.fitnessGoal].toLowerCase()}`
                      : GOAL_ADJUSTMENTS[form.fitnessGoal] > 0
                        ? `+${Math.round(GOAL_ADJUSTMENTS[form.fitnessGoal] * 100)}% ${GOAL_LABELS[form.fitnessGoal].toLowerCase()}`
                        : GOAL_LABELS[form.fitnessGoal].toLowerCase()}
                  </p>
                  <p
                    className={cn(
                      "font-semibold num",
                      GOAL_ADJUSTMENTS[form.fitnessGoal] < 0
                        ? "text-on-error-container"
                        : GOAL_ADJUSTMENTS[form.fitnessGoal] > 0
                          ? "text-on-tertiary-container"
                          : "text-on-secondary-container",
                    )}
                  >
                    {targets.calories} ккал
                  </p>
                </div>
              </div>

              {/* Полоса: где калории относительно TDEE */}
              <div className="mt-5">
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="absolute inset-y-0 rounded-full bg-brand"
                    style={{
                      left: "50%",
                      width: `${Math.min(50, (Math.abs(targets.calories - targets.tdee) / targets.tdee) * 50)}%`,
                      transform:
                        targets.calories < targets.tdee
                          ? "translateX(-100%)"
                          : "translateX(0)",
                    }}
                  />
                  <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                  <span className="num">{targets.calories} ккал — цель</span>
                  <span className="num">{targets.tdee} ккал — поддержание</span>
                </div>
              </div>

              {GOAL_ADJUSTMENTS[form.fitnessGoal] !== 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {GOAL_ADJUSTMENTS[form.fitnessGoal] < 0 ? (
                    <>
                      Дефицит{" "}
                      <span className="num font-medium text-foreground">
                        {Math.round(targets.tdee - targets.calories)} ккал/день
                      </span>{" "}
                      — примерно{" "}
                      <span className="num font-medium text-foreground">
                        −{weeklyRateKg(GOAL_ADJUSTMENTS[form.fitnessGoal], targets.tdee).toFixed(1)} кг
                      </span>{" "}
                      в неделю.
                    </>
                  ) : (
                    <>
                      Профицит{" "}
                      <span className="num font-medium text-foreground">
                        {Math.round(targets.calories - targets.tdee)} ккал/день
                      </span>{" "}
                      — примерно{" "}
                      <span className="num font-medium text-foreground">
                        +{weeklyRateKg(GOAL_ADJUSTMENTS[form.fitnessGoal], targets.tdee).toFixed(1)} кг
                      </span>{" "}
                      в неделю.
                    </>
                  )}
                </p>
              )}
            </>
          ) : (
            <p className="mt-4 rounded-md bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
              Заполните возраст, рост и вес — разбор калорий появится здесь.
            </p>
          )}
        </section>

        {formError && (
          <p className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {formError}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить профиль"}
          </Button>
        </div>
      </form>

      <Separator />

      {/* Weight log */}
      <section className="space-y-4">
        <div>
          <p className="label-overline text-muted-foreground">Журнал веса</p>
          <h2 className="mt-1 m3-title-large">
            Отслеживайте вес
          </h2>
        </div>

        <ChartCard
          title="Динамика веса"
          subtitle={
            targetWeight
              ? `Замеры · пунктир — цель ${targetWeight.toFixed(1)} кг`
              : "Замеры · задайте целевой вес, чтобы увидеть ориентир"
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
            </>
          }
        >
          {weightData.length < 2 ? (
            <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
              <Scale className="size-5" />
              <p className="max-w-[240px] text-center text-xs">
                Запишите минимум два замера веса — кривая появится здесь.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={weightData}>
                <defs>
                  <linearGradient id="weightFillProfile" x1="0" y1="0" x2="0" y2="1">
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
                <XAxis
                  dataKey="date"
                  interval={Math.max(0, Math.floor(weightData.length / 8) - 1)}
                  {...axisProps}
                />
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
                  fill="url(#weightFillProfile)"
                  activeDot={{ r: 3 }}
                  {...lineAnim}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <form onSubmit={handleAddWeight} className="flex max-w-sm items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="weight-entry">Вес сегодня (кг)</Label>
            <Input
              id="weight-entry"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="напр. 74,5"
              value={weightInput}
              onChange={(e) => setWeightInput(DECIMAL_INPUT(e.target.value))}
            />
          </div>
          <Button type="submit" disabled={!weightInput}>
            <Plus className="size-4" /> Записать
          </Button>
        </form>

        {(weights ?? []).length > 0 && (
          <div className="overflow-hidden rounded-lg border">
            <div className="divide-y">
              {(weights ?? []).slice(0, 10).map((w) => (
                <div
                  key={w._id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <span className="text-muted-foreground">{shortDate(w.date)}</span>
                  <span className="font-medium num">{w.weightKg.toFixed(1)} кг</span>
                  <button
                    type="button"
                    onClick={() => deleteWeight({ id: w._id })}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    aria-label="Удалить запись"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
