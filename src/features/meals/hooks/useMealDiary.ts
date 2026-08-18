/**
 * Хук-состояние страницы «Питание» (/dashboard/meals): все запросы Convex,
 * локальное состояние (диалоги, поиск, перенос, фото, план) и обработчики.
 *
 * Вынесен из src/pages/Meals.tsx при рефакторинге в features/meals. Страница
 * стала тонкой: берёт объект из этого хука и раскладывает по компонентам.
 * Логика не менялась — только переезд; поведение гарантируют тесты страницы.
 */

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation, useQuery, useAction } from "convex/react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTrack } from "@/hooks/use-track";
import { usePremium } from "@/hooks/use-premium";
import type { PremiumFeature } from "@/lib/premium";
import {
  FOOD_LIBRARY,
  generateMealPlan,
  generateWeeklyMealPlan,
  type MealType,
} from "@/lib/mealLibrary";
import { MEAL_TYPE_LABELS } from "@/lib/i18n";
import {
  computeTargets,
  waterGoal,
  type FitnessGoal,
  type Targets,
} from "@/lib/nutrition";
import { addDays, pluralRecords, shortDate, toDateKey, todayKey } from "@/lib/dates";
import { searchOpenFoodFacts, type CatalogProduct } from "@/lib/productSearch";
import { parseLocalNumber } from "@/lib/utils";
import { type CustomFood, type NewFoodForm, type RecentFoodItem } from "../types";
import { remainingHint as buildRemainingHint } from "../lib/mealFormatting";
import { groupByMeal, totalsFromEntries } from "../lib/mealCalculations";
import {
  quantityStepFor,
  selectedPreview as buildSelectedPreview,
  stepQuantity as computeStepQuantity,
} from "../lib/portionScaling";

export interface MealDiary {
  // Данные (запросы Convex)
  profile: ReturnType<typeof useQuery<typeof api.profiles.getMyProfile>>;
  todayLog: ReturnType<typeof useQuery<typeof api.mealLog.getByDate>>;
  foods: ReturnType<typeof useQuery<typeof api.foods.listMyFoods>>;
  water: ReturnType<typeof useQuery<typeof api.water.getByDate>>;
  copyLog: ReturnType<typeof useQuery<typeof api.mealLog.getByDate>>;
  loading: boolean;

  // Производные
  targets: Targets | null;
  waterTarget: number;
  waterMl: number;
  byMeal: Record<MealType, NonNullable<MealDiary["todayLog"]>>;
  totals: { calories: number; protein: number; carbs: number; fat: number };
  activeMenuGoal: FitnessGoal;
  menuTargets: Targets | null;
  plan: ReturnType<typeof generateMealPlan> | null;
  weeklyPlan: ReturnType<typeof generateWeeklyMealPlan> | null;
  yesterdayKey: string;
  copyByMeal: Record<MealType, NonNullable<MealDiary["copyLog"]>>;
  copySelected: Set<string>;
  recentFoods: RecentFoodItem[];
  recentQuick: RecentFoodItem[];

  // Состояние UI
  paywallOpen: boolean;
  paywallFeature: PremiumFeature | undefined;
  dialogMeal: MealType | null;
  editingEntry: Doc<"mealLog"> | null;
  search: string;
  selectedName: string;
  quantity: string;
  customName: string;
  customCals: string;
  customProtein: string;
  customCarbs: string;
  customFat: string;
  newFood: NewFoodForm;
  copyFromDate: string;
  copying: boolean;
  repeatMeal: MealType | null;
  repeatSelected: Set<string>;
  adding: boolean;
  offResults: CatalogProduct[] | null;
  searchingOff: boolean;
  offError: string | null;
  offSelected: CatalogProduct | null;
  photoDataUrl: string | null;
  analyzingPhoto: boolean;
  photoError: string | null;
  menuGoal: FitnessGoal | null;
  showPlan: boolean;
  setOffResults: (r: CatalogProduct[] | null) => void;
  setOffSelected: (p: CatalogProduct | null) => void;
  setOffError: (e: string | null) => void;

