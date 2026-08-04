import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { render } from "@testing-library/react";
import { toast } from "@/test/sonner-mock";
import { resetConvexMock } from "@/test/convex-react-mock";

/** Профиль: рост 180, вес 80, цель — похудение. Цель по калориям ~2345 ккал. */
export const profile = {
  userId: "u1",
  age: 30,
  gender: "male",
  heightCm: 180,
  weightKg: 80,
  targetWeightKg: 75,
  activityLevel: "moderate",
  fitnessGoal: "lose_weight",
  experienceLevel: "intermediate",
  updatedAt: 0,
};

export type MealEntry = {
  _id: string;
  date: string;
  mealType: string;
  name: string;
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type WeightEntry = { _id: string; date: string; weightKg: number };

/** Рендер страницы внутри MemoryRouter (страницы используют Link/useNavigate). */
export function renderWithRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

/** Сброс состояния между тестами: convex-мок и тосты. */
export function resetMocks(): void {
  resetConvexMock();
  toast.success.mockClear();
  toast.error.mockClear();
}
