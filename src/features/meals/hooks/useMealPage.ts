/**
 * Хук-состояние страницы «Питание»: все запросы Convex, локальное состояние
 * (диалоги, поиск, перенос, фото, план) и обработчики.
 *
 * MealsPage — тонкая обёртка: берёт объект из этого хука и раскладывает
 * по компонентам. Логика не менялась — только вынос.
 */
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation, useQuery, useAction } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTrack } from "@/hooks/use-track";
import { usePremium } from "@/hooks/use-premium";
import type { PremiumFeature } from "@/lib/premium";
import { toast } from "sonner";
import {
  FOOD_LIBRARY,
  generateMealPlan,
  generateWeeklyMealPlan,
  type MealType,
} from "@/lib/mealLibrary";
import { MEAL_TYPE_LABELS } from "@/lib/i18n";
import { computeTargets, waterGoal, type FitnessGoal, type Targets } from "@/lib/nutrition";
import { addDays, pluralRecords, shortDate, toDateKey, todayKey } from "@/lib/dates";
import { searchOpenFoodFacts, type CatalogProduct } from "@/lib/productSearch";
import { parseLocalNumber } from "@/lib/utils";
import {
  macrosForQuantity,
  newIdempotencyKey,
  quantityStep,
  quickQtyStep,
} from "../lib/mealUtils";
import {
  buildPhotoReviewItems,
  photoFileError,
  readPhotoFile,
  type PhotoReviewItem,
} from "../lib/photo";

export interface MealPageState {
  // Data
  profile: Doc<"profiles"> | null | undefined;
  todayLog: Doc<"mealLog">[] | undefined;
  foods: Doc<"foods">[] | undefined;
  water: Doc<"waterEntries"> | null | undefined;
  targets: Targets | null;
  waterTarget: number;
  waterMl: number;

  // Derived data
  byMeal: Record<MealType, NonNullable<Doc<"mealLog">[]>>;
  totals: { calories: number; protein: number; carbs: number; fat: number };
  recentFoods: Array<{
    name: string; mealType: MealType; calories: number;
    protein: number; carbs: number; fat: number; quantity: number;
  }>;
  recentQuick: Array<{
    name: string; mealType: MealType; calories: number;
    protein: number; carbs: number; fat: number; quantity: number;
  }>;

  // Dialog state
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
  adding: boolean;

  // Custom food
  newFood: { name: string; amount: string; unit: string; calories: string; protein: string; carbs: string; fat: string };

  // Copy day
  copyFromDate: string;
  copying: boolean;
  copyLog: Doc<"mealLog">[] | undefined;
  copyByMeal: Record<MealType, NonNullable<Doc<"mealLog">[]>>;
  copySelected: Set<string>;
  repeatMeal: MealType | null;
  repeatSelected: Set<string>;
  yesterdayKey: string;

  // OFF
  offResults: CatalogProduct[] | null;
  searchingOff: boolean;
  offError: string | null;
  offSelected: CatalogProduct | null;

  // Photo
  photoDataUrl: string | null;
  analyzingPhoto: boolean;
  photoError: string | null;
  photoReview: PhotoReviewItem[] | null;

  // Plan
  showPlan: boolean;
  menuGoal: FitnessGoal | null;
  activeMenuGoal: FitnessGoal;
  menuTargets: Targets | null;
  plan: ReturnType<typeof generateMealPlan> | null;
  weeklyPlan: ReturnType<typeof generateWeeklyMealPlan> | null;

  // Premium
  paywallOpen: boolean;
  paywallFeature: PremiumFeature | undefined;

  // Refs
  selectedPanelRef: React.RefObject<HTMLDivElement | null>;
  addingRef: React.MutableRefObject<boolean>;
}

