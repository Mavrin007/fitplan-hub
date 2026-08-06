import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Мок convex-слоя: стабильные ссылки на функции вместо anyApi-Proxy.
vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));

import { api, setQuery } from "@/test/convex-react-mock";
import { resetMocks, renderWithRouter } from "@/test/utils";
import { profile, type MealEntry, type WeightEntry } from "@/test/fixtures";
import { lastNDays, toDateKey, todayKey } from "@/lib/dates";
import Progress from "./Progress";

/** Диапазон периода — как в компоненте (lastNDays(period)). */
function mealRange(period = 30): { from: string; to: string } {
  const days = lastNDays(period);
  return { from: days[0], to: days[days.length - 1] };
}

const ALL_MEALS_RANGE = { from: "0000-01-01", to: "9999-12-31" };

/** Мок всех диапазонов mealLog, включая 7/30/90 дней — смена периода
 *  меняет args запроса, и без заданного результата мок вернул бы
 *  undefined (компонент ушёл бы в скелетон). */
function seedMealRanges(meals: MealEntry[] = []) {
  for (const p of [7, 30, 90]) {
    setQuery(api.mealLog.getByRange, mealRange(p), meals);
  }
  setQuery(api.mealLog.getByRange, ALL_MEALS_RANGE, meals);
}

function mealEntry(
  id: string,
  date: string,
  calories: number,
  protein = 10,
  carbs = 20,
  fat = 5,
): MealEntry {
  return {
    _id: id,
    userId: "u1",
    createdAt: 0,
    date,
    mealType: "lunch",
    name: "Обед",
    quantity: 1,
    calories,
    protein,
    carbs,
    fat,
  };
}

function weightEntry(date: string, weightKg: number): WeightEntry {
  return { _id: `w-${date}`, userId: "u1", createdAt: 0, date, weightKg };
}

/** Пустые списки воды и своих продуктов (кнопки экспорта «Вода (0)» и
 *  «Продукты (0)» без них ушли бы в скелетон). */
function seedEmptyWaterAndFoods() {
  setQuery(api.water.listMyWater, {}, []);
  setQuery(api.foods.listMyFoods, {}, []);
}

/** Профиль + пустые данные: все графики показывают EmptyChart. */
function setupEmpty() {
  setQuery(api.profiles.getMyProfile, undefined, profile);
  setQuery(api.weightEntries.listMyWeights, {}, []);
  setQuery(api.workouts.listLogs, {}, []);
  seedEmptyWaterAndFoods();
  seedMealRanges([]);
}

describe("Progress", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("показывает скелетон, пока данные не загрузились", () => {
    renderWithRouter(<Progress />);
    expect(screen.queryByText("Тренды")).not.toBeInTheDocument();
  });

  it("без профиля предлагает настроить его", () => {
    setQuery(api.profiles.getMyProfile, undefined, null);
    setQuery(api.weightEntries.listMyWeights, {}, []);
    setQuery(api.workouts.listLogs, {}, []);
    seedEmptyWaterAndFoods();
    seedMealRanges([]);
    renderWithRouter(<Progress />);

    expect(
      screen.getByText("Настройте профиль, чтобы видеть цели на графиках."),
    ).toBeInTheDocument();
  });

  it("с пустыми данными показывает пустые состояния всех графиков и статы", () => {
    setupEmpty();
    renderWithRouter(<Progress />);

    expect(screen.getByRole("heading", { name: "Тренды" })).toBeInTheDocument();
    // В профиле есть targetWeightKg (75) — пустое состояние с упоминанием цели.
    expect(
      screen.getByText("Записывайте вес, чтобы увидеть путь к цели 75.0 кг."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Записывайте приёмы пищи в дневнике — здесь появится линия калорий."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Записывайте еду — макросы по дням появятся здесь."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Запишите первую тренировку из плана — появится недельная активность."),
    ).toBeInTheDocument();

    // Статы: нули по всем четырём метрикам.
    expect(screen.getByText("Средние калории")).toBeInTheDocument();
    expect(screen.getByText("Приёмов пищи")).toBeInTheDocument();
    expect(screen.getByText("Тренировок")).toBeInTheDocument();
    expect(screen.getByText("Замеров веса")).toBeInTheDocument();
    // Кнопки экспорта показывают количество записей — все пять типов.
    expect(screen.getByRole("button", { name: /Вес \(0\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Питание \(0\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Тренировки \(0\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Вода \(0\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Продукты \(0\)/ })).toBeInTheDocument();
  });

  it("с данными рисует графики: вес, калории, макросы, дельту и прогноз", () => {
    const now = new Date();
    const recent: WeightEntry[] = [
      weightEntry(toDateKey(new Date(now.getTime() - 14 * 86400000)), 82),
      weightEntry(toDateKey(new Date(now.getTime() - 7 * 86400000)), 81),
      weightEntry(todayKey(), 80),
    ];
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.weightEntries.listMyWeights, {}, recent);
    setQuery(api.workouts.listLogs, {}, []);
    seedEmptyWaterAndFoods();
    const meals = [
      mealEntry("m1", toDateKey(new Date(now.getTime() - 1 * 86400000)), 500),
      mealEntry("m2", todayKey(), 700),
    ];
    seedMealRanges(meals);
    renderWithRouter(<Progress />);

    // Заголовки графиков.
    for (const title of ["Вес", "Калории", "Макросы", "Тренировки"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    // Дельта веса: 82 → 80 = −2.0 кг.
    expect(screen.getByText(/−?2\.0 кг/)).toBeInTheDocument();
    // Прогноз (в профиле targetWeightKg = 75) — карточка «Прогноз по текущему темпу».
    expect(screen.getByText("Прогноз по текущему темпу")).toBeInTheDocument();
    expect(screen.getByText(/75\.0 кг — около/)).toBeInTheDocument();
    // Статы с данными: 2 приёма пищи, 3 замера.
    expect(screen.getByRole("button", { name: "Питание (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Вес (3)" })).toBeInTheDocument();
  });

  it("переключение периода меняет подписи и пересчитывает диапазон", async () => {
    const user = userEvent.setup();
    setupEmpty();
    renderWithRouter(<Progress />);

    // По умолчанию 30 дней.
    expect(screen.getByText(/Замеры за 30 дн\./)).toBeInTheDocument();

    // Переключение на 7 дней.
    await user.click(screen.getByText("7 дней"));
    expect(screen.getByText(/Замеры за 7 дн\./)).toBeInTheDocument();
    expect(screen.getByText(/Последние 7 дней против цели/)).toBeInTheDocument();
  });

  it("кнопки экспорта запускают скачивание CSV (URL-стаб в setup)", async () => {
    const user = userEvent.setup();
    const createUrl = vi.spyOn(URL, "createObjectURL");
    setupEmpty();
    renderWithRouter(<Progress />);

    await user.click(screen.getByRole("button", { name: /Вес \(0\)/ }));

    expect(createUrl).toHaveBeenCalledTimes(1);
    const blob = createUrl.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain("text/csv");
  });

  it("тренд вверх показывает плюс-дельту", () => {
    const now = new Date();
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.weightEntries.listMyWeights, {}, [
      weightEntry(toDateKey(new Date(now.getTime() - 7 * 86400000)), 78),
      weightEntry(todayKey(), 79.5),
    ]);
    setQuery(api.workouts.listLogs, {}, []);
    seedEmptyWaterAndFoods();
    seedMealRanges([]);
    renderWithRouter(<Progress />);

    expect(screen.getByText("+1.5 кг")).toBeInTheDocument();
  });
});
