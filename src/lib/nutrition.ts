/** Nutrition math — Mifflin–St Jeor BMR, activity multipliers, goal
 *  adjustments and macro targets. Pure functions, used by the profile page,
 *  dashboard and meal generator. */

export type Gender = "male" | "female";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type FitnessGoal =
  | "lose_weight"
  | "maintain"
  | "gain_muscle"
  | "improve_endurance";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

/** Ограничения/травмы, которые влияют на подбор упражнений в плане тренировок. */
export type Limitation = "lower_back" | "knees" | "shoulders";

export interface ProfileInput {
  age: number;
  gender: Gender;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  fitnessGoal: FitnessGoal;
}

export interface Targets {
  bmr: number;
  tdee: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Goal adjustments applied to TDEE (negative = deficit, positive = surplus). */
export const GOAL_ADJUSTMENTS: Record<FitnessGoal, number> = {
  lose_weight: -0.15,
  maintain: 0,
  gain_muscle: 0.1,
  improve_endurance: 0,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Сидячий",
  light: "Низкая активность",
  moderate: "Умеренная активность",
  active: "Высокая активность",
  very_active: "Очень высокая активность",
};

export const GOAL_LABELS: Record<FitnessGoal, string> = {
  lose_weight: "Похудение",
  maintain: "Поддержание веса",
  gain_muscle: "Набор мышечной массы",
  improve_endurance: "Выносливость",
};

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Мужской",
  female: "Женский",
};

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: "Новичок",
  intermediate: "Средний уровень",
  advanced: "Продвинутый",
};

export const LIMITATION_KEYS: Limitation[] = [
  "lower_back",
  "knees",
  "shoulders",
];

export const LIMITATION_LABELS: Record<Limitation, string> = {
  lower_back: "Поясница",
  knees: "Колени",
  shoulders: "Плечи",
};

export const LIMITATION_DESCRIPTIONS: Record<Limitation, string> = {
  lower_back: "Боли в пояснице — щадящие варианты тяг и приседаний",
  knees: "Проблемы с коленями — без глубоких приседаний и прыжков",
  shoulders: "Плечи — без жимов над головой, укрепление ротаторов",
};

/** Mifflin–St Jeor basal metabolic rate. */
export function computeBmr(p: ProfileInput): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.gender === "male" ? base + 5 : base - 161;
}

/** Total daily energy expenditure. */
export function computeTdee(p: ProfileInput): number {
  return computeBmr(p) * ACTIVITY_MULTIPLIERS[p.activityLevel];
}

/** Full target breakdown. Protein at ~1.6–2.0 g/kg, fat at 25% of calories,
 *  remaining calories to carbs. */
export function computeTargets(p: ProfileInput): Targets {
  const bmr = Math.round(computeBmr(p));
  const tdee = Math.round(computeTdee(p));
  const calories = Math.round(tdee * (1 + GOAL_ADJUSTMENTS[p.fitnessGoal]));

  const proteinPerKg =
    p.fitnessGoal === "gain_muscle"
      ? 2
      : p.fitnessGoal === "lose_weight"
        ? 1.9
        : p.fitnessGoal === "improve_endurance"
          ? 1.6
          : 1.6;
  const protein = Math.round(p.weightKg * proteinPerKg);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return { bmr, tdee, calories, protein, fat, carbs };
}
