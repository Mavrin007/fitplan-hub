import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Мок convex-слоя: стабильные ссылки на функции вместо anyApi-Proxy.
vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));

import { api, convexMock, setMutation, setQuery } from "@/test/convex-react-mock";
import { toast } from "@/test/sonner-mock";
import {
  profile,
  renderWithRouter,
  resetMocks,
  type MealEntry,
  type WeightEntry,
} from "@/test/test-utils";
import { addDays, lastNDays, toDateKey, todayKey } from "@/lib/dates";
import Overview from "./Overview";

/** Цель по воде: max(1500, round(80·33/250)·250) = 2750 мл. */
const WATER_GOAL = 2750;

/** Тот же диапазон, что строит Overview для календаря активности. */
function activityRange(): { from: string; to: string } {
  const keys = lastNDays(84);
  return { from: keys[0], to: keys[keys.length - 1] };
}

/** Профиль + пустые данные дня. */
function setupFilled(overrides: {
  today?: MealEntry[];
  waterMl?: number;
  weights?: WeightEntry[];
} = {}) {
  setQuery(api.profiles.getMyProfile, undefined, profile);
  setQuery(api.mealLog.getByDate, { date: todayKey() }, overrides.today ?? []);
  setQuery(api.weightEntries.listMyWeights, {}, overrides.weights ?? []);
  setQuery(api.workouts.listLogs, {}, []);
  setQuery(api.water.getByDate, { date: todayKey() }, { amountMl: overrides.waterMl ?? 0 });
  setQuery(api.activity.getActivityDays, activityRange(), []);
}

describe("Overview", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("показывает загрузку, пока профиль не пришёл", () => {
    renderWithRouter(<Overview />);
    expect(
      screen.queryByRole("heading", { name: "Сегодня" }),
    ).not.toBeInTheDocument();
  });

  it("без профиля предлагает настроить его и ведёт на профиль", () => {
    setQuery(api.profiles.getMyProfile, undefined, null);
    setQuery(api.mealLog.getByDate, { date: todayKey() }, []);
    setQuery(api.water.getByDate, { date: todayKey() }, { amountMl: 0 });
    setQuery(api.activity.getActivityDays, activityRange(), []);
    renderWithRouter(<Overview />);

    expect(screen.getByText("Настройте профиль, чтобы начать")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Настроить профиль/ })).toHaveAttribute(
      "href",
      "/dashboard/profile",
    );
  });

  it("с профилем показывает цели, воду, макросы и быстрые действия", () => {
    setupFilled();
    renderWithRouter(<Overview />);

    expect(screen.getByRole("heading", { name: "Сегодня" })).toBeInTheDocument();
    expect(screen.getByText("Приёмов пищи")).toBeInTheDocument();
    expect(screen.getByText("Тренировок за неделю")).toBeInTheDocument();
    expect(screen.getByText("Последний вес")).toBeInTheDocument();
    // Кольца макросов
    for (const label of ["Белки", "Углеводы", "Жиры"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // Вода: пусто — кнопка «−250 мл» недоступна, цель ещё не достигнута
    expect(screen.getByRole("button", { name: /\+250 мл/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Убрать 250 мл" })).toBeDisabled();
    expect(screen.getByText("Цель рассчитана из вашего веса: ~33 мл на кг.")).toBeInTheDocument();
    // Быстрые действия
    expect(screen.getByRole("link", { name: /Начать тренировку/ })).toHaveAttribute(
      "href",
      "/dashboard/workouts",
    );
    expect(screen.getByRole("link", { name: /Добавить приём пищи/ })).toHaveAttribute(
      "href",
      "/dashboard/meals",
    );
  });

  it("добавление воды вызывает мутацию и поздравляет при достижении цели", async () => {
    const user = userEvent.setup();
    setupFilled({ waterMl: WATER_GOAL - 250 });
    renderWithRouter(<Overview />);

    await user.click(screen.getByRole("button", { name: /\+250 мл/ }));

    expect(convexMock.mutationCalls).toContainEqual({
      path: "water.addWater",
      args: [{ date: todayKey(), amountMl: 250 }],
    });
    expect(toast.success).toHaveBeenCalledWith("Цель по воде достигнута! 🎉");
  });

  it("при ошибке обновления воды показывает toast об ошибке", async () => {
    const user = userEvent.setup();
    setupFilled({ waterMl: 500 });
    setMutation(api.water.addWater, () => Promise.reject(new Error("boom")));
    renderWithRouter(<Overview />);

    await user.click(screen.getByRole("button", { name: /\+250 мл/ }));

    expect(convexMock.mutationCalls).toContainEqual({
      path: "water.addWater",
      args: [{ date: todayKey(), amountMl: 250 }],
    });
    expect(toast.error).toHaveBeenCalledWith("Не удалось обновить воду");
  });

  it("при превышении калорий показывает предупреждение", () => {
    setupFilled({
      today: [
        {
          _id: "e1",
          date: todayKey(),
          mealType: "lunch",
          name: "Обед",
          quantity: 1,
          calories: 2500,
          protein: 100,
          carbs: 250,
          fat: 100,
        },
      ],
    });
    renderWithRouter(<Overview />);

    expect(screen.getByText("Превышение нормы")).toBeInTheDocument();
  });

  it("с записями веса показывает динамику и прогноз", () => {
    // Прогноз строится от трёх замеров (projectGoal: minSamples = 3).
    setupFilled({
      weights: [
        { _id: "w1", date: toDateKey(addDays(new Date(), -14)), weightKg: 81 },
        { _id: "w2", date: toDateKey(addDays(new Date(), -7)), weightKg: 80 },
        { _id: "w3", date: toDateKey(addDays(new Date(), -1)), weightKg: 79.2 },
      ],
    });
    renderWithRouter(<Overview />);

    expect(screen.getByText("Динамика веса")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Смотреть всё" })).toHaveAttribute(
      "href",
      "/dashboard/progress",
    );
    expect(screen.getByText(/При таком темпе/)).toBeInTheDocument();
  });
});
