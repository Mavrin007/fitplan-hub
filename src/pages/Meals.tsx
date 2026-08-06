import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ChartCard, LegendChip } from "@/components/chart-card";
import { Chip } from "@/components/ui/chip";
import { MacroRing } from "@/components/macro-ring";
import { PageAurora } from "@/components/page-aurora";
import { EmptyState } from "@/components/empty-state";
import { DishScene } from "@/components/illustrations";
import { Badge } from "@/components/ui/badge";
import {
  FOOD_LIBRARY,
  MEAL_TYPE_LABELS,
  WEEKDAY_SHORT,
  formatAmount,
  generateMealPlan,
  generateWeeklyMealPlan,
  type MealType,
  type PlannedMeal,
} from "@/lib/mealLibrary";
import { GOAL_LABELS, computeTargets, type FitnessGoal } from "@/lib/nutrition";
import { addDays, pluralRecords, shortDate, toDateKey, todayKey } from "@/lib/dates";
import { cn, parseLocalNumber } from "@/lib/utils";
import {
  Apple,
  ArrowRight,
  Coffee,
  Copy,
  Loader2,
  Moon,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/** Placeholder-иллюстрация приёма (M3: градиент + иконка в стиле «еды»). */
const MEAL_ART: Record<MealType, { icon: LucideIcon; label: string }> = {
  breakfast: { icon: Coffee, label: "Завтрак" },
  lunch: { icon: UtensilsCrossed, label: "Обед" },
  dinner: { icon: Moon, label: "Ужин" },
  snack: { icon: Apple, label: "Перекус" },
};

/** Калории одной порции (servingGrams) из макросов на 100 г. */
function kcalPerServing(calories: number, servingGrams: number): number {
  return Math.round((calories * servingGrams) / 100);
}

/** Форматирует примерную цену блюда/дня в BYN: «≈ 5,40 byn». */
function formatPrice(byn: number): string {
  return `≈ ${byn.toFixed(2).replace(".", ",")} byn`;
}

/** Допустимые в числовом поле символы: цифры, запятая, точка. */
const DECIMAL_INPUT = (v: string) => v.replace(/[^\d.,]/g, "");

export default function Meals() {
  const profile = useQuery(api.profiles.getMyProfile);
  const todayLog = useQuery(api.mealLog.getByDate, { date: todayKey() });
  const foods = useQuery(api.foods.listMyFoods, {});
  const addEntry = useMutation(api.mealLog.addEntry);
  const addEntries = useMutation(api.mealLog.addEntries);
  const updateEntry = useMutation(api.mealLog.updateEntry);
  const deleteEntry = useMutation(api.mealLog.deleteEntry);
  const addFood = useMutation(api.foods.addFood);
  const deleteFood = useMutation(api.foods.deleteFood);

  // Add/edit entry dialog state
  const [dialogMeal, setDialogMeal] = useState<MealType | null>(null);
  // Редактируемая запись: null = диалог в режиме «добавить», иначе «изменить».
  const [editingEntry, setEditingEntry] = useState<Doc<"mealLog"> | null>(null);
  const [search, setSearch] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [customName, setCustomName] = useState("");
  const [customCals, setCustomCals] = useState("");
  const [customProtein, setCustomProtein] = useState("");
  const [customCarbs, setCustomCarbs] = useState("");
  const [customFat, setCustomFat] = useState("");

  // New custom food state
  const [newFood, setNewFood] = useState({
    name: "",
    amount: "100",
    unit: "г",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
  });

  // Перенос записей из прошлого дня: выбранная дата + флаг копирования.
  const [copyFromDate, setCopyFromDate] = useState(() =>
    toDateKey(addDays(new Date(), -1)),
  );
  const [copying, setCopying] = useState(false);

  const [showPlan, setShowPlan] = useState(false);

  // Стиль недельного меню: по умолчанию — цель из профиля, можно переключить
  // на другой (например «Похудение»/«Набор массы»), чтобы посмотреть меню.
  const [menuGoal, setMenuGoal] = useState<FitnessGoal | null>(null);

  const targets = profile ? computeTargets(profile) : null;

  const byMeal = useMemo(() => {
    const map: Record<MealType, NonNullable<typeof todayLog>> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    for (const e of todayLog ?? []) map[e.mealType] = [...map[e.mealType], e];
    return map;
  }, [todayLog]);

  const totals = useMemo(() => {
    const entries = todayLog ?? [];
    return {
      calories: entries.reduce((s, e) => s + e.calories, 0),
      protein: entries.reduce((s, e) => s + e.protein, 0),
      carbs: entries.reduce((s, e) => s + e.carbs, 0),
      fat: entries.reduce((s, e) => s + e.fat, 0),
    };
  }, [todayLog]);

  const activeMenuGoal = menuGoal ?? (profile ? profile.fitnessGoal : "maintain");
  // Дневной план строится под выбранную цель меню — если переключили стиль
  // меню на неделе, план на сегодня совпадает с первым днём недельного меню.
  const plan = useMemo(() => {
    if (!targets) return null;
    return generateMealPlan(todayKey(), activeMenuGoal, targets);
  }, [targets, activeMenuGoal]);

  const weeklyPlan = useMemo(() => {
    if (!targets) return null;
    return generateWeeklyMealPlan(activeMenuGoal, targets);
  }, [targets, activeMenuGoal]);

  // Записи выбранного «прошлого» дня — для предпросмотра количества.
  const copyLog = useQuery(api.mealLog.getByDate, { date: copyFromDate });
  const yesterdayKey = toDateKey(addDays(new Date(), -1));

  /** Закрыть диалог добавления/редактирования и сбросить все поля. */
  const closeDialog = () => {
    setDialogMeal(null);
    setEditingEntry(null);
    setSearch("");
    setSelectedName("");
    setQuantity("1");
    setCustomName("");
    setCustomCals("");
    setCustomProtein("");
    setCustomCarbs("");
    setCustomFat("");
  };

  /** Открыть диалог с предзаполненными значениями записи для редактирования. */
  const openEdit = (entry: Doc<"mealLog">) => {
    setEditingEntry(entry);
    setDialogMeal(entry.mealType);
    setQuantity(String(entry.quantity ?? 1));
    setCustomName(entry.name);
    setCustomCals(String(entry.calories));
    setCustomProtein(String(entry.protein));
    setCustomCarbs(String(entry.carbs));
    setCustomFat(String(entry.fat));
    setSearch("");
    setSelectedName("");
  };

  /** Скопировать все записи выбранного дня в сегодняшний дневник. */
  const handleCopyDay = async () => {
    if (!copyFromDate || copyFromDate === todayKey()) return;
    const entries = copyLog ?? [];
    if (entries.length === 0) {
      toast.error("В этот день записей нет");
      return;
    }
    setCopying(true);
    try {
      await addEntries({
        entries: entries.map((e) => ({
          date: todayKey(),
          mealType: e.mealType,
          name: e.name,
          quantity: e.quantity,
          calories: e.calories,
          protein: e.protein,
          carbs: e.carbs,
          fat: e.fat,
          foodId: e.foodId,
        })),
      });
      toast.success(
        `Скопировано записей: ${entries.length} из ${shortDate(copyFromDate)}`,
      );
    } catch (err) {
      console.error(
        "[Meals] Ошибка копирования записей из " + copyFromDate + " в сегодня:",
        err,
      );
      toast.error("Не удалось скопировать записи");
    } finally {
      setCopying(false);
    }
  };

  const handleAdd = async () => {
    if (!dialogMeal || !selectedName) return;
    const qty = parseLocalNumber(quantity);
    if (qty === null || qty <= 0) {
      toast.error("Порций: укажите число больше нуля, например 1,5.");
      return;
    }
    const food = FOOD_LIBRARY.find((f) => f.name === selectedName);
    if (!food) return;
    const ratio = (qty * food.servingGrams) / 100; // от 100 г к выбранному количеству
    try {
      await addEntry({
        date: todayKey(),
        mealType: dialogMeal,
        name: food.name,
        quantity: Math.round(qty * 10) / 10,
        calories: Math.round(food.calories * ratio),
        protein: Math.round(food.protein * ratio * 10) / 10,
        carbs: Math.round(food.carbs * ratio * 10) / 10,
        fat: Math.round(food.fat * ratio * 10) / 10,
      });
      toast.success(`${food.name} — добавлено`);
      closeDialog();
    } catch (err) {
      console.error("[Meals] Ошибка добавления продукта из библиотеки:", err);
      toast.error("Не удалось добавить продукт");
    }
  };

  const handleCustomAdd = async () => {
    if (!dialogMeal) return;
    if (!customName.trim()) {
      toast.error("Укажите название продукта");
      return;
    }
    const cals = parseLocalNumber(customCals);
    if (cals === null || cals <= 0) {
      toast.error("Укажите калории числом, например 250");
      return;
    }
    const p = parseLocalNumber(customProtein) ?? 0;
    const c = parseLocalNumber(customCarbs) ?? 0;
    const f = parseLocalNumber(customFat) ?? 0;
    try {
      await addEntry({
        date: todayKey(),
        mealType: dialogMeal,
        name: customName.trim(),
        quantity: 1,
        calories: cals,
        protein: p,
        carbs: c,
        fat: f,
      });
      toast.success(`${customName.trim()} — добавлено`);
      closeDialog();
    } catch (err) {
      console.error("[Meals] Ошибка добавления своего продукта:", err);
      toast.error("Не удалось добавить продукт");
    }
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;
    if (!customName.trim()) {
      toast.error("Укажите название продукта");
      return;
    }
    const cals = parseLocalNumber(customCals);
    if (cals === null || cals <= 0) {
      toast.error("Укажите калории числом, например 250");
      return;
    }
    const qty = parseLocalNumber(quantity);
    if (qty === null || qty <= 0) {
      toast.error("Порций: укажите число больше нуля, например 1,5.");
      return;
    }
    try {
      await updateEntry({
        id: editingEntry._id,
        mealType: dialogMeal ?? editingEntry.mealType,
        name: customName.trim(),
        quantity: Math.round(qty * 10) / 10,
        calories: cals,
        protein: parseLocalNumber(customProtein) ?? 0,
        carbs: parseLocalNumber(customCarbs) ?? 0,
        fat: parseLocalNumber(customFat) ?? 0,
      });
      toast.success("Запись обновлена");
      closeDialog();
    } catch (err) {
      console.error(`[Meals] Ошибка обновления записи (id=${editingEntry._id}):`, err);
      toast.error("Не удалось обновить запись");
    }
  };

  const handleAddAllPlan = async () => {
    if (!plan) return;
    try {
      await addEntries({
        entries: plan.meals.flatMap((m) =>
          m.foods.map((f) => ({
            date: todayKey(),
            mealType: m.mealType,
            name: f.food.name,
            quantity: Math.round((f.amountGrams / f.food.servingGrams) * 10) / 10,
            calories: f.calories,
            protein: f.protein,
            carbs: f.carbs,
            fat: f.fat,
          })),
        ),
      });
      toast.success("План на день добавлен в дневник");
      setShowPlan(false);
    } catch (err) {
      console.error("[Meals] Ошибка добавления плана на день в дневник:", err);
      toast.error("Не удалось добавить план");
    }
  };

  /** Удалить запись из дневника с понятным фидбеком. */
  const handleDeleteEntry = async (id: Doc<"mealLog">["_id"], name: string) => {
    try {
      await deleteEntry({ id });
      toast.success(`${name} — удалено`);
    } catch (err) {
      console.error(`[Meals] Ошибка удаления записи (id=${id}):`, err);
      toast.error("Не удалось удалить запись");
    }
  };

  /** Удалить свой продукт из библиотеки с понятным фидбеком. */
  const handleDeleteFood = async (id: Doc<"foods">["_id"], name: string) => {
    try {
      await deleteFood({ id });
      toast.success(`${name} — удалено из моих продуктов`);
    } catch (err) {
      console.error(`[Meals] Ошибка удаления продукта (id=${id}):`, err);
      toast.error("Не удалось удалить продукт");
    }
  };

  const handleSaveFood = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const amount = parseLocalNumber(newFood.amount) ?? 100;
    const cals = parseLocalNumber(newFood.calories);
    if (!newFood.name.trim() || cals === null || cals <= 0) {
      toast.error("Укажите название и калории");
      return;
    }
    try {
      await addFood({
        name: newFood.name.trim(),
        amount,
        unit: newFood.unit.trim() || "г",
        calories: cals,
        protein: parseLocalNumber(newFood.protein) ?? 0,
        carbs: parseLocalNumber(newFood.carbs) ?? 0,
        fat: parseLocalNumber(newFood.fat) ?? 0,
      });
      toast.success("Продукт сохранён");
      setNewFood({
        name: "",
        amount: "100",
        unit: "г",
        calories: "",
        protein: "",
        carbs: "",
        fat: "",
      });
    } catch (err) {
      console.error("[Meals] Ошибка сохранения своего продукта:", err);
      toast.error("Не удалось сохранить продукт");
    }
  };

  const loading = profile === undefined || todayLog === undefined;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-lg border bg-muted/40" />
      </div>
    );
  }

  if (!targets) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="label-overline text-muted-foreground">Питание</p>
          <h1 className="m3-headline-large mt-2">Питание</h1>
        </header>
        <EmptyState
          icon={UtensilsCrossed}
          title="Цели ещё не рассчитаны"
          description="Настройте профиль — возраст, рост, вес, активность и цель — и получите дневные нормы по калориям и макросам."
          action={
            <Button asChild>
              <a href="/dashboard/profile">Перейти в профиль</a>
            </Button>
          }
        />
      </div>
    );
  }

  const calPct = Math.min(
    100,
    Math.round((totals.calories / targets.calories) * 100),
  );
  const calLeft = targets.calories - totals.calories;

  return (
    <div className="relative isolate mx-auto max-w-4xl space-y-10">
      <PageAurora />
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="label-overline text-muted-foreground">Питание</p>
          <h1 className="m3-headline-large mt-2">Рацион за сегодня</h1>
          <div
            aria-hidden
            className="mt-3 h-1 w-14 rounded-full bg-gradient-to-r from-brand to-brand-deep dark:from-brand-soft dark:to-brand"
          />
        </div>
        <DishScene className="hidden h-24 w-32 shrink-0 sm:block" />
      </header>

      {/* Totals summary — легенда + анимированные кольца макросов */}
      <ChartCard
        title="Итоги дня"
        subtitle="Потреблено против целей из профиля"
        legend={
          <>
            <LegendChip color="var(--brand)" label="Калории" />
            <LegendChip
              color="var(--muted-foreground)"
              dashed
              label={`Цель ${targets.calories.toLocaleString("ru-RU")} ккал`}
            />
            <span className="hidden h-3 w-px bg-border sm:block" />
            <LegendChip color="var(--foreground)" label="Белки" />
            <LegendChip color="var(--muted-foreground)" label="Углеводы" />
            <LegendChip color="var(--border)" label="Жиры" />
          </>
        }
      >
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <p className="label-overline text-muted-foreground">Калории</p>
            <p className="mt-2 text-3xl font-semibold num">
              {totals.calories.toLocaleString("ru-RU")}
              <span className="text-base text-muted-foreground">
                {" "}
                / {targets.calories.toLocaleString("ru-RU")}
              </span>
            </p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-brand"
                initial={{ width: 0 }}
                animate={{ width: `${calPct}%` }}
                transition={{ duration: 0.9, ease: "easeOut", delay: 0.05 }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground num">
              {calLeft > 0
                ? `Осталось ${calLeft.toLocaleString("ru-RU")} ккал до цели`
                : calLeft === 0
                  ? "Цель достигнута — ровно в ноль"
                  : `Превышено на ${Math.abs(calLeft).toLocaleString("ru-RU")} ккал`}
            </p>
          </div>
          <div className="grid grid-cols-3 items-center gap-2">
            <MacroRing
              label="Белки"
              value={totals.protein}
              target={targets.protein}
              color="var(--foreground)"
              delay={0.15}
              center="percent"
            />
            <MacroRing
              label="Углеводы"
              value={totals.carbs}
              target={targets.carbs}
              color="var(--muted-foreground)"
              delay={0.25}
              center="percent"
            />
            <MacroRing
              label="Жиры"
              value={totals.fat}
              target={targets.fat}
              color="var(--border)"
              delay={0.35}
              center="percent"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <p className="text-xs text-muted-foreground">
            {plan
              ? `${plan.meals.length} приёмов · ${plan.calories.toLocaleString("ru-RU")} ккал предложено`
              : ""}
          </p>
          <Button variant="outline" onClick={() => setShowPlan(true)}>
            <Sparkles className="size-4" />
            Сгенерировать план на день
          </Button>
        </div>
      </ChartCard>

      {/* Перенос записей из прошлого дня */}
      <section className="card-lift rounded-xl border bg-card p-5 shadow-elev-1">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="label-overline flex items-center gap-1.5 text-muted-foreground">
              <Copy className="size-3.5" />
              Перенос из прошлого дня
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Выберите день и скопируйте его записи в сегодняшний дневник.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="copy-date">День</Label>
              <Input
                id="copy-date"
                type="date"
                max={yesterdayKey}
                value={copyFromDate}
                onChange={(e) => setCopyFromDate(e.target.value)}
                className="h-10 w-44"
              />
            </div>
            <Button
              variant="secondary"
              className="h-10"
              onClick={handleCopyDay}
              disabled={
                copying ||
                !copyFromDate ||
                copyFromDate === todayKey() ||
                (copyLog ?? []).length === 0
              }
            >
              {copying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Copy className="size-4" />
              )}
              Скопировать в сегодня
            </Button>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {copyFromDate === todayKey() || !copyFromDate
            ? "Выберите прошедший день."
            : (copyLog ?? []).length === 0
              ? `Записей за ${shortDate(copyFromDate)} нет — выберите другой день.`
              : `Готово к копированию: ${copyLog!.length} ${pluralRecords(copyLog!.length)} за ${shortDate(copyFromDate)}.`}
        </p>
      </section>

      {/* Недельное меню под цель */}
      {weeklyPlan && targets && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <DishScene className="hidden size-14 shrink-0 sm:block" />
              <div className="min-w-0">
                <p className="label-overline text-muted-foreground">План на неделю</p>
                <h2 className="m3-title-large mt-1">Недельное меню</h2>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  7 разнообразных дней без повторов блюд. Порции и набор адаптированы
                  под выбранную цель — например при похудении меньше круп и масла,
                  при наборе массы больше углеводов и белка.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  "lose_weight",
                  "gain_muscle",
                  "maintain",
                  "improve_endurance",
                  "strength",
                ] as FitnessGoal[]
              ).map((g) => (
                <Chip
                  key={g}
                  selected={activeMenuGoal === g}
                  onClick={() => setMenuGoal(g)}
                >
                  {GOAL_LABELS[g]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {weeklyPlan.days.map((day, dIdx) => {
              const pct = Math.min(
                100,
                Math.round((day.calories / targets.calories) * 100),
              );
              return (
                <div
                  key={day.dateKey}
                  className="bg-noise card-lift overflow-hidden rounded-xl border bg-card shadow-elev-1"
                >
                  <div className="flex items-center justify-between gap-2 border-b bg-gradient-to-r from-secondary-container/70 to-secondary-container/20 px-4 py-2.5">
                    <span className="label-overline">
                      {WEEKDAY_SHORT[day.weekday]}
                      {dIdx === 0 && <span className="text-brand"> · сегодня</span>}
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {formatPrice(
                          day.meals.reduce((s, m) => s + m.priceByn, 0),
                        )}
                      </span>
                      <span className="text-xs font-semibold num">
                        {day.calories.toLocaleString("ru-RU")} ккал
                      </span>
                    </span>
                  </div>

                  <ul className="divide-y divide-border/60">
                    {day.meals.map((m) => {
                      const MealIcon = MEAL_ART[m.mealType].icon;
                      return (
                        // key должен быть уникальным: при «наборе массы» в дне два
                        // перекуса (mealType «snack»), одного типа недостаточно.
                        <li
                          key={`${m.mealType}-${m.name}`}
                          className="flex items-start gap-2.5 px-4 py-2.5"
                        >
                          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary-container/70 text-on-secondary-container">
                            <MealIcon className="size-3" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {MEAL_TYPE_LABELS[m.mealType]}
                              </span>
                              <span className="flex shrink-0 items-baseline gap-2">
                                <span className="text-[10px] text-muted-foreground">
                                  {formatPrice(m.priceByn)}
                                </span>
                                <span className="text-xs font-medium num">
                                  {m.calories} ккал
                                </span>
                              </span>
                            </div>
                            <p className="mt-1 text-sm font-medium leading-snug">
                              {m.name}
                            </p>
                            <p className="mt-1 flex gap-2.5 text-[10px] text-muted-foreground num">
                              <span>Б {m.protein}</span>
                              <span>У {m.carbs}</span>
                              <span>Ж {m.fat}</span>
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="border-t px-4 py-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-brand to-brand-deep"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{
                          duration: 0.7,
                          ease: "easeOut",
                          delay: 0.08 * dIdx,
                        }}
                      />
                    </div>
                    <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground num">
                      <span>Б {day.protein} г</span>
                      <span>У {day.carbs} г</span>
                      <span>Ж {day.fat} г</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Meal cards — M3 filled cards с placeholder-иллюстрациями */}
      <section className="grid gap-4 sm:grid-cols-2">
        {MEAL_TYPES.map((mt) => {
          const entries = byMeal[mt];
          const sectionCalories = entries.reduce((s, e) => s + e.calories, 0);
          const art = MEAL_ART[mt];
          const ArtIcon = art.icon;
          return (
            <div
              key={mt}
              className="card-lift overflow-hidden rounded-xl border bg-card shadow-elev-1"
            >
              {/* Placeholder-иллюстрация */}
              <div className="relative h-20 overflow-hidden bg-gradient-to-br from-secondary-container/80 to-primary-container/50">
                <ArtIcon className="absolute -right-2 -bottom-3 size-24 rotate-[-8deg] text-on-primary-container/25" />
                <div className="absolute inset-0 flex items-end justify-between p-3">
                  <span className="label-overline text-on-secondary-container">
                    {art.label}
                  </span>
                  <Badge
                    variant={sectionCalories > 0 ? "default" : "outline"}
                    className="gap-1"
                  >
                    <Sparkles className="size-3" />
                    {sectionCalories} ккал
                  </Badge>
                </div>
              </div>

              <div className="p-4">
                {entries.length === 0 ? (
                  <p className="py-3 text-center text-xs text-muted-foreground">
                    Пока ничего не записано.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {entries.map((e) => (
                      <li
                        key={e._id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {e.name}
                            {e.quantity !== 1 && (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                ×{e.quantity}
                              </span>
                            )}
                          </p>
                          {(e.calories > 0 || e.protein > 0) && (
                            <p className="mt-0.5 text-xs text-muted-foreground num">
                              Б {e.protein} · У {e.carbs} · Ж {e.fat}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="mr-1 text-xs font-medium num">
                            {e.calories} ккал
                          </span>
                          <button
                            type="button"
                            onClick={() => openEdit(e)}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Редактировать запись"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteEntry(e._id, e.name)}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                            aria-label={`Удалить ${e.name}`}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => setDialogMeal(mt)}
                >
                  <Plus className="size-3.5" />
                  Добавить в {art.label.toLowerCase()}
                </Button>
              </div>
            </div>
          );
        })}
      </section>

      <Separator />

      {/* Custom foods */}
      <section className="space-y-5">
        <div>
          <p className="label-overline text-muted-foreground">Мои продукты</p>
          <h2 className="m3-title-large mt-1">
            Свои продукты и блюда
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Сохраняйте продукты, которые едите часто, — запись займёт секунды.
          </p>
        </div>

        <form
          onSubmit={handleSaveFood}
          className="card-lift grid gap-3 rounded-xl border bg-card p-5 shadow-elev-1 sm:grid-cols-6"
        >
          <div className="sm:col-span-2">
            <Label htmlFor="nf-name">Название</Label>
            <Input
              id="nf-name"
              placeholder="Например, мой протеиновый коктейль"
              value={newFood.name}
              onChange={(e) => setNewFood((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="nf-amount">На</Label>
            <Input
              id="nf-amount"
              type="text"
              inputMode="decimal"
              value={newFood.amount}
              onChange={(e) =>
                setNewFood((f) => ({ ...f, amount: DECIMAL_INPUT(e.target.value) }))
              }
            />
          </div>
          <div>
            <Label htmlFor="nf-unit">Единица</Label>
            <Input
              id="nf-unit"
              value={newFood.unit}
              onChange={(e) => setNewFood((f) => ({ ...f, unit: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="nf-cal">ккал</Label>
            <Input
              id="nf-cal"
              type="text"
              inputMode="decimal"
              value={newFood.calories}
              onChange={(e) =>
                setNewFood((f) => ({ ...f, calories: DECIMAL_INPUT(e.target.value) }))
              }
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              Сохранить
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:col-span-6">
            {(
              [
                ["protein", "Белки (г)"],
                ["carbs", "Углеводы (г)"],
                ["fat", "Жиры (г)"],
              ] as const
            ).map(([key, labelText]) => (
              <div key={key}>
                <Label htmlFor={`nf-${key}`}>{labelText}</Label>
                <Input
                  id={`nf-${key}`}
                  type="text"
                  inputMode="decimal"
                  value={newFood[key]}
                  onChange={(e) =>
                    setNewFood((f) => ({ ...f, [key]: DECIMAL_INPUT(e.target.value) }))
                  }
                />
              </div>
            ))}
          </div>
        </form>

        {(foods ?? []).length > 0 && (
          <div className="card-lift overflow-hidden rounded-xl border bg-card shadow-elev-1">
            <div className="divide-y">
              {(foods ?? []).map((f) => (
                <div
                  key={f._id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground num">
                      {f.calories} ккал / {f.amount} {f.unit} · Б {f.protein} · У{" "}
                      {f.carbs} · Ж {f.fat}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDialogMeal("snack");
                        setCustomName(f.name);
                        setCustomCals(String(f.calories));
                        setCustomProtein(String(f.protein));
                        setCustomCarbs(String(f.carbs));
                        setCustomFat(String(f.fat));
                      }}
                      className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                      Записать
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteFood(f._id, f.name)}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      aria-label={`Удалить ${f.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Add/edit entry dialog */}
      <Dialog
        open={dialogMeal !== null}
        onOpenChange={(o) => !o && closeDialog()}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingEntry
                ? "Изменить запись"
                : `Добавить в ${dialogMeal ? MEAL_TYPE_LABELS[dialogMeal].toLowerCase() : ""}`}
            </DialogTitle>
            <DialogDescription>
              {editingEntry
                ? "Измените значения — запись в дневнике обновится."
                : "Выберите из библиотеки продуктов или добавьте вручную."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Приём пищи</Label>
              <Select
                // Fallback вместо undefined: при закрытии диалога dialogMeal
                // становится null, а Radix ещё держит контент смонтированным
                // во время exit-анимации — Select переключался бы
                // «controlled → uncontrolled» (warning в консоли у пользователя).
                value={dialogMeal ?? "breakfast"}
                onValueChange={(v) => setDialogMeal(v as MealType)}
              >
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map((mt) => (
                    <SelectItem key={mt} value={mt}>
                      {MEAL_TYPE_LABELS[mt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Библиотека — только при добавлении */}
            {!editingEntry && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="food-search">Поиск по библиотеке</Label>
                  <Input
                    id="food-search"
                    placeholder="курица, рис, овсянка…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="max-h-56 overflow-y-auto rounded-md border">
                    {FOOD_LIBRARY.filter((f) =>
                      f.name.toLowerCase().includes(search.toLowerCase()),
                    )
                      .slice(0, 30)
                      .map((f) => {
                        const active = selectedName === f.name;
                        return (
                          <button
                            key={f.name}
                            type="button"
                            onClick={() => setSelectedName(f.name)}
                            className={cn(
                              "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors",
                              active
                                ? "bg-secondary font-medium"
                                : "hover:bg-secondary/60",
                            )}
                          >
                            <span>{f.name}</span>
                            <span className="text-xs text-muted-foreground num">
                              {kcalPerServing(f.calories, f.servingGrams)} ккал /{" "}
                              {f.servingGrams}
                              {f.unit === "г" ? " г" : ` ${f.unit}`}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {selectedName && (
                  <div className="space-y-2">
                    <Label htmlFor="qty">Порций</Label>
                    <Input
                      id="qty"
                      type="text"
                      inputMode="decimal"
                      placeholder="1"
                      value={quantity}
                      onChange={(e) => setQuantity(DECIMAL_INPUT(e.target.value))}
                    />
                  </div>
                )}
              </>
            )}

            {!editingEntry && (
              <div className="flex items-center gap-3 py-1">
                <Separator className="flex-1" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Или своё
                </span>
                <Separator className="flex-1" />
              </div>
            )}

            {/* Свои значения — используется и для добавления, и для редактирования */}
            <div className="space-y-3">
              {editingEntry && (
                <div className="space-y-2">
                  <Label htmlFor="edit-qty">Порций</Label>
                  <Input
                    id="edit-qty"
                    type="text"
                    inputMode="decimal"
                    placeholder="1"
                    value={quantity}
                    onChange={(e) => setQuantity(DECIMAL_INPUT(e.target.value))}
                  />
                </div>
              )}
              <Input
                placeholder="Название продукта"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="ккал"
                  value={customCals}
                  onChange={(e) => setCustomCals(DECIMAL_INPUT(e.target.value))}
                />
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="Белки, г"
                  value={customProtein}
                  onChange={(e) => setCustomProtein(DECIMAL_INPUT(e.target.value))}
                />
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="Углеводы, г"
                  value={customCarbs}
                  onChange={(e) => setCustomCarbs(DECIMAL_INPUT(e.target.value))}
                />
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="Жиры, г"
                  value={customFat}
                  onChange={(e) => setCustomFat(DECIMAL_INPUT(e.target.value))}
                />
              </div>
              {editingEntry ? (
                <Button
                  className="w-full"
                  disabled={!customName.trim() || !customCals}
                  onClick={handleSaveEdit}
                >
                  Сохранить изменения
                </Button>
              ) : (
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={!customName.trim() || !customCals}
                  onClick={handleCustomAdd}
                >
                  Добавить своё
                </Button>
              )}
            </div>

            {!editingEntry && selectedName && (
              <Button className="w-full" onClick={handleAdd} disabled={!quantity}>
                Добавить в {dialogMeal ? MEAL_TYPE_LABELS[dialogMeal].toLowerCase() : "дневник"}
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Plan preview dialog */}
      <Dialog open={showPlan} onOpenChange={setShowPlan}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <DishScene className="hidden size-12 shrink-0 sm:block" />
              <div className="min-w-0">
                <DialogTitle>Предложенный план на сегодня</DialogTitle>
                <DialogDescription>
                  Меню под цель «{GOAL_LABELS[activeMenuGoal].toLowerCase()}» —
                  {targets.calories.toLocaleString("ru-RU")} ккал. Блюда совпадают с первым
                  днём недельного меню. После добавления всё можно отредактировать.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {plan && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {plan.meals.map((m: PlannedMeal) => (
                  // key: тип + название — при «наборе массы» перекусов два.
                  <div
                    key={`${m.mealType}-${m.name}`}
                    className="rounded-xl border bg-card p-4 shadow-elev-1"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide">
                        {MEAL_TYPE_LABELS[m.mealType]}
                      </p>
                      <p className="text-xs font-medium num">{m.calories} ккал</p>
                    </div>
                    <p className="mt-1 text-sm font-medium leading-snug">{m.name}</p>
                    <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground num">
                      <span>Б {m.protein}</span>
                      <span>У {m.carbs}</span>
                      <span>Ж {m.fat}</span>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {m.foods.map((f) => (
                        <li key={f.food.name} className="flex justify-between gap-2 text-xs">
                          <span className="text-muted-foreground">
                            {f.food.name}
                          </span>
                          <span className="text-right num">
                            {formatAmount(f.food, f.amountGrams)}
                            <span className="ml-1.5 text-muted-foreground">
                              {f.calories} ккал
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {/* Итог + прогресс к цели */}
              <div className="rounded-xl border bg-card p-4 shadow-elev-1">
                <div className="flex items-baseline justify-between">
                  <span className="label-overline text-muted-foreground">Итого</span>
                  <span className="text-lg font-semibold num">
                    {plan.calories.toLocaleString("ru-RU")}
                    <span className="text-sm text-muted-foreground">
                      {" "}
                      / {targets.calories.toLocaleString("ru-RU")} ккал
                    </span>
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-brand"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.min(100, Math.round((plan.calories / targets.calories) * 100))}%`,
                    }}
                    transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
                  />
                </div>
                <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground num">
                  <span>Б {plan.protein} г</span>
                  <span>У {plan.carbs} г</span>
                  <span>Ж {plan.fat} г</span>
                </div>
              </div>

              <Button className="w-full" onClick={handleAddAllPlan}>
                <Sparkles className="size-4" />
                Добавить всё в дневник
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
