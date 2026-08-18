/**
 * Карточки приёмов пищи на день (завтрак/обед/ужин/перекус): M3-карточки
 * с placeholder-иллюстрацией, записями (MealEntry) и кнопкой добавления.
 * Вынесено из Meals.tsx.
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Sparkles } from "lucide-react";
import type { MealType } from "@/lib/mealLibrary";
import { MEAL_ART } from "../mealArt";
import { MEAL_TYPES, type MealEntry as MealEntryType } from "../types";
import { MealEntry } from "./MealEntry";

interface MealListProps {
  byMeal: Record<MealType, MealEntryType[]>;
  adding: boolean;
  onAdd: (mealType: MealType) => void;
  onQuickQty: (entry: MealEntryType, dir: 1 | -1) => void;
  onEdit: (entry: MealEntryType) => void;
  onDelete: (id: MealEntryType["_id"], name: string) => void;
}

export function MealList({ byMeal, adding, onAdd, onQuickQty, onEdit, onDelete }: MealListProps) {
  return (
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
                    <MealEntry
                      key={e._id}
                      entry={e}
                      adding={adding}
                      onQuickQty={onQuickQty}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ))}
                </ul>
              )}

              <Button
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                onClick={() => onAdd(mt)}
              >
                <Plus className="size-3.5" />
                Добавить в {art.label.toLowerCase()}
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
