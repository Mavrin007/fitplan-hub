/**
 * Поиск продуктов в диалоге добавления: локальная библиотека (с панелью
 * выбранного продукта и порцией) + внешний каталог Open Food Facts.
 * Вынесено из Meals.tsx.
 */

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2, Minus, Plus, Search } from "lucide-react";
import { FOOD_LIBRARY, formatAmount } from "@/lib/mealLibrary";
import { MEAL_TYPE_LABELS } from "@/lib/i18n";
import { cn, parseLocalNumber } from "@/lib/utils";
import { DECIMAL_INPUT } from "../lib/mealFormatting";
import { kcalPerServing } from "../lib/portionScaling";
import type { MealDiary } from "../hooks/useMealDiary";

/** Панель выбранного продукта: порция + макросы + «Добавить» — сразу под
 *  результатами, не нужно скроллить весь диалог. */
function SelectedFoodPanel({ diary }: { diary: MealDiary }) {
  const qtyFood = FOOD_LIBRARY.find((f) => f.name === diary.selectedName);
  const qtyNum = parseLocalNumber(diary.quantity) ?? 0;
  return (
    <div className="space-y-2.5 rounded-lg border border-brand/30 bg-brand/5 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold">{diary.selectedName}</p>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {diary.offSelected
            ? "из каталога"
            : qtyFood
              ? `≈ ${kcalPerServing(qtyFood.calories, qtyFood.servingGrams)} ккал / порция`
              : ""}
        </span>
      </div>

      <div className="flex items-end gap-2">
        {/* Порции понятными единицами: «Порций (≈ 300 г)» или «Порций (≈ 2 шт)» —
            видно, сколько именно еды добавится. */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="qty">
            {diary.offSelected ? (
              "Грамм (100 г — порция)"
            ) : qtyFood && qtyNum > 0 ? (
              `Порций (≈ ${formatAmount(qtyFood, qtyNum * qtyFood.servingGrams)})`
            ) : (
              "Порций"
            )}
          </Label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => diary.stepQuantity(-1)}
              disabled={diary.adding}
              className="flex size-10 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
              aria-label="Уменьшить порцию"
            >
              <Minus className="size-4" />
            </button>
            <Input
              id="qty"
              type="text"
              inputMode="decimal"
              placeholder="1"
              className="h-10 flex-1 text-center"
              value={diary.quantity}
              onChange={(e) => diary.setQuantity(DECIMAL_INPUT(e.target.value))}
            />
            <button
              type="button"
              onClick={() => diary.stepQuantity(1)}
              disabled={diary.adding}
              className="flex size-10 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
              aria-label="Увеличить порцию"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        {/* Что добавится при этой порции — сразу видно влияние на цель */}
        <div className="shrink-0 pb-1 text-right">
          {(() => {
            const prev = diary.selectedPreview();
            if (!prev) return null;
            return (
              <>
                <p className="num text-sm font-semibold">≈ {prev.kcal} ккал</p>
                <p className="num mt-0.5 text-[10px] text-muted-foreground">
                  Б {prev.protein} · У {prev.carbs} · Ж {prev.fat}
                </p>
              </>
            );
          })()}
        </div>
      </div>

      <Button
        className="w-full"
        onClick={() => void diary.handleAdd()}
        disabled={diary.adding || !diary.quantity}
      >
        {diary.adding
          ? "Добавляем…"
          : `Добавить в ${
              diary.dialogMeal
                ? MEAL_TYPE_LABELS[diary.dialogMeal].toLowerCase()
                : "дневник"
            }`}
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

export function FoodSearch({ diary }: { diary: MealDiary }) {
  // Панель выбранного продукта — при выборе из внешнего каталога она
  // находится над результатами: мягко подводим к ней скроллом.
  const selectedPanelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (diary.offSelected) {
      selectedPanelRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [diary.offSelected]);

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="food-search">Поиск по библиотеке</Label>
        <Input
          id="food-search"
          placeholder="курица, рис, овсянка…"
          value={diary.search}
          onChange={(e) => {
            diary.setSearch(e.target.value);
            // Новый запрос инвалидирует внешние результаты И выбор: иначе
            // выбранный OFF-продукт остаётся «подвешенным» (selectedName
            // указывает на имя, которого нет в библиотеке, а offSelected
            // уже сброшен).
            diary.setSelectedName("");
            diary.setOffResults(null);
            diary.setOffSelected(null);
            diary.setOffError(null);
          }}
        />
        <div className="max-h-56 overflow-y-auto rounded-md border">
          {FOOD_LIBRARY.filter((f) =>
            f.name.toLowerCase().includes(diary.search.toLowerCase()),
          )
            .slice(0, 30)
            .map((f) => {
              const active = diary.selectedName === f.name;
              return (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => {
                    diary.setSelectedName(f.name);
                    diary.setOffSelected(null);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors",
                    active ? "bg-secondary font-medium" : "hover:bg-secondary/60",
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

      {diary.selectedName && (
        <div ref={selectedPanelRef}>
          <SelectedFoodPanel diary={diary} />
        </div>
      )}

      {/* Внешний каталог Open Food Facts: миллионы продуктов с реальными
          КБЖУ по штрихкодам. Явная кнопка, а не debounce: внешний API не
          должен дёргаться на каждую клавишу. */}
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={diary.searchingOff || diary.search.trim().length < 2}
          onClick={() => void diary.handleOffSearch()}
        >
          {diary.searchingOff ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Search className="size-3.5" />
          )}
          {diary.searchingOff
            ? "Ищем в каталоге…"
            : "Искать в каталоге Open Food Facts"}
        </Button>

        {diary.offError && (
          <p className="text-[11px] text-destructive">{diary.offError}</p>
        )}

        {diary.offResults && diary.offResults.length > 0 && (
          <div className="max-h-44 overflow-y-auto rounded-md border">
            {diary.offResults.map((p) => {
              const active = diary.offSelected?.name === p.name;
              return (
                <button
                  key={p.barcode ?? p.name}
                  type="button"
                  onClick={() => {
                    diary.setOffSelected(p);
                    diary.setSelectedName(p.name);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                    active ? "bg-secondary font-medium" : "hover:bg-secondary/60",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{p.name}</span>
                    {p.brands && (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {p.brands}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground num">
                    {p.calories} ккал / 100 г
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
