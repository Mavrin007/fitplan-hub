/**
 * Свои продукты и блюда: форма добавления + список сохранённых с быстрым
 * «Записать» в дневник и удалением. Вынесено из Meals.tsx.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import { UNITS } from "@/lib/i18n";
import { DECIMAL_INPUT } from "../lib/mealFormatting";
import type { CustomFood, NewFoodForm } from "../types";

interface CustomFoodsCardProps {
  foods: CustomFood[] | undefined;
  newFood: NewFoodForm;
  setNewFood: (updater: (f: NewFoodForm) => NewFoodForm) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onWriteFood: (f: CustomFood) => void;
  onDeleteFood: (id: CustomFood["_id"], name: string) => void;
}

export function CustomFoodsCard({
  foods,
  newFood,
  setNewFood,
  onSubmit,
  onWriteFood,
  onDeleteFood,
}: CustomFoodsCardProps) {
  return (
    <section className="space-y-5">
      <div>
        <p className="label-overline text-muted-foreground">Мои продукты</p>
        <h2 className="m3-title-large mt-1">Свои продукты и блюда</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Сохраняйте продукты, которые едите часто, — запись займёт секунды.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
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
          <Label htmlFor="nf-cal">{UNITS.kcal}</Label>
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
                    onClick={() => onWriteFood(f)}
                    className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Записать
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteFood(f._id, f.name)}
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
  );
}
