/**
 * Диалог добавления/редактирования записи дневника.
 * Содержит: поиск по библиотеке, OFF-каталог, фото, свои значения.
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { FOOD_LIBRARY, type MealType } from "@/lib/mealLibrary";
import { MEAL_TYPE_LABELS, UNITS } from "@/lib/i18n";
import { parseLocalNumber, cn } from "@/lib/utils";
import {
  MEAL_TYPES, DECIMAL_INPUT, kcalPerServing, portionLabel,
} from "../lib/mealUtils";
import type { MealPageState, MealPageActions } from "../hooks/useMealPage";
import {
  ArrowRight, Camera, Loader2, Minus, Plus, Search, Sparkles, Trash2,
} from "lucide-react";

type Props = Pick<MealPageState,
  | "dialogMeal" | "editingEntry" | "search" | "selectedName" | "quantity"
  | "customName" | "customCals" | "customProtein" | "customCarbs" | "customFat"
  | "adding" | "recentFoods" | "offResults" | "searchingOff" | "offError" | "offSelected"
  | "photoDataUrl" | "analyzingPhoto" | "photoError" | "photoReview"
  | "selectedPanelRef"
> & Pick<MealPageActions,
  | "setDialogMeal" | "setSearch" | "setSelectedName" | "setQuantity"
  | "setCustomName" | "setCustomCals" | "setCustomProtein" | "setCustomCarbs" | "setCustomFat"
  | "closeDialog" | "handleAdd" | "handleRecentAdd" | "handleCustomAdd" | "handleSaveEdit"
  | "handlePhotoFile" | "handleAnalyzePhoto" | "handleConfirmPhoto"
  | "updateReviewQuantity" | "removeReviewItem" | "handleOffSearch" | "setOffSelected"
  | "stepQuantity" | "selectedPreview" | "beginAdding" | "endAdding"
> & {
  track: (name: string, meta?: Record<string, unknown>) => void;
};

export function AddEditMealDialog(props: Props) {
  const {
    dialogMeal, editingEntry, search, selectedName, quantity,
    customName, customCals, customProtein, customCarbs, customFat, adding,
    recentFoods, offResults, searchingOff, offError, offSelected,
    photoDataUrl, analyzingPhoto, photoError, photoReview,
    selectedPanelRef,
    setDialogMeal, setSearch, setSelectedName, setQuantity,
    setCustomName, setCustomCals, setCustomProtein, setCustomCarbs, setCustomFat,
    closeDialog, handleAdd, handleRecentAdd, handleCustomAdd, handleSaveEdit,
    handlePhotoFile, handleAnalyzePhoto, handleConfirmPhoto,
    updateReviewQuantity, removeReviewItem, handleOffSearch, setOffSelected,
    stepQuantity, selectedPreview, track,
  } = props;

  return (
    <Dialog open={dialogMeal !== null} onOpenChange={(o) => !o && closeDialog()}>
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
          {/* Meal type selector */}
          <div>
            <Label>Приём пищи</Label>
            <Select value={dialogMeal ?? "breakfast"} onValueChange={(v) => setDialogMeal(v as MealType)}>
              <SelectTrigger className="mt-1.5 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEAL_TYPES.map((mt) => (
                  <SelectItem key={mt} value={mt}>{MEAL_TYPE_LABELS[mt]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Recent foods */}
          {!editingEntry && recentFoods.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Недавнее</Label>
              <div className="flex flex-wrap gap-1.5">
                {recentFoods.map((r) => (
                  <button key={r.name} type="button" disabled={adding}
                    onClick={() => void handleRecentAdd(r)}
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
                  >
                    <span className="max-w-40 truncate">{r.name}</span>
                    <span className="shrink-0 text-muted-foreground num">+{r.calories} ккал</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Library search + OFF + Photo (only when adding, not editing) */}
          {!editingEntry && (
            <>
              {/* Library search */}
              <div className="space-y-2">
                <Label htmlFor="food-search">Поиск по библиотеке</Label>
                <Input id="food-search" placeholder="курица, рис, овсянка…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setSelectedName(""); setOffSelected(null); }}
                />
                <div className="max-h-56 overflow-y-auto rounded-md border">
                  {FOOD_LIBRARY.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
                    .slice(0, 30).map((f) => {
                      const active = selectedName === f.name;
                      return (
                        <button key={f.name} type="button"
                          onClick={() => { setSelectedName(f.name); setOffSelected(null); }}
                          className={cn("flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors",
                            active ? "bg-secondary font-medium" : "hover:bg-secondary/60")}
                        >
                          <span>{f.name}</span>
                          <span className="text-xs text-muted-foreground num">
                            {kcalPerServing(f.calories, f.servingGrams)} ккал / {f.servingGrams}{f.unit === "г" ? " г" : ` ${f.unit}`}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Selected food panel */}
              {selectedName && (
                <div ref={selectedPanelRef} className="space-y-2.5 rounded-lg border border-brand/30 bg-brand/5 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold">{selectedName}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {offSelected ? "из каталога" : (() => {
                        const qtyFood = FOOD_LIBRARY.find((f) => f.name === selectedName);
                        return qtyFood ? `≈ ${kcalPerServing(qtyFood.calories, qtyFood.servingGrams)} ккал / порция` : "";
                      })()}
                    </span>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Label htmlFor="qty">
                        {offSelected ? "Грамм (100 г — порция)" : portionLabel(FOOD_LIBRARY.find((f) => f.name === selectedName), parseLocalNumber(quantity) ?? 0)}
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => stepQuantity(-1)} disabled={adding}
                          className="flex size-10 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
                          aria-label="Уменьшить порцию"><Minus className="size-4" /></button>
                        <Input id="qty" type="text" inputMode="decimal" placeholder="1"
                          className="h-10 flex-1 text-center" value={quantity}
                          onChange={(e) => setQuantity(DECIMAL_INPUT(e.target.value))} />
                        <button type="button" onClick={() => stepQuantity(1)} disabled={adding}
                          className="flex size-10 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
                          aria-label="Увеличить порцию"><Plus className="size-4" /></button>
                      </div>
                    </div>
                    <div className="shrink-0 pb-1 text-right">
                      {(() => {
                        const prev = selectedPreview();
                        if (!prev) return null;
                        return (<>
                          <p className="num text-sm font-semibold">≈ {prev.kcal} ккал</p>
                          <p className="num mt-0.5 text-[10px] text-muted-foreground">Б {prev.protein} · У {prev.carbs} · Ж {prev.fat}</p>
                        </>);
                      })()}
                    </div>
                  </div>
                  <Button className="w-full" onClick={handleAdd} disabled={adding || !quantity}>
                    {adding ? "Добавляем…" : `Добавить в ${dialogMeal ? MEAL_TYPE_LABELS[dialogMeal].toLowerCase() : "дневник"}`}
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              )}

              {/* OFF catalog */}
              <div className="space-y-2">
                <Button type="button" variant="outline" size="sm" className="w-full"
                  disabled={searchingOff || search.trim().length < 2}
                  onClick={() => void handleOffSearch()}>
                  {searchingOff ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                  {searchingOff ? "Ищем в каталоге…" : "Искать в каталоге Open Food Facts"}
                </Button>
                {offError && <p className="text-[11px] text-destructive">{offError}</p>}
                {offResults && offResults.length > 0 && (
                  <div className="max-h-44 overflow-y-auto rounded-md border">
                    {offResults.map((p) => {
                      const active = offSelected?.name === p.name;
                      return (
                        <button key={p.barcode ?? p.name} type="button"
                          onClick={() => { setOffSelected(p); setSelectedName(p.name); }}
                          className={cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                            active ? "bg-secondary font-medium" : "hover:bg-secondary/60")}
                        >
                          <span className="min-w-0">
                            <span className="block truncate">{p.name}</span>
                            {p.brands && <span className="block truncate text-[10px] text-muted-foreground">{p.brands}</span>}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground num">{p.calories} ккал / 100 г</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Photo section */}
              <div className="space-y-2 rounded-lg border border-dashed p-3">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Или фото тарелки</p>
                {photoReview && photoReview.length > 0 ? (
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      <Sparkles className="size-3.5" />
                      Распознано ИИ — проверьте и подтвердите. КБЖУ считаются оценкой, а не точным измерением.
                    </p>
                    <ul className="space-y-1.5">
                      {photoReview.map((item) => (
                        <li key={item.key} className="flex items-center justify-between gap-2 rounded-md border bg-surface-container-low px-2.5 py-2">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate text-xs font-medium">
                              <span className="truncate">{item.name}</span>
                              <Badge variant="outline" className="shrink-0 rounded-sm px-1 py-0 text-[9px] uppercase tracking-wide text-amber-700 dark:text-amber-400">оценка</Badge>
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground num">
                              {item.macros.calories} ккал · Б {item.macros.protein} · У {item.macros.carbs} · Ж {item.macros.fat}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button type="button" onClick={() => updateReviewQuantity(item.key, -1)} disabled={item.quantity <= 1}
                              className="flex size-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
                              aria-label={`Уменьшить количество ${item.name}`}><Minus className="size-3" /></button>
                            <span className="min-w-6 text-center text-xs font-medium num">×{item.quantity}</span>
                            <button type="button" onClick={() => updateReviewQuantity(item.key, 1)}
                              className="flex size-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted"
                              aria-label={`Увеличить количество ${item.name}`}><Plus className="size-3" /></button>
                            <button type="button" onClick={() => removeReviewItem(item.key)}
                              className="ml-1 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive"
                              aria-label={`Удалить ${item.name}`}><Trash2 className="size-3.5" /></button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center gap-2">
                      <Button className="flex-1" disabled={adding} onClick={() => void handleConfirmPhoto()}>
                        {adding ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                        Подтвердить и добавить ({photoReview.length})
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { track("photo_analysis_rejected", { items: photoReview.length }); removeReviewItem("__clear__"); }}
                        aria-label="Отменить распознанное"><Trash2 className="size-4" /></Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {photoDataUrl ? (
                      <div className="flex items-center gap-3">
                        <img src={photoDataUrl} alt="Фото тарелки" className="size-16 shrink-0 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <Button className="w-full" disabled={analyzingPhoto} onClick={() => void handleAnalyzePhoto()}>
                            {analyzingPhoto ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                            {analyzingPhoto ? "Распознаём…" : "Распознать"}
                          </Button>
                          <label className="block cursor-pointer text-center text-[11px] text-muted-foreground underline-offset-4 hover:underline">
                            Другое фото
                            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                              onChange={(e) => void handlePhotoFile(e.target.files?.[0])} />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-brand">
                        <Camera className="size-4" /> Выбрать фото тарелки
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                          onChange={(e) => void handlePhotoFile(e.target.files?.[0])} />
                      </label>
                    )}
                  </>
                )}
                {photoError && <p className="text-[11px] text-destructive">{photoError}</p>}
                <p className="text-[10px] leading-relaxed text-muted-foreground/80">
                  Фото используется только для распознавания блюда и расчёта КБЖУ — оно не сохраняется.
                </p>
              </div>

              <div className="flex items-center gap-3 py-1">
                <Separator className="flex-1" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Или своё</span>
                <Separator className="flex-1" />
              </div>
            </>
          )}

          {/* Custom values */}
          <div className="space-y-3">
            {editingEntry && (
              <div className="space-y-2">
                <Label htmlFor="edit-qty">Порций</Label>
                <Input id="edit-qty" type="text" inputMode="decimal" placeholder="1"
                  value={quantity} onChange={(e) => setQuantity(DECIMAL_INPUT(e.target.value))} />
              </div>
            )}
            <Input placeholder="Название продукта" value={customName} onChange={(e) => setCustomName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="text" inputMode="decimal" placeholder={UNITS.kcal} value={customCals} onChange={(e) => setCustomCals(DECIMAL_INPUT(e.target.value))} />
              <Input type="text" inputMode="decimal" placeholder="Белки, г" value={customProtein} onChange={(e) => setCustomProtein(DECIMAL_INPUT(e.target.value))} />
              <Input type="text" inputMode="decimal" placeholder="Углеводы, г" value={customCarbs} onChange={(e) => setCustomCarbs(DECIMAL_INPUT(e.target.value))} />
              <Input type="text" inputMode="decimal" placeholder="Жиры, г" value={customFat} onChange={(e) => setCustomFat(DECIMAL_INPUT(e.target.value))} />
            </div>
            {editingEntry ? (
              <Button className="w-full" disabled={adding || !customName.trim() || !customCals} onClick={handleSaveEdit}>
                {adding ? "Сохранение…" : "Сохранить изменения"}
              </Button>
            ) : (
              <Button className="w-full" variant="outline" disabled={adding || !customName.trim() || !customCals} onClick={handleCustomAdd}>
                {adding ? "Добавляем…" : "Добавить своё"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