export interface MealPageActions {
  // Dialog
  setDialogMeal: (v: MealType | null) => void;
  setSearch: (v: string) => void;
  setSelectedName: (v: string) => void;
  setQuantity: (v: string) => void;
  setCustomName: (v: string) => void;
  setCustomCals: (v: string) => void;
  setCustomProtein: (v: string) => void;
  setCustomCarbs: (v: string) => void;
  setCustomFat: (v: string) => void;
  closeDialog: () => void;
  openEdit: (entry: Doc<"mealLog">) => void;
  openQuickAdd: (name: string, qty: number, mealType?: MealType) => void;
  stepQuantity: (dir: 1 | -1) => void;
  selectedPreview: () => { kcal: number; protein: number; carbs: number; fat: number } | null;
  beginAdding: () => boolean;
  endAdding: () => void;

  // Mutations
  handleAdd: () => Promise<void>;
  handleRecentAdd: (r: { name: string; mealType: MealType; calories: number; protein: number; carbs: number; fat: number; quantity: number }) => Promise<void>;
  handleCustomAdd: () => Promise<void>;
  handleSaveEdit: () => Promise<void>;
  handleQuickQty: (entry: Doc<"mealLog">, dir: 1 | -1) => Promise<void>;
  handleDeleteEntry: (id: Doc<"mealLog">["_id"], name: string) => Promise<void>;
  handleDeleteFood: (id: Doc<"foods">["_id"], name: string) => Promise<void>;
  handleWater: (delta: number) => Promise<void>;

  // Photo
  handlePhotoFile: (file: File | undefined) => Promise<void>;
  handleAnalyzePhoto: () => Promise<void>;
  handleConfirmPhoto: () => Promise<void>;
  updateReviewQuantity: (key: string, delta: number) => void;
  removeReviewItem: (key: string) => void;

  // OFF
  handleOffSearch: () => Promise<void>;
  setOffSelected: (v: CatalogProduct | null) => void;

  // Copy day
  setCopyFromDate: (v: string) => void;
  toggleCopyEntry: (id: string) => void;
  handleCopyDay: () => Promise<void>;
  openRepeatMeal: (mealType: MealType) => void;
  setRepeatMeal: (v: MealType | null) => void;
  toggleRepeatEntry: (id: string) => void;
  handleRepeatMeal: () => Promise<void>;

  // Custom food
  setNewFood: (v: React.SetStateAction<{ name: string; amount: string; unit: string; calories: string; protein: string; carbs: string; fat: string }>) => void;
  handleSaveFood: (e: React.FormEvent<HTMLFormElement>) => void;

  // Plan
  setShowPlan: (v: boolean) => void;
  setMenuGoal: (v: FitnessGoal | null) => void;
  handleAddAllPlan: () => Promise<void>;

  // Premium
  openPaywall: (feature: PremiumFeature) => void;
  setPaywallOpen: (v: boolean) => void;
  // Track
  track: (name: string, meta?: Record<string, unknown>) => void;

  // Loading
  loading: boolean;
}

