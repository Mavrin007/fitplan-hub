/**
 * Диалог добавления/редактирования записи дневника: приём пищи, недавние,
 * поиск по библиотеке + каталог OFF, фото тарелки, свои значения.
 * Вынесен из Meals.tsx (логика — в useMealDiary, сюда приходит целиком).
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { MEAL_TYPE_LABELS } from "@/lib/i18n";
import { UNITS } from "@/lib/i18n";
import { DECIMAL_INPUT } from "../lib/mealFormatting";
import { MEAL_TYPES } from "../types";
import type { MealDiary } from "../hooks/useMealDiary";
import { FoodSearch } from "./FoodSearch";
import { PhotoMealDialog } from "./PhotoMealDialog";

export function AddMealDialog({ diary }: { diary: MealDiary }) {
  const { dialogMeal, editingEntry, adding } = diary;

  return (
    <Dialog open={dialogMeal !== null} onOpenChange={(o) => !o && diary.closeDialog()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingEntry
              ? "Изменить запись"
              : `Добавить в ${
                  dialogMeal ? MEAL_TYPE_LABELS[dialogMeal].toLowerCase() : ""
                }`}
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
              onValueChange={(v) => diary.setDialogMeal(v as MealDiary["dialogMeal"])}
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

          {/* Быстрый повтор: недавние продукты в один тап */}
          {!editingEntry && diary.recentFoods.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Недавнее</Label>
              <div className="flex flex-wrap gap-1.5">
                {diary.recentFoods.map((r) => (
                  <button
                    key={r.name}
                    type="button"
                    disabled={adding}
                    onClick={() => void diary.handleRecentAdd(r)}
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
                  >
                    <span className="max-w-40 truncate">{r.name}</span>
                    <span className="shrink-0 text-muted-foreground num">
                      +{r.calories} ккал
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Библиотека + каталог — только при добавлении */}
          {!editingEntry && <FoodSearch diary={diary} />}

          {/* Фото тарелки: Gemini Vision распознаёт блюдо и добавляет КБЖУ. */}
          {!editingEntry && (
            <PhotoMealDialog
              photoDataUrl={diary.photoDataUrl}
              analyzingPhoto={diary.analyzingPhoto}
              photoError={diary.photoError}
              onFileChange={diary.handlePhotoFile}
              onAnalyze={() => void diary.handleAnalyzePhoto()}
            />
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
                  value={diary.quantity}
                  onChange={(e) => diary.setQuantity(DECIMAL_INPUT(e.target.value))}
                />
              </div>
            )}
            <Input
              placeholder="Название продукта"
              value={diary.customName}
              onChange={(e) => diary.setCustomName(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="text"
                inputMode="decimal"
                placeholder={UNITS.kcal}
                value={diary.customCals}
                onChange={(e) => diary.setCustomCals(DECIMAL_INPUT(e.target.value))}
              />
              <Input
                type="text"
                inputMode="decimal"
                placeholder="Белки, г"
                value={diary.customProtein}
                onChange={(e) => diary.setCustomProtein(DECIMAL_INPUT(e.target.value))}
              />
              <Input
                type="text"
                inputMode="decimal"
                placeholder="Углеводы, г"
                value={diary.customCarbs}
                onChange={(e) => diary.setCustomCarbs(DECIMAL_INPUT(e.target.value))}
              />
              <Input
                type="text"
                inputMode="decimal"
                placeholder="Жиры, г"
                value={diary.customFat}
                onChange={(e) => diary.setCustomFat(DECIMAL_INPUT(e.target.value))}
              />
            </div>
            {editingEntry ? (
              <Button
                className="w-full"
                disabled={adding || !diary.customName.trim() || !diary.customCals}
                onClick={() => void diary.handleSaveEdit()}
              >
                {adding ? "Сохранение…" : "Сохранить изменения"}
              </Button>
            ) : (
              <Button
                className="w-full"
                variant="outline"
                disabled={adding || !diary.customName.trim() || !diary.customCals}
                onClick={() => void diary.handleCustomAdd()}
              >
                {adding ? "Добавляем…" : "Добавить своё"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
