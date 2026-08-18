/**
 * Перенос записей из прошлого дня: выбор дня, копирование выбранного,
 * быстрый повтор одного приёма (с диалогом отметок). Вынесено из Meals.tsx.
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
import { Copy, Loader2 } from "lucide-react";
import type { MealType } from "@/lib/mealLibrary";
import { MEAL_TYPE_LABELS } from "@/lib/i18n";
import { pluralRecords, shortDate, todayKey } from "@/lib/dates";
import { MEAL_TYPES, type MealEntry } from "../types";

interface CopyDayCardProps {
  copyFromDate: string;
  yesterdayKey: string;
  copyLog: MealEntry[] | undefined;
  copySelected: Set<string>;
  copyByMeal: Record<MealType, MealEntry[]>;
  adding: boolean;
  copying: boolean;
  repeatMeal: MealType | null;
  repeatSelected: Set<string>;
  onDateChange: (date: string) => void;
  onCopyDay: () => void;
  onToggleCopyEntry: (id: string) => void;
  onOpenRepeatMeal: (mealType: MealType) => void;
  onCloseRepeatMeal: () => void;
  onToggleRepeatEntry: (id: string) => void;
  onRepeatMeal: () => void;
}

export function CopyDayCard({
  copyFromDate,
  yesterdayKey,
  copyLog,
  copySelected,
  copyByMeal,
  adding,
  copying,
  repeatMeal,
  repeatSelected,
  onDateChange,
  onCopyDay,
  onToggleCopyEntry,
  onOpenRepeatMeal,
  onCloseRepeatMeal,
  onToggleRepeatEntry,
  onRepeatMeal,
}: CopyDayCardProps) {
  return (
    <>
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
                onChange={(e) => onDateChange(e.target.value)}
                className="h-10 w-44"
              />
            </div>
            <Button
              variant="secondary"
              className="h-10"
              onClick={onCopyDay}
              disabled={copying || copySelected.size === 0}
            >
              {copying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Copy className="size-4" />
              )}
              Скопировать выбранные ({copySelected.size})
            </Button>
          </div>
        </div>

        {/* Быстрый повтор одного приёма: «Обед вчера → Повторить». Открывает
            диалог с записями приёма — лишние позиции можно снять перед
            добавлением (не слепое копирование). */}
        {(copyLog ?? []).length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-medium text-muted-foreground">
              Повторить приём:
            </span>
            {MEAL_TYPES.filter((mt) => copyByMeal[mt].length > 0).map((mt) => (
              <button
                key={mt}
                type="button"
                onClick={() => onOpenRepeatMeal(mt)}
                aria-label={`Повторить приём «${MEAL_TYPE_LABELS[mt]}» (${copyByMeal[mt].length} записей)`}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-brand hover:text-brand"
              >
                <span className="max-w-32 truncate">{MEAL_TYPE_LABELS[mt]}</span>
                <span className="shrink-0 rounded-full bg-secondary px-1.5 text-[10px] font-medium text-secondary-foreground num">
                  {copyByMeal[mt].length}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Записи дня с чекбоксами: снять лишнее до копирования. */}
        {(copyLog ?? []).length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {(copyLog ?? []).map((e) => (
              <li
                key={e._id}
                className="flex items-center gap-2.5 rounded-md border bg-surface-container-low px-3 py-2"
              >
                <input
                  type="checkbox"
                  id={`copy-${e._id}`}
                  checked={copySelected.has(e._id)}
                  onChange={() => onToggleCopyEntry(e._id)}
                  className="size-4 shrink-0"
                />
                <label
                  htmlFor={`copy-${e._id}`}
                  className="min-w-0 flex-1 cursor-pointer text-sm"
                >
                  <span className="block truncate font-medium">{e.name}</span>
                  <span className="block text-[10px] text-muted-foreground num">
                    {MEAL_TYPE_LABELS[e.mealType]} · {e.calories} ккал
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-[11px] text-muted-foreground">
          {copyFromDate === todayKey() || !copyFromDate
            ? "Выберите прошедший день."
            : (copyLog ?? []).length === 0
              ? `Записей за ${shortDate(copyFromDate)} нет — выберите другой день.`
              : `Готово к копированию: ${copyLog!.length} ${pluralRecords(copyLog!.length)} за ${shortDate(copyFromDate)}.`}
        </p>
      </section>

      {/* Повтор одного приёма из прошлого дня: отметили → добавили. Записи
          приёма отмечены по умолчанию, лишние можно снять — не слепое
          копирование. */}
      <Dialog
        open={repeatMeal !== null}
        onOpenChange={(o) => !o && onCloseRepeatMeal()}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Повторить{" "}
              {repeatMeal ? MEAL_TYPE_LABELS[repeatMeal].toLowerCase() : ""} из{" "}
              {shortDate(copyFromDate)}
            </DialogTitle>
            <DialogDescription>
              Снимите лишнее — добавится только отмеченное.
            </DialogDescription>
          </DialogHeader>

          {(repeatMeal ? copyByMeal[repeatMeal] : []).length > 0 && (
            <ul className="space-y-1.5">
              {(repeatMeal ? copyByMeal[repeatMeal] : []).map((e) => (
                <li
                  key={e._id}
                  className="flex items-center gap-2.5 rounded-md border bg-surface-container-low px-3 py-2"
                >
                  <input
                    type="checkbox"
                    id={`repeat-${e._id}`}
                    checked={repeatSelected.has(e._id)}
                    onChange={() => onToggleRepeatEntry(e._id)}
                    className="size-4 shrink-0"
                  />
                  <label
                    htmlFor={`repeat-${e._id}`}
                    className="min-w-0 flex-1 cursor-pointer text-sm"
                  >
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="block text-[10px] text-muted-foreground num">
                      {e.calories} ккал · Б {e.protein}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <Button
            className="w-full"
            onClick={() => void onRepeatMeal()}
            disabled={adding || repeatSelected.size === 0}
          >
            {adding ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Copy className="size-4" />
            )}
            Добавить в сегодня ({repeatSelected.size})
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