export function useMealPage(): MealPageState & MealPageActions {
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
  // Expose track for components that need it (e.g. photo reject)
  const trackFn: (name: string, meta?: Record<string, unknown>) => void = (name, meta) => track(name as Parameters<typeof track>[0], meta as Parameters<typeof track>[1]);
  const premium = usePremium();

  // Paywall
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState<PremiumFeature | undefined>();
  const openPaywall = (feature: PremiumFeature) => {
    setPaywallFeature(feature);
    setPaywallOpen(true);
    track("premium_feature_clicked", { feature });
    track("paywall_viewed", { feature });
  };

  // Add/edit dialog state
  const [dialogMeal, setDialogMeal] = useState<MealType | null>(null);
  const [editingEntry, setEditingEntry] = useState<Doc<"mealLog"> | null>(null);
  const [search, setSearch] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [customName, setCustomName] = useState("");
  const [customCals, setCustomCals] = useState("");
  const [customProtein, setCustomProtein] = useState("");
  const [customCarbs, setCustomCarbs] = useState("");
  const [customFat, setCustomFat] = useState("");

  // Custom food state
  const [newFood, setNewFood] = useState({
    name: "", amount: "100", unit: "г",
    calories: "", protein: "", carbs: "", fat: "",
  });

  // Copy day
  const [copyFromDate, setCopyFromDate] = useState(() => toDateKey(addDays(new Date(), -1)));
  const [copying, setCopying] = useState(false);
  const [copyDeselected, setCopyDeselected] = useState<Record<string, Set<string>>>({});
  const [repeatMeal, setRepeatMeal] = useState<MealType | null>(null);
  const [repeatSelected, setRepeatSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);
  const beginAdding = (): boolean => {
    if (addingRef.current) return false;
    addingRef.current = true;
    setAdding(true);
    return true;
  };
  const endAdding = () => { addingRef.current = false; setAdding(false); };
  const selectedPanelRef = useRef<HTMLDivElement | null>(null);

  // Plan
  const [showPlan, setShowPlan] = useState(false);
  const [menuGoal, setMenuGoal] = useState<FitnessGoal | null>(null);

  // OFF
  const [offResults, setOffResults] = useState<CatalogProduct[] | null>(null);
  const [searchingOff, setSearchingOff] = useState(false);
  const [offError, setOffError] = useState<string | null>(null);
  const [offSelected, setOffSelected] = useState<CatalogProduct | null>(null);

  // Photo
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoReview, setPhotoReview] = useState<PhotoReviewItem[] | null>(null);

  // ─── Derived ───
  const targets = profile ? computeTargets(profile) : null;
  const waterTarget = profile ? waterGoal(profile.weightKg) : 2000;
  const waterMl = water?.amountMl ?? 0;

  const byMeal = useMemo(() => {
    const map: Record<MealType, NonNullable<typeof todayLog>> = { breakfast: [], lunch: [], dinner: [], snack: [] };
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

  const remainingHint = (added: { calories: number; protein: number }): string => {
    if (!targets) return "";
    const calLeft = Math.round(targets.calories - totals.calories - added.calories);
    const proteinLeft = Math.round(targets.protein - totals.protein - added.protein);
    const cal = calLeft > 0 ? `осталось ${calLeft.toLocaleString("ru-RU")} ккал`
      : calLeft === 0 ? "дневная норма ккал закрыта"
      : `перебор ${Math.abs(calLeft).toLocaleString("ru-RU")} ккал`;
    const prot = proteinLeft > 0 ? `белка ещё ${proteinLeft} г`
      : proteinLeft === 0 ? "белок набран" : "";
    return prot ? `${cal} · ${prot}` : cal;
  };

  const activeMenuGoal = menuGoal ?? (profile ? profile.fitnessGoal : "maintain");
  const menuTargets = profile ? computeTargets({ ...profile, fitnessGoal: activeMenuGoal }) : null;
  const plan = useMemo(() => menuTargets ? generateMealPlan(todayKey(), activeMenuGoal, menuTargets) : null, [menuTargets, activeMenuGoal]);
  const weeklyPlan = useMemo(() => menuTargets ? generateWeeklyMealPlan(activeMenuGoal, menuTargets) : null, [menuTargets, activeMenuGoal]);

  const copyLog = useQuery(api.mealLog.getByDate, { date: copyFromDate });
  const yesterdayKey = toDateKey(addDays(new Date(), -1));

  const copyByMeal = useMemo(() => {
    const map: Record<MealType, NonNullable<typeof copyLog>> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    for (const e of copyLog ?? []) map[e.mealType] = [...map[e.mealType], e];
    return map;
  }, [copyLog]);

  const copySelected = useMemo(() => {
    const deselected = copyDeselected[copyFromDate] ?? new Set<string>();
    return new Set((copyLog ?? []).map((e) => e._id).filter((id) => !deselected.has(id)));
  }, [copyDeselected, copyFromDate, copyLog]);

  const recentFoods = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ name: string; mealType: MealType; calories: number; protein: number; carbs: number; fat: number; quantity: number }> = [];
    for (const e of [...(todayLog ?? []), ...(copyLog ?? [])]) {
      if (seen.has(e.name)) continue;
      seen.add(e.name);
      out.push({ name: e.name, mealType: e.mealType, calories: e.calories, protein: e.protein, carbs: e.carbs, fat: e.fat, quantity: e.quantity });
      if (out.length >= 6) break;
    }
    return out;
  }, [todayLog, copyLog]);

  const recentQuick = useMemo(() => {
    const libraryNames = new Set(FOOD_LIBRARY.map((f) => f.name));
    return recentFoods.filter((r) => libraryNames.has(r.name));
  }, [recentFoods]);

  // ─── Dialog actions ───
  const closeDialog = () => {
    setDialogMeal(null);
    setEditingEntry(null);
    setSearch(""); setSelectedName(""); setQuantity("1");
    setCustomName(""); setCustomCals(""); setCustomProtein(""); setCustomCarbs(""); setCustomFat("");
    setOffResults(null); setSearchingOff(false); setOffError(null); setOffSelected(null);
    setPhotoDataUrl(null); setAnalyzingPhoto(false); setPhotoError(null); setPhotoReview(null);
  };

  const openEdit = (entry: Doc<"mealLog">) => {
    setEditingEntry(entry);
    setDialogMeal(entry.mealType);
    setQuantity(String(entry.quantity ?? 1));
    setCustomName(entry.name);
    setCustomCals(String(entry.calories));
    setCustomProtein(String(entry.protein));
    setCustomCarbs(String(entry.carbs));
    setCustomFat(String(entry.fat));
    setSearch(""); setSelectedName("");
  };

  const openQuickAdd = (name: string, qty: number, mealType: MealType = "snack") => {
    setDialogMeal(mealType); setEditingEntry(null);
    setSearch(name); setSelectedName(name); setQuantity(String(qty));
    setCustomName(""); setCustomCals(""); setCustomProtein(""); setCustomCarbs(""); setCustomFat("");
    setOffResults(null); setSearchingOff(false); setOffError(null); setOffSelected(null);
    setPhotoDataUrl(null); setAnalyzingPhoto(false); setPhotoError(null); setPhotoReview(null);
  };

  const stepQuantity = (dir: 1 | -1) => {
    const cur = parseLocalNumber(quantity) ?? 1;
    const step = quantityStep(selectedName, !!offSelected);
    setQuantity(String(Math.max(0.5, Math.round((cur + dir * step) * 10) / 10)));
  };

  const selectedPreview = (): { kcal: number; protein: number; carbs: number; fat: number } | null => {
    const qtyNum = parseLocalNumber(quantity) ?? 0;
    if (qtyNum <= 0 || !selectedName) return null;
    const food = FOOD_LIBRARY.find((f) => f.name === selectedName) ?? offSelected;
    return food ? macrosForQuantity(food, qtyNum) : null;
  };

  // ─── Scroll to selected panel ───
  useEffect(() => {
    if (offSelected) selectedPanelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [offSelected]);

  // ─── Mutations ───
  const handleAdd = async () => {
    if (!dialogMeal || !selectedName) return;
    const qty = parseLocalNumber(quantity);
    if (qty === null || qty <= 0) { toast.error("Порций: укажите число больше нуля, например 1,5."); return; }
    const food = FOOD_LIBRARY.find((f) => f.name === selectedName) ?? offSelected;
    if (!food) { toast.error("Выберите продукт из списка"); return; }
    const preview = macrosForQuantity(food, qty);
    if (!beginAdding()) return;
    try {
      await addEntry({
        date: todayKey(), mealType: dialogMeal, name: food.name,
        quantity: Math.round(qty * 10) / 10,
        calories: preview.kcal, protein: preview.protein, carbs: preview.carbs, fat: preview.fat,
        nutritionSource: offSelected ? "open_food_facts" : "verified",
        sourceId: offSelected?.barcode,
        idempotencyKey: newIdempotencyKey("meal-add"),
      });
      toast.success(`${food.name} — добавлено`, { description: remainingHint({ calories: preview.kcal, protein: preview.protein }) });
      track("meal_added", { calories: preview.kcal, mealType: dialogMeal, source: offSelected ? "catalog" : "library" });
      closeDialog();
    } catch (err) {
      console.error("[Meals] Ошибка добавления продукта из библиотеки:", err);
      toast.error("Не удалось добавить продукт");
    } finally { endAdding(); }
  };

  const handleRecentAdd = async (r: { name: string; mealType: MealType; calories: number; protein: number; carbs: number; fat: number; quantity: number }) => {
    if (!dialogMeal) return;
    if (!beginAdding()) return;
    try {
      await addEntry({
        date: todayKey(), mealType: dialogMeal, name: r.name, quantity: r.quantity,
        calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat,
        idempotencyKey: newIdempotencyKey("meal-recent"),
      });
      toast.success(`${r.name} — добавлено`, { description: remainingHint({ calories: r.calories, protein: r.protein }) });
      track("meal_added", { calories: r.calories, mealType: dialogMeal, source: "recent" });
      closeDialog();
    } catch (err) {
      console.error("[Meals] Ошибка быстрого добавления из недавних:", err);
      toast.error("Не удалось добавить продукт");
    } finally { endAdding(); }
  };

  const handleCustomAdd = async () => {
    if (!dialogMeal || addingRef.current) return;
    if (!customName.trim()) { toast.error("Укажите название продукта"); return; }
    const cals = parseLocalNumber(customCals);
    if (cals === null || cals <= 0) { toast.error("Укажите калории числом, например 250"); return; }
    const p = parseLocalNumber(customProtein) ?? 0;
    const c = parseLocalNumber(customCarbs) ?? 0;
    const f = parseLocalNumber(customFat) ?? 0;
    if (!beginAdding()) return;
    try {
      await addEntry({
        date: todayKey(), mealType: dialogMeal, name: customName.trim(), quantity: 1,
        calories: cals, protein: p, carbs: c, fat: f,
        idempotencyKey: newIdempotencyKey("meal-custom"),
      });
      toast.success(`${customName.trim()} — добавлено`, { description: remainingHint({ calories: cals, protein: p }) });
      track("meal_added", { calories: cals, mealType: dialogMeal, source: "custom" });
      closeDialog();
    } catch (err) {
      console.error("[Meals] Ошибка добавления своего продукта:", err);
      toast.error("Не удалось добавить продукт");
    } finally { endAdding(); }
  };

  const handleSaveEdit = async () => {
    if (!editingEntry || addingRef.current) return;
    if (!customName.trim()) { toast.error("Укажите название продукта"); return; }
    const cals = parseLocalNumber(customCals);
    if (cals === null || cals <= 0) { toast.error("Укажите калории числом, например 250"); return; }
    const qty = parseLocalNumber(quantity);
    if (qty === null || qty <= 0) { toast.error("Порций: укажите число больше нуля, например 1,5."); return; }
    if (!beginAdding()) return;
    try {
      await updateEntry({
        id: editingEntry._id, mealType: dialogMeal ?? editingEntry.mealType,
        name: customName.trim(), quantity: Math.round(qty * 10) / 10,
        calories: cals, protein: parseLocalNumber(customProtein) ?? 0,
        carbs: parseLocalNumber(customCarbs) ?? 0, fat: parseLocalNumber(customFat) ?? 0,
      });
      toast.success("Запись обновлена");
      closeDialog();
    } catch (err) {
      console.error(`[Meals] Ошибка обновления записи (id=${editingEntry._id}):`, err);
      toast.error("Не удалось обновить запись");
    } finally { endAdding(); }
  };

  const handleQuickQty = async (entry: Doc<"mealLog">, dir: 1 | -1) => {
    const cur = entry.quantity ?? 1;
    const next = Math.max(0.5, Math.round((cur + dir * quickQtyStep(entry.name)) * 10) / 10);
    if (next === cur) return;
    if (!beginAdding()) return;
    const ratio = next / cur;
    try {
      await updateEntry({
        id: entry._id, mealType: entry.mealType, name: entry.name, quantity: next,
        calories: Math.round(entry.calories * ratio),
        protein: Math.round(entry.protein * ratio * 10) / 10,
        carbs: Math.round(entry.carbs * ratio * 10) / 10,
        fat: Math.round(entry.fat * ratio * 10) / 10,
      });
    } catch (err) {
      console.error(`[Meals] Ошибка быстрой правки порции (id=${entry._id}):`, err);
      toast.error("Не удалось изменить порцию");
    } finally { endAdding(); }
  };

  const handleDeleteEntry = async (id: Doc<"mealLog">["_id"], name: string) => {
    try { await deleteEntry({ id }); toast.success(`${name} — удалено`); }
    catch (err) { console.error(`[Meals] Ошибка удаления записи (id=${id}):`, err); toast.error("Не удалось удалить запись"); }
  };

  const handleDeleteFood = async (id: Doc<"foods">["_id"], name: string) => {
    try { await deleteFood({ id }); toast.success(`${name} — удалено из моих продуктов`); }
    catch (err) { console.error(`[Meals] Ошибка удаления продукта (id=${id}):`, err); toast.error("Не удалось удалить продукт"); }
  };

  const handleWater = async (delta: number) => {
    const prev = waterMl;
    try {
      await addWater({ date: todayKey(), amountMl: delta, idempotencyKey: newIdempotencyKey("water") });
      if (prev < waterTarget && prev + delta >= waterTarget) toast.success("Цель по воде достигнута! 🎉");
    } catch (err) {
      console.error(`[Meals] Ошибка обновления воды (delta=${delta}):`, err);
      toast.error("Не удалось обновить воду");
    }
  };

  // ─── Photo ───
  const handlePhotoFile = async (file: File | undefined) => {
    setPhotoError(null); setPhotoReview(null);
    if (!file) return;
    if (!premium.canUse("photo_food_analysis")) { openPaywall("photo_food_analysis"); return; }
    const err = photoFileError(file);
    if (err) { setPhotoError(err); return; }
    try { setPhotoDataUrl(await readPhotoFile(file)); }
    catch (e) { setPhotoError(e instanceof Error ? e.message : "Не удалось прочитать файл."); }
  };

  const updateReviewQuantity = (key: string, delta: number) => {
    setPhotoReview((prev) => {
      if (!prev) return prev;
      track("photo_analysis_edited", { items: prev.length });
      return prev.map((item) => item.key !== key ? item : { ...item, quantity: Math.max(1, Math.round((item.quantity + delta) * 10) / 10) });
    });
  };

  const removeReviewItem = (key: string) => {
    setPhotoReview((prev) => {
      if (!prev) return prev;
      track("photo_analysis_edited", { items: prev.length });
      return prev.filter((item) => item.key !== key);
    });
  };

  const handleAnalyzePhoto = async () => {
    if (!dialogMeal || !photoDataUrl) return;
    track("photo_analysis");
    if (!beginAdding()) return;
    setAnalyzingPhoto(true); setPhotoError(null);
    try {
      const res = await analyzePhoto({ imageDataUrl: photoDataUrl });
      const items = buildPhotoReviewItems(res.items);
      if (items.length === 0) { setPhotoError("Не удалось разобрать блюдо на фото — попробуйте ближе или добавьте вручную."); setPhotoReview(null); return; }
      setPhotoReview(items);
    } catch (err) {
      console.error("[Meals] Ошибка распознавания фото:", err);
      setPhotoError(err instanceof Error && /Слишком часто/.test(err.message)
        ? "Слишком часто — подождите немного и попробуйте ещё раз."
        : "Не удалось распознать фото — проверьте интернет и попробуйте ещё раз.");
    } finally { setAnalyzingPhoto(false); endAdding(); }
  };

  const handleConfirmPhoto = async () => {
    if (!dialogMeal || !photoReview || photoReview.length === 0) return;
    if (!beginAdding()) return;
    try {
      await addEntries({
        entries: photoReview.map((item) => ({
          date: todayKey(), mealType: dialogMeal, name: item.name, quantity: item.quantity,
          calories: item.macros.calories, protein: item.macros.protein, carbs: item.macros.carbs, fat: item.macros.fat,
          nutritionSource: item.source,
        })),
        idempotencyKey: newIdempotencyKey("photo-confirm"),
      });
      toast.success(`Распознано: ${photoReview.length} ${pluralRecords(photoReview.length)} — добавлено в дневник (оценка)`);
      track("photo_analysis_confirmed", { items: photoReview.length });
      track("meal_added", { count: photoReview.length, source: "photo" });
      closeDialog();
    } catch (err) {
      console.error("[Meals] Ошибка сохранения распознанного фото:", err);
      toast.error("Не удалось добавить распознанное — попробуйте ещё раз");
    } finally { endAdding(); }
  };

  // ─── OFF ───
  const handleOffSearch = async () => {
    const q = search.trim();
    if (q.length < 2) { toast.error("Введите минимум 2 символа для поиска в каталоге"); return; }
    setSearchingOff(true); setOffError(null); setOffSelected(null);
    try {
      const res = await searchOpenFoodFacts(q);
      setOffResults(res);
      if (res.length === 0) setOffError("В каталоге ничего не нашлось — попробуйте короче.");
    } catch { setOffResults([]); setOffError("Каталог недоступен — проверьте интернет и попробуйте ещё раз."); }
    finally { setSearchingOff(false); }
  };

  // ─── Copy day ───
  const toggleCopyEntry = (id: string) => {
    setCopyDeselected((m) => {
      const cur = m[copyFromDate] ?? new Set<string>();
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...m, [copyFromDate]: next };
    });
  };

  const copyEntriesToToday = async (entries: NonNullable<typeof todayLog>, sourceLabel: string): Promise<boolean> => {
    if (entries.length === 0) return false;
    if (!beginAdding()) return false;
    try {
      await addEntries({
        entries: entries.map((e) => ({
          date: todayKey(), mealType: e.mealType, name: e.name, quantity: e.quantity,
          calories: e.calories, protein: e.protein, carbs: e.carbs, fat: e.fat,
          foodId: e.foodId, nutritionSource: e.nutritionSource,
        })),
        idempotencyKey: newIdempotencyKey("copy-day"),
      });
      toast.success(`Скопировано записей: ${entries.length} из ${sourceLabel}`);
      track("meal_added", { count: entries.length, source: "copy_day" });
      return true;
    } catch (err) {
      console.error("[Meals] Ошибка копирования записей из прошлого дня:", err);
      toast.error("Не удалось скопировать записи");
      return false;
    } finally { endAdding(); }
  };

  const handleCopyDay = async () => {
    if (!copyFromDate || copyFromDate === todayKey()) return;
    const entries = (copyLog ?? []).filter((e) => copySelected.has(e._id));
    if (entries.length === 0) { toast.error("Выберите хотя бы одну запись"); return; }
    setCopying(true);
    try { await copyEntriesToToday(entries, shortDate(copyFromDate)); }
    finally { setCopying(false); }
  };

  const openRepeatMeal = (mealType: MealType) => {
    setRepeatMeal(mealType);
    setRepeatSelected(new Set(copyByMeal[mealType].map((e) => e._id)));
  };

  const toggleRepeatEntry = (id: string) => {
    setRepeatSelected((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const handleRepeatMeal = async () => {
    if (!repeatMeal) return;
    const entries = copyByMeal[repeatMeal].filter((e) => repeatSelected.has(e._id));
    if (entries.length === 0) { toast.error("Выберите хотя бы одну запись"); return; }
    const ok = await copyEntriesToToday(entries, `${MEAL_TYPE_LABELS[repeatMeal].toLowerCase()} (${shortDate(copyFromDate)})`);
    if (ok) setRepeatMeal(null);
  };

  // ─── Plan ───
  const handleAddAllPlan = async () => {
    if (!plan) return;
    if (!beginAdding()) return;
    try {
      await addEntries({
        entries: plan.meals.flatMap((m) => m.foods.map((f) => ({
          date: todayKey(), mealType: m.mealType, name: f.food.name,
          quantity: Math.round((f.amountGrams / f.food.servingGrams) * 10) / 10,
          calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat,
          nutritionSource: "verified",
        }))),
        idempotencyKey: newIdempotencyKey("plan-day"),
      });
      toast.success("План на день добавлен в дневник");
      track("meal_added", { count: plan.meals.length, source: "plan" });
      setShowPlan(false);
    } catch (err) {
      console.error("[Meals] Ошибка добавления плана на день в дневник:", err);
      toast.error("Не удалось добавить план");
    } finally { endAdding(); }
  };

  // ─── Custom food ───
  const handleSaveFood = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const amount = parseLocalNumber(newFood.amount) ?? 100;
    const cals = parseLocalNumber(newFood.calories);
    if (!newFood.name.trim() || cals === null || cals <= 0) { toast.error("Укажите название и калории"); return; }
    try {
      await addFood({
        name: newFood.name.trim(), amount, unit: newFood.unit.trim() || "г",
        calories: cals, protein: parseLocalNumber(newFood.protein) ?? 0,
        carbs: parseLocalNumber(newFood.carbs) ?? 0, fat: parseLocalNumber(newFood.fat) ?? 0,
      });
      toast.success("Продукт сохранён");
      setNewFood({ name: "", amount: "100", unit: "г", calories: "", protein: "", carbs: "", fat: "" });
    } catch (err) {
      console.error("[Meals] Ошибка сохранения своего продукта:", err);
      toast.error("Не удалось сохранить продукт");
    }
  };

  const loading = profile === undefined || todayLog === undefined;

  return {
    // Data
    profile, todayLog, foods, water, targets, waterTarget, waterMl,
    byMeal, totals, recentFoods, recentQuick,
    // Dialog
    dialogMeal, editingEntry, search, selectedName, quantity,
    customName, customCals, customProtein, customCarbs, customFat, adding,
    // Custom food
    newFood,
    // Copy day
    copyFromDate, copying, copyLog, copyByMeal, copySelected,
    repeatMeal, repeatSelected, yesterdayKey,
    // OFF
    offResults, searchingOff, offError, offSelected,
    // Photo
    photoDataUrl, analyzingPhoto, photoError, photoReview,
    // Plan
    showPlan, menuGoal, activeMenuGoal, menuTargets, plan, weeklyPlan,
    // Premium
    paywallOpen, paywallFeature,
    // Refs
    selectedPanelRef, addingRef,
    // Loading
    loading,
    // Actions
    setDialogMeal, setSearch, setSelectedName, setQuantity,
    setCustomName, setCustomCals, setCustomProtein, setCustomCarbs, setCustomFat,
    closeDialog, openEdit, openQuickAdd, stepQuantity, selectedPreview,
    beginAdding, endAdding,
    handleAdd, handleRecentAdd, handleCustomAdd, handleSaveEdit,
    handleQuickQty, handleDeleteEntry, handleDeleteFood, handleWater,
    handlePhotoFile, handleAnalyzePhoto, handleConfirmPhoto,
    updateReviewQuantity, removeReviewItem,
    handleOffSearch, setOffSelected,
    setCopyFromDate, toggleCopyEntry, handleCopyDay,
    openRepeatMeal, setRepeatMeal, toggleRepeatEntry, handleRepeatMeal,
    setNewFood, handleSaveFood,
    setShowPlan, setMenuGoal, handleAddAllPlan,
    openPaywall, setPaywallOpen,
    track: trackFn,
  };
}
