/**
 * Структурные типы данных для модулей ассистента.
 *
 * Ассистент работает с «формами» документов, а не с типами _generated:
 * так модули (commands/nutrition/prompt) тестируются без Convex-рантайма,
 * а в прод-хендлере типы совместимы структурно с Doc<...>.
 */

export interface ProfileFieldsLike {
  age: number;
  gender: "male" | "female";
  heightCm: number;
  weightKg: number;
  targetWeightKg?: number | null;
  activityLevel: string;
  fitnessGoal:
    | "lose_weight"
    | "maintain"
    | "gain_muscle"
    | "improve_endurance"
    | "strength";
  experienceLevel: string;
}

export interface WorkoutPlanDayLike {
  day: number;
  focus: string;
  exercises: Array<{ name: string; sets: number; reps: string | number }>;
}

export interface WorkoutPlanDocLike {
  name: string;
  days: WorkoutPlanDayLike[];
  weeks?: unknown[];
}

export interface MealLogEntryLike {
  date: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  foodId?: string;
}

export interface TodayTotalsLike {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type {
  ProfileFieldsLike as ProfileFields,
  WorkoutPlanDocLike as WorkoutPlanDoc,
  MealLogEntryLike as MealLogEntry,
};
