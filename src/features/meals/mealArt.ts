/**
 * Placeholder-иллюстрация приёма (M3: градиент + иконка в стиле «еды»).
 * Общая для карточек приёмов, недельного меню и плана на день.
 */

import type { MealType } from "@/lib/mealLibrary";
import { Apple, Coffee, Moon, UtensilsCrossed, type LucideIcon } from "lucide-react";

export const MEAL_ART: Record<MealType, { icon: LucideIcon; label: string }> = {
  breakfast: { icon: Coffee, label: "Завтрак" },
  lunch: { icon: UtensilsCrossed, label: "Обед" },
  dinner: { icon: Moon, label: "Ужин" },
  snack: { icon: Apple, label: "Перекус" },
};
