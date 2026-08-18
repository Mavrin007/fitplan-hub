/**
 * Одна запись дневника в карточке приёма: быстрая правка порции (−/+),
 * калории, редактирование и удаление. Вынесена из Meals.tsx.
 */

import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import type { MealEntry as MealEntryType } from "../types";

interface MealEntryProps {
  entry: MealEntryType;
  adding: boolean;
  onQuickQty: (entry: MealEntryType, dir: 1 | -1) => void;
  onEdit: (entry: MealEntryType) => void;
  onDelete: (id: MealEntryType["_id"], name: string) => void;
}

export function MealEntry({ entry, adding, onQuickQty, onEdit, onDelete }: MealEntryProps) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{entry.name}</p>
        {(entry.calories > 0 || entry.protein > 0) && (
          <p className="mt-0.5 text-xs text-muted-foreground num">
            Б {entry.protein} · У {entry.carbs} · Ж {entry.fat}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {/* Быстрая правка порции: −/+ без диалога, КБЖУ пересчитываются
            пропорционально. */}
        <div className="mr-1 flex items-center rounded-md border">
          <button
            type="button"
            disabled={adding || (entry.quantity ?? 1) <= 0.5}
            onClick={() => onQuickQty(entry, -1)}
            className="flex size-9 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            aria-label={`Уменьшить порцию ${entry.name}`}
          >
            <Minus className="size-3.5" />
          </button>
          <span className="min-w-7 text-center text-xs font-medium num">
            ×{entry.quantity ?? 1}
          </span>
          <button
            type="button"
            disabled={adding}
            onClick={() => onQuickQty(entry, 1)}
            className="flex size-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            aria-label={`Увеличить порцию ${entry.name}`}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <span className="mr-1 text-xs font-medium num">{entry.calories} ккал</span>
        <button
          type="button"
          onClick={() => onEdit(entry)}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Редактировать запись"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(entry._id, entry.name)}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          aria-label={`Удалить ${entry.name}`}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