  // Сеттеры и действия
  setPaywallOpen: (open: boolean) => void;
  openPaywall: (feature: PremiumFeature) => void;
  setDialogMeal: (m: MealType | null) => void;
  setSearch: (s: string) => void;
  setSelectedName: (n: string) => void;
  setQuantity: (q: string) => void;
  setCustomName: (v: string) => void;
  setCustomCals: (v: string) => void;
  setCustomProtein: (v: string) => void;
  setCustomCarbs: (v: string) => void;
  setCustomFat: (v: string) => void;
  setNewFood: (updater: (f: NewFoodForm) => NewFoodForm) => void;
  setCopyFromDate: (d: string) => void;
  setMenuGoal: (g: FitnessGoal | null) => void;
  setShowPlan: (v: boolean) => void;
  setRepeatMeal: (m: MealType | null) => void;
  openEdit: (entry: Doc<"mealLog">) => void;
  openQuickAdd: (name: string, qty: number, mealType?: MealType) => void;
  writeFoodToDialog: (f: CustomFood) => void;
  closeDialog: () => void;
  toggleCopyEntry: (id: string) => void;
  openRepeatMeal: (mealType: MealType) => void;
  toggleRepeatEntry: (id: string) => void;
  handleCopyDay: () => Promise<void>;
  handleRepeatMeal: () => Promise<void>;
  handleWater: (delta: number) => Promise<void>;
  handleQuickQty: (entry: Doc<"mealLog">, dir: 1 | -1) => Promise<void>;
  handleDeleteEntry: (id: Doc<"mealLog">["_id"], name: string) => Promise<void>;
  handleDeleteFood: (id: Doc<"foods">["_id"], name: string) => Promise<void>;
  handleAddAllPlan: () => Promise<void>;
  handlePhotoFile: (file: File | undefined) => void;
  handleAnalyzePhoto: () => Promise<void>;
  handleOffSearch: () => Promise<void>;
  stepQuantity: (dir: 1 | -1) => void;
  selectedPreview: () => {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null;
  handleAdd: () => Promise<void>;
  handleRecentAdd: (r: RecentFoodItem) => Promise<void>;
  handleCustomAdd: () => Promise<void>;
  handleSaveEdit: () => Promise<void>;
  handleSaveFood: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  remainingHint: (added: { calories: number; protein: number }) => string;
}

/** Быстрые «доборы» белка: привычные продукты с готовой порцией. Один тап —
 *  диалог открывается с выбранным продуктом, остаётся только добавить. */
const PROTEIN_BOOSTS: { name: string; qty: number }[] = [
  { name: "Творог (нежирный)", qty: 1 },
  { name: "Куриная грудка (гриль)", qty: 1 },
  { name: "Яйца", qty: 2 },
  { name: "Греческий йогурт (0%)", qty: 1 },
  { name: "Сывороточный протеин", qty: 1 },
];

export function useMealDiary(): MealDiary {
  const profile = useQuery(api.profiles.getMyProfile);
  const todayLog = useQuery(api.mealLog.getByDate, { date: todayKey() });
  const foods = useQuery(api.foods.listMyFoods, {});
  const water = useQuery(api.water.getByDate, { date: todayKey() });
  const addWater = useMutation(api.water.addWater);
  const addEntry = useMutation(api.mealLog.addEntry);
  const addEntries = useMutation(api.mealLog.addEntries);
  const updateEntry = useMutation(api.mealLog.updateEntry);
  const deleteEntry = useMutation(api.mealLog.deleteEntry);
  const addFood = useMutation(api.foods.addFood);
  const deleteFood = useMutation(api.foods.deleteFood);
  const analyzePhoto = useAction(api.photo.analyzeMealPhoto);
  const track = useTrack();
  const premium = usePremium();
  // Paywall-заглушка: открывается на premium-фиче (сейчас — фото-анализ).
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState<PremiumFeature | undefined>();

  /** Открыть paywall для premium-фичи + зафиксировать событие. */
  const openPaywall = (feature: PremiumFeature) => {
    setPaywallFeature(feature);
    setPaywallOpen(true);
    track("premium_feature_clicked", { feature });
    track("paywall_viewed", { feature });
  };

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
  const [newFood, setNewFood] = useState<NewFoodForm>({
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
  // Снятые для копирования записи по дню: по умолчанию отмечены все, снятие
  // хранится как «исключения» под датой — не нужно синхронизировать выбор
  // эффектом при смене дня или загрузке записей.
  const [copyDeselected, setCopyDeselected] = useState<
    Record<string, Set<string>>
  >({});
  // Повтор ОДНОГО приёма из прошлого дня («Обед вчера → Повторить»): тип
  // приёма + отмеченные записи (можно снять лишнее перед добавлением).
  const [repeatMeal, setRepeatMeal] = useState<MealType | null>(null);
  const [repeatSelected, setRepeatSelected] = useState<Set<string>>(new Set());
  // Защита от двойного добавления: пока мутация летит, кнопки заблокированы.
  const [adding, setAdding] = useState(false);
  // Реф-флаг — жёстче state: второй клик успевает случиться ДО re-render,
  // когда `adding` в замыкании обработчика ещё false. beginAdding/endAdding
  // проверяют флаг синхронно, поэтому дубль невозможен даже при медленной сети.
  const addingRef = useRef(false);

  /** Захватить «блокировку записи»; false — уже выполняется другая мутация. */
  const beginAdding = (): boolean => {
    if (addingRef.current) return false;
    addingRef.current = true;
    setAdding(true);
    return true;
  };

  /** Снять блокировку после завершения мутации. */
  const endAdding = () => {
    addingRef.current = false;
    setAdding(false);
  };

  const [showPlan, setShowPlan] = useState(false);

  // Внешний каталог Open Food Facts: результаты поиска по запросу, состояние
  // запроса и выбранный внешний продукт (макросы на 100 г, порция = 100 г).
  const [offResults, setOffResults] = useState<CatalogProduct[] | null>(null);
  const [searchingOff, setSearchingOff] = useState(false);
  const [offError, setOffError] = useState<string | null>(null);
  const [offSelected, setOffSelected] = useState<CatalogProduct | null>(null);

  // Фото-трекинг: снимок тарелки → Gemini Vision распознаёт блюдо → КБЖУ.
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Стиль недельного меню: по умолчанию — цель из профиля, можно переключить
  // на другой (например «Похудение»/«Набор массы»), чтобы посмотреть меню.
  const [menuGoal, setMenuGoal] = useState<FitnessGoal | null>(null);

  const targets = profile ? computeTargets(profile) : null;
  // Вода: норма ~33 мл на кг веса (как на главном экране), без профиля — 2 л.
  const waterTarget = profile ? waterGoal(profile.weightKg) : 2000;
  const waterMl = water?.amountMl ?? 0;

  const byMeal = useMemo(() => {
    return groupByMeal(todayLog ?? []);
  }, [todayLog]);

  const totals = useMemo(() => {
    return totalsFromEntries(todayLog ?? []);
  }, [todayLog]);

  /** «Что осталось после добавления» — короткая строка для тоста. */
  const remainingHint = (added: { calories: number; protein: number }): string => {
    if (!targets) return "";
    return buildRemainingHint(totals, targets, added);
  };

  const activeMenuGoal = menuGoal ?? (profile ? profile.fitnessGoal : "maintain");
  // Цели под выбранную цель меню: те же параметры тела, но цель чипа. Раньше
  // меню строилось под цель ПРОФИЛЯ — переключение «Похудение»/«Набор массы»
  // почти не меняло меню (всё подгонялось под одни и те же цели профиля), а
  // строка «К цели» сравнивала день с чужой целью. Теперь у каждой цели свои
  // калории/КБЖУ, и меню считается и показывается под СВОЮ цель.
  const menuTargets = profile
    ? computeTargets({ ...profile, fitnessGoal: activeMenuGoal })
    : null;
  // Дневной план строится под выбранную цель меню — если переключили стиль
  // меню на неделе, план на сегодня совпадает с первым днём недельного меню.
  const plan = useMemo(() => {
    if (!menuTargets) return null;
    return generateMealPlan(todayKey(), activeMenuGoal, menuTargets);
  }, [menuTargets, activeMenuGoal]);

  const weeklyPlan = useMemo(() => {
    if (!menuTargets) return null;
    return generateWeeklyMealPlan(activeMenuGoal, menuTargets);
  }, [menuTargets, activeMenuGoal]);

  // Записи выбранного «прошлого» дня — для предпросмотра количества.
  const copyLog = useQuery(api.mealLog.getByDate, { date: copyFromDate });
  const yesterdayKey = toDateKey(addDays(new Date(), -1));

  // Записи прошлого дня по приёмам — для быстрого повтора одного приёма.
  const copyByMeal = useMemo(() => {
    return groupByMeal(copyLog ?? []);
  }, [copyLog]);

  // Отмеченные для копирования записи: все записи выбранного дня минус
  // снятые галочки (исключения хранятся под датой дня).
  const copySelected = useMemo(() => {
    const deselected = copyDeselected[copyFromDate] ?? new Set<string>();
    const ids = (copyLog ?? [])
      .map((e) => e._id)
      .filter((id) => !deselected.has(id));
    return new Set(ids);
  }, [copyDeselected, copyFromDate, copyLog]);

  /** Недавние продукты: сегодняшний дневник + выбранный день (дедуп по имени).
   *  Быстрый повтор в один тап — не нужно искать заново. */
  const recentFoods = useMemo(() => {
    const seen = new Set<string>();
    const out: RecentFoodItem[] = [];
    // Сегодняшние записи идут первыми (оба списка отсортированы по убыванию).
    for (const e of [...(todayLog ?? []), ...(copyLog ?? [])]) {
      if (seen.has(e.name)) continue;
      seen.add(e.name);
      out.push({
        name: e.name,
        mealType: e.mealType,
        calories: e.calories,
        protein: e.protein,
        carbs: e.carbs,
        fat: e.fat,
        quantity: e.quantity,
      });
      if (out.length >= 6) break;
    }
    return out;
  }, [todayLog, copyLog]);

  /** «Недавнее» для страницы: только продукты из локальной библиотеки — их
   *  можно открыть с порцией в диалоге (свои/OFF-продукты остаются в
   *  «Недавнем» внутри диалога, где добавляются напрямую одним тапом). */
  const recentQuick = useMemo(() => {
    const libraryNames = new Set(FOOD_LIBRARY.map((f) => f.name));
    return recentFoods.filter((r) => libraryNames.has(r.name));
  }, [recentFoods]);

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
    setOffResults(null);
    setSearchingOff(false);
    setOffError(null);
    setOffSelected(null);
    setPhotoDataUrl(null);
    setAnalyzingPhoto(false);
    setPhotoError(null);
  };

  /** Прочитать выбранный файл как data URL (превью + отправка на распознавание).
   *  Лимит размера на клиенте: не тащим в память 20-МБ фото, которое сервер
   *  всё равно отклонит (>2.5 МБ base64 ≈ 1.9 МБ бинарных). */
  const handlePhotoFile = (file: File | undefined) => {
    setPhotoError(null);
    if (!file) return;
    // Фото-анализ — Premium-фича: показываем paywall-заглушку (оплата ещё
    // не подключена), а не «тихо ломаем» сценарий.
    if (!premium.canUse("photo_food_analysis")) {
      openPaywall("photo_food_analysis");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setPhotoError("Выберите файл изображения (JPEG/PNG/WebP).");
      return;
    }
    if (file.size > 1_900_000) {
      setPhotoError("Фото слишком большое — выберите файл до 2 МБ.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(String(reader.result ?? ""));
    reader.onerror = () => setPhotoError("Не удалось прочитать файл.");
    reader.readAsDataURL(file);
  };

  /** Распознать блюдо на фото: результат сразу добавляется в дневник
   *  выбранного приёма. Распознавание и сохранение — отдельные try, чтобы
   *  ошибка дневника не маскировалась под «не распознал фото». */
  const handleAnalyzePhoto = async () => {
    if (!dialogMeal || !photoDataUrl) return;
    track("photo_analysis_started");
    if (!beginAdding()) return;
    setAnalyzingPhoto(true);
    setPhotoError(null);
    let items: Awaited<ReturnType<typeof analyzePhoto>>["items"] = [];
    try {
      const res = await analyzePhoto({ imageDataUrl: photoDataUrl });
      items = res.items;
    } catch (err) {
      console.error("[Meals] Ошибка распознавания фото:", err);
      setPhotoError(
        err instanceof Error && /Слишком часто/.test(err.message)
          ? "Слишком часто — подождите немного и попробуйте ещё раз."
          : "Не удалось распознать фото — проверьте интернет и попробуйте ещё раз.",
      );
      return;
    } finally {
      setAnalyzingPhoto(false);
      endAdding();
    }

    if (items.length === 0) {
      setPhotoError(
        "Не удалось разобрать блюдо на фото — попробуйте ближе или добавьте вручную.",
      );
      return;
    }
    try {
      await addEntries({
        entries: items.map((i) => ({
          date: todayKey(),
          mealType: dialogMeal,
          name: i.name,
          quantity: i.quantity,
          calories: i.calories,
          protein: i.protein,
          carbs: i.carbs,
          fat: i.fat,
        })),
      });
      toast.success(`Распознано: ${items.length} ${pluralRecords(items.length)} — добавлено в дневник`);
      track("photo_analysis_completed", { items: items.length });
      track("meal_added", { count: items.length, source: "photo" });
      closeDialog();
    } catch (err) {
      console.error("[Meals] Ошибка сохранения распознанного фото:", err);
      toast.error("Не удалось добавить распознанное — попробуйте ещё раз");
    }
  };

  /** Поиск в Open Food Facts: внешний каталог за пределами кураторской
   *  библиотеки. Ошибка сети/пустой результат не ломают диалог — показываем
   *  понятное сообщение, локальная библиотека остаётся доступной. */
  const handleOffSearch = async () => {
    const q = search.trim();
    if (q.length < 2) {
      toast.error("Введите минимум 2 символа для поиска в каталоге");
      return;
    }
    setSearchingOff(true);
    setOffError(null);
    setOffSelected(null);
    try {
      const res = await searchOpenFoodFacts(q);
      setOffResults(res);
      if (res.length === 0) setOffError("В каталоге ничего не нашлось — попробуйте короче.");
    } catch {
      setOffResults([]);
      setOffError("Каталог недоступен — проверьте интернет и попробуйте ещё раз.");
    } finally {
      setSearchingOff(false);
    }
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

  /** Отметить/снять запись в списке копирования (снятие — под датой дня). */
  const toggleCopyEntry = (id: string) => {
    setCopyDeselected((m) => {
      const cur = m[copyFromDate] ?? new Set<string>();
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...m, [copyFromDate]: next };
    });
  };

  /** Отметить/снять запись в диалоге повтора одного приёма. */
  const toggleRepeatEntry = (id: string) => {
    setRepeatSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Скопировать записи в сегодняшний дневник (общая логика для «копировать
   *  день» и «повторить приём»). Возвращает true при успехе — вызвавший код
   *  решает, закрывать ли свой диалог/состояние. */
  const copyEntriesToToday = async (
    entries: NonNullable<typeof todayLog>,
    sourceLabel: string,
  ): Promise<boolean> => {
    if (entries.length === 0) return false;
    if (!beginAdding()) return false;
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
      toast.success(`Скопировано записей: ${entries.length} из ${sourceLabel}`);
      track("meal_added", { count: entries.length, source: "copy_day" });
      return true;
    } catch (err) {
      console.error("[Meals] Ошибка копирования записей из прошлого дня:", err);
      toast.error("Не удалось скопировать записи");
      return false;
    } finally {
      endAdding();
    }
  };

  /** Скопировать выбранные записи дня в сегодняшний дневник. */
  const handleCopyDay = async () => {
    if (!copyFromDate || copyFromDate === todayKey()) return;
    const entries = (copyLog ?? []).filter((e) => copySelected.has(e._id));
    if (entries.length === 0) {
      toast.error("Выберите хотя бы одну запись");
      return;
    }
    setCopying(true);
    try {
      await copyEntriesToToday(entries, shortDate(copyFromDate));
    } finally {
      setCopying(false);
    }
  };

  /** Открыть диалог повтора одного приёма: записи приёма отмечены по
   *  умолчанию, лишние можно снять перед добавлением. */
  const openRepeatMeal = (mealType: MealType) => {
    setRepeatMeal(mealType);
    setRepeatSelected(new Set(copyByMeal[mealType].map((e) => e._id)));
  };

  /** Повторить отмеченные записи приёма из прошлого дня в сегодня. */
  const handleRepeatMeal = async () => {
    if (!repeatMeal) return;
    const entries = copyByMeal[repeatMeal].filter((e) =>
      repeatSelected.has(e._id),
    );
    if (entries.length === 0) {
      toast.error("Выберите хотя бы одну запись");
      return;
    }
    const ok = await copyEntriesToToday(
      entries,
      `${MEAL_TYPE_LABELS[repeatMeal].toLowerCase()} (${shortDate(copyFromDate)})`,
    );
    if (ok) setRepeatMeal(null);
  };

  /** Шаг порции для −/+: внешний каталог (граммы) — по 100 г, штучные
   *  продукты — целыми штуками, граммовые — по 0.5 порции. */
  const quantityStep = (): number => {
    const qtyFood = FOOD_LIBRARY.find((f) => f.name === selectedName);
    return quantityStepFor(qtyFood, offSelected !== null);
  };

  /** Изменить порцию кнопками −/+ с округлением до шага. */
  const stepQuantity = (dir: 1 | -1) => {
    const cur = parseLocalNumber(quantity) ?? 1;
    const next = computeStepQuantity(cur, quantityStep(), dir);
    setQuantity(String(next));
  };

  /** Что добавится при текущем количестве: макросы выбранного продукта. */
  const selectedPreview = () => {
    const qtyNum = parseLocalNumber(quantity) ?? 0;
    const food =
      FOOD_LIBRARY.find((f) => f.name === selectedName) ?? offSelected;
    return buildSelectedPreview(food, qtyNum, offSelected !== null);
  };

  const handleAdd = async () => {
    if (!dialogMeal || !selectedName) return;
    const qty = parseLocalNumber(quantity);
    if (qty === null || qty <= 0) {
      toast.error("Порций: укажите число больше нуля, например 1,5.");
      return;
    }
    // Локальная библиотека первая; внешний продукт из OFF — если не нашли.
    const food =
      FOOD_LIBRARY.find((f) => f.name === selectedName) ?? offSelected;
    // Защита от «тихого» no-op: если продукт не разрешился (например, выбран
    // внешний, а потом запрос изменили), сообщаем вместо молчаливого выхода.
    if (!food) {
      toast.error("Выберите продукт из списка");
      return;
    }
    const ratio = (qty * food.servingGrams) / 100; // от 100 г к выбранному количеству
    if (!beginAdding()) return;
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
      toast.success(`${food.name} — добавлено`, {
        description: remainingHint({
          calories: Math.round(food.calories * ratio),
          protein: Math.round(food.protein * ratio * 10) / 10,
        }),
      });
      track("meal_added", {
        calories: Math.round(food.calories * ratio),
        mealType: dialogMeal,
      });
      closeDialog();
    } catch (err) {
      console.error("[Meals] Ошибка добавления продукта из библиотеки:", err);
      toast.error("Не удалось добавить продукт");
    } finally {
      endAdding();
    }
  };

  /** Быстрый повтор: добавить продукт из «Недавнего» одним тапом. */
  const handleRecentAdd = async (r: RecentFoodItem) => {
    if (!dialogMeal) return;
    if (!beginAdding()) return;
    try {
      await addEntry({
        date: todayKey(),
        mealType: dialogMeal,
        name: r.name,
        quantity: r.quantity,
        calories: r.calories,
        protein: r.protein,
        carbs: r.carbs,
        fat: r.fat,
      });
      toast.success(`${r.name} — добавлено`, {
        description: remainingHint({ calories: r.calories, protein: r.protein }),
      });
      track("meal_added", { calories: r.calories, mealType: dialogMeal, source: "recent" });
      closeDialog();
    } catch (err) {
      console.error("[Meals] Ошибка быстрого добавления из недавних:", err);
      toast.error("Не удалось добавить продукт");
    } finally {
      endAdding();
    }
  };

  const handleCustomAdd = async () => {
    if (!dialogMeal || addingRef.current) return;
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
    if (!beginAdding()) return;
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
      toast.success(`${customName.trim()} — добавлено`, {
        description: remainingHint({ calories: cals, protein: p }),
      });
      track("meal_added", { calories: cals, mealType: dialogMeal, source: "custom" });
      closeDialog();
    } catch (err) {
      console.error("[Meals] Ошибка добавления своего продукта:", err);
      toast.error("Не удалось добавить продукт");
    } finally {
      endAdding();
    }
  };

  const handleSaveEdit = async () => {
    if (!editingEntry || addingRef.current) return;
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
    if (!beginAdding()) return;
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
    } finally {
      endAdding();
    }
  };

  const handleAddAllPlan = async () => {
    if (!plan) return;
    if (!beginAdding()) return;
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
      track("meal_added", { count: plan.meals.length, source: "plan" });
      setShowPlan(false);
    } catch (err) {
      console.error("[Meals] Ошибка добавления плана на день в дневник:", err);
      toast.error("Не удалось добавить план");
    } finally {
      endAdding();
    }
  };

  /** Шаг −/+ быстрой правки порции записи: штучные продукты — целыми штуками,
   *  остальные — полпорции (как в диалоге добавления). */
  const quickQtyStep = (name: string) => {
    const food = FOOD_LIBRARY.find((f) => f.name === name);
    return quantityStepFor(food, false);
  };

  /** Быстрая правка порции без открытия диалога: −/+ на строке записи,
   *  КБЖУ пересчитываются пропорционально количеству. */
  const handleQuickQty = async (entry: Doc<"mealLog">, dir: 1 | -1) => {
    const cur = entry.quantity ?? 1;
    const next = computeStepQuantity(cur, quickQtyStep(entry.name), dir);
    if (next === cur) return;
    if (!beginAdding()) return;
    const ratio = next / cur;
    try {
      await updateEntry({
        id: entry._id,
        mealType: entry.mealType,
        name: entry.name,
        quantity: next,
        calories: Math.round(entry.calories * ratio),
        protein: Math.round(entry.protein * ratio * 10) / 10,
        carbs: Math.round(entry.carbs * ratio * 10) / 10,
        fat: Math.round(entry.fat * ratio * 10) / 10,
      });
    } catch (err) {
      console.error(`[Meals] Ошибка быстрой правки порции (id=${entry._id}):`, err);
      toast.error("Не удалось изменить порцию");
    } finally {
      endAdding();
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

  /** Быстрая вода прямо со страницы питания — как на главном экране. */
  const handleWater = async (delta: number) => {
    const prev = waterMl;
    try {
      await addWater({ date: todayKey(), amountMl: delta });
      if (prev < waterTarget && prev + delta >= waterTarget) {
        toast.success("Цель по воде достигнута! 🎉");
      }
    } catch (err) {
      console.error(`[Meals] Ошибка обновления воды (delta=${delta}):`, err);
      toast.error("Не удалось обновить воду");
    }
  };

  /** Открыть диалог добавления с уже выбранным продуктом и порцией — осталось
   *  только «Добавить». Используется «Недавним» на странице и чипами белка:
   *  один тап вместо поиска с нуля. */
  const openQuickAdd = (name: string, qty: number, mealType: MealType = "snack") => {
    setDialogMeal(mealType);
    setEditingEntry(null);
    // Поиск подставляем названием — выбранный продукт виден в списке рядом.
    setSearch(name);
    setSelectedName(name);
    setQuantity(String(qty));
    setCustomName("");
    setCustomCals("");
    setCustomProtein("");
    setCustomCarbs("");
    setCustomFat("");
    setOffResults(null);
    setSearchingOff(false);
    setOffError(null);
    setOffSelected(null);
    setPhotoDataUrl(null);
    setAnalyzingPhoto(false);
    setPhotoError(null);
  };

  /** «Записать» свой продукт из списка: открыть диалог со значениями продукта. */
  const writeFoodToDialog = (f: CustomFood) => {
    setDialogMeal("snack");
    setCustomName(f.name);
    setCustomCals(String(f.calories));
    setCustomProtein(String(f.protein));
    setCustomCarbs(String(f.carbs));
    setCustomFat(String(f.fat));
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

  return {
    profile,
    todayLog,
    foods,
    water,
    copyLog,
    loading,
    targets,
    waterTarget,
    waterMl,
    byMeal,
    totals,
    activeMenuGoal,
    menuTargets,
    plan,
    weeklyPlan,
    yesterdayKey,
    copyByMeal,
    copySelected,
    recentFoods,
    recentQuick,
    paywallOpen,
    paywallFeature,
    dialogMeal,
    editingEntry,
    search,
    selectedName,
    quantity,
    customName,
    customCals,
    customProtein,
    customCarbs,
    customFat,
    newFood,
    copyFromDate,
    copying,
    repeatMeal,
    repeatSelected,
    adding,
    offResults,
    searchingOff,
    offError,
    offSelected,
    photoDataUrl,
    analyzingPhoto,
    photoError,
    menuGoal,
    showPlan,
    setOffResults,
    setOffSelected,
    setOffError,
    setPaywallOpen,
    openPaywall,
    setDialogMeal,
    setSearch,
    setSelectedName,
    setQuantity,
    setCustomName,
    setCustomCals,
    setCustomProtein,
    setCustomCarbs,
    setCustomFat,
    setNewFood,
    setCopyFromDate,
    setMenuGoal,
    setShowPlan,
    setRepeatMeal,
    openEdit,
    openQuickAdd,
    writeFoodToDialog,
    closeDialog,
    toggleCopyEntry,
    openRepeatMeal,
    toggleRepeatEntry,
    handleCopyDay,
    handleRepeatMeal,
    handleWater,
    handleQuickQty,
    handleDeleteEntry,
    handleDeleteFood,
    handleAddAllPlan,
    handlePhotoFile,
    handleAnalyzePhoto,
    handleOffSearch,
    stepQuantity,
    selectedPreview,
    handleAdd,
    handleRecentAdd,
    handleCustomAdd,
    handleSaveEdit,
    handleSaveFood,
    remainingHint,
  };
}

// Экспорт для компонентов: быстрые «доборы» белка (чипы в сводке дня).
export { PROTEIN_BOOSTS };
