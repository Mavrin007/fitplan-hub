import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

// Мок convex-слоя: стабильные ссылки на функции вместо anyApi-Proxy.
vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));

// useAuth() дёргает useConvexAuth/useAuthActions, которых нет в дереве теста, —
// мокаем сам хук (как RequireAuth.test); имя для приветствия задаём напрямую.
const authState = vi.hoisted(() => ({
  user: null as { _id: string; name?: string; email?: string } | null,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: authState.user,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

import { api, convexMock, setMutation, setQuery } from "@/test/convex-react-mock";
import { resetMocks, renderWithRouter, toast } from "@/test/utils";
import {
  profile,
  waterEntry,
  type ActivityDay,
  type MealEntry,
  type WaterAddArgs,
  type WeightEntry,
} from "@/test/fixtures";
import { lastNDays, todayKey } from "@/lib/dates";
import Overview from "./Overview";

/** Цель по воде: max(1500, round(80·33/250)·250) = 2750 мл. */
const WATER_GOAL = 2750;

/** Тот же диапазон, что строит Overview для серии активности. */
function activityRange(): { from: string; to: string } {
  const keys = lastNDays(84);
  return { from: keys[0], to: keys[keys.length - 1] };
}

/** Профиль + пустые данные дня. Вода задаётся типизированной фикстурой. */
function setupFilled(overrides: {
  today?: MealEntry[];
  waterMl?: number;
  weights?: WeightEntry[];
  workoutLogs?: unknown[];
  activity?: ActivityDay[];
  user?: { _id: string; name?: string; email?: string };
} = {}) {
  setQuery(api.profiles.getMyProfile, undefined, profile);
  setQuery(api.mealLog.getByDate, { date: todayKey() }, overrides.today ?? []);
  setQuery(api.weightEntries.listMyWeights, { limit: 90 }, overrides.weights ?? []);
  setQuery(api.workouts.listLogs, { limit: 200 }, overrides.workoutLogs ?? []);
  setQuery(
    api.water.getByDate,
    { date: todayKey() },
    waterEntry(overrides.waterMl ?? 0),
  );
  setQuery(api.activity.getActivityDays, activityRange(), overrides.activity ?? []);
  authState.user = overrides.user ?? null;
}

/** Запись дневника за сегодня (для «закрытых» привычек). */
function mealEntry(
  mealType: MealEntry["mealType"],
  calories: number,
  protein = 0,
): MealEntry {
  return {
    _id: `${mealType}-1`,
    userId: "u1",
    createdAt: 0,
    date: todayKey(),
    mealType,
    name: "Приём",
    quantity: 1,
    calories,
    protein,
    carbs: 0,
    fat: 0,
  };
}

describe("Overview", () => {
  beforeEach(() => {
    resetMocks();
    authState.user = null;
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
    setQuery(api.water.getByDate, { date: todayKey() }, waterEntry(0));
    setQuery(api.activity.getActivityDays, activityRange(), []);
    renderWithRouter(<Overview />);

    expect(screen.getByText("Настройте профиль, чтобы начать")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Настроить профиль/ })).toHaveAttribute(
      "href",
      "/dashboard/profile",
    );
  });

  it("переход: пустое состояние → дашборд после появления профиля", () => {
    setQuery(api.profiles.getMyProfile, undefined, null);
    setQuery(api.mealLog.getByDate, { date: todayKey() }, []);
    setQuery(api.weightEntries.listMyWeights, { limit: 90 }, []);
    setQuery(api.workouts.listLogs, { limit: 200 }, []);
    setQuery(api.water.getByDate, { date: todayKey() }, waterEntry(0));
    setQuery(api.activity.getActivityDays, activityRange(), []);
    const view = renderWithRouter(<Overview />);

    expect(screen.getByText("Настройте профиль, чтобы начать")).toBeInTheDocument();

    setQuery(api.profiles.getMyProfile, undefined, profile);
    view.rerender(
      <MemoryRouter>
        <Overview />
      </MemoryRouter>,
    );

    expect(
      screen.queryByText("Настройте профиль, чтобы начать"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Сегодня" })).toBeInTheDocument();
    // Оценка дня и цель по калориям из фикстуры (2345) видны.
    expect(screen.getByText("Оценка дня")).toBeInTheDocument();
    expect(screen.getByText(/2 345/)).toBeInTheDocument();
    // Кнопки быстрой воды на месте.
    expect(screen.getByRole("button", { name: /\+250 мл/ })).toBeInTheDocument();
  });

  it("с профилем и пустым днём: оценка, чек-лист, коуч и действия", () => {
    setupFilled();
    renderWithRouter(<Overview />);

    // Заголовок и приветствие.
    expect(screen.getByRole("heading", { name: "Сегодня" })).toBeInTheDocument();
    expect(screen.getByText("Оценка дня")).toBeInTheDocument();
    expect(screen.getByText("Новый день — начнём")).toBeInTheDocument();

    // Кольца-привычки: «Калории» (нужно e2e) + вода в литрах.
    expect(screen.getAllByText("Калории").length).toBeGreaterThan(0);
    expect(screen.getByText("0 / 2,8 л")).toBeInTheDocument();

    // Чек-лист: все шесть строк на месте, счётчик 0 из 6.
    expect(screen.getByText("План на день")).toBeInTheDocument();
    expect(screen.getByText("0 из 6")).toBeInTheDocument();
    // Метки «Вода»/«Тренировка»/«Вес» встречаются и в кольцах, и в неделе.
    for (const label of ["Завтрак", "Обед", "Ужин", "Вода", "Тренировка", "Вес"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    // Коуч советует тренировку, CTA ведёт на тренировки.
    expect(screen.getByText(/Сегодня ещё не было тренировки/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти к тренировке" })).toHaveAttribute(
      "href",
      "/dashboard/workouts",
    );

    // Главное действие — тренировка; второстепенные — еда и вес.
    expect(screen.getByRole("link", { name: "Начать тренировку" })).toHaveAttribute(
      "href",
      "/dashboard/workouts",
    );
    expect(screen.getByRole("link", { name: "Добавить приём пищи" })).toHaveAttribute(
      "href",
      "/dashboard/meals",
    );
    expect(screen.getByRole("link", { name: "Записать вес" })).toHaveAttribute(
      "href",
      "/dashboard/progress",
    );

    // Вода: пусто — «−250 мл» недоступна.
    expect(screen.getByRole("button", { name: "Убрать 250 мл" })).toBeDisabled();
  });

  it("приветствует пользователя по имени из профиля/email", () => {
    setupFilled({ user: { _id: "u1", name: "Александр", email: "a@b.c" } });
    renderWithRouter(<Overview />);
    expect(screen.getByText(/Александр/)).toBeInTheDocument();
  });

  it("добавление воды вызывает мутацию и поздравляет при достижении цели", async () => {
    const user = userEvent.setup();
    setupFilled({ waterMl: WATER_GOAL - 250 });
    renderWithRouter(<Overview />);

    await user.click(screen.getByRole("button", { name: /\+250 мл/ }));

    expect(convexMock.mutationCalls).toContainEqual({
      path: "water.addWater",
      args: [{ date: todayKey(), amountMl: 250 } satisfies WaterAddArgs],
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
      args: [{ date: todayKey(), amountMl: 250 } satisfies WaterAddArgs],
    });
    expect(toast.error).toHaveBeenCalledWith("Не удалось обновить воду");
  });

  it("закрытые привычки отмечаются в чек-листе и меняют счётчик", () => {
    setupFilled({
      today: [
        mealEntry("breakfast", 700, 50),
        mealEntry("lunch", 900, 60),
      ],
      waterMl: WATER_GOAL,
      workoutLogs: [
        {
          _id: "w1",
          userId: "u1",
          createdAt: 0,
          date: todayKey(),
          workoutName: "Тренировка",
          exercises: [],
        },
      ],
      weights: [
        {
          _id: "wt1",
          userId: "u1",
          createdAt: 0,
          date: todayKey(),
          weightKg: 79,
        } satisfies WeightEntry,
      ],
    });
    renderWithRouter(<Overview />);

    // Завтрак, обед, вода, тренировка и вес — закрыты; ужин — нет.
    expect(screen.getByRole("link", { name: "Завтрак, выполнено" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Обед, выполнено" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ужин, осталось" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Тренировка, выполнено" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Вес, выполнено" })).toBeInTheDocument();
    expect(screen.getByText("5 из 6")).toBeInTheDocument();
    // Вода достигла цели: литры показывают 2,8 / 2,8.
    expect(screen.getByText("2,8 / 2,8 л")).toBeInTheDocument();
  });

  it("идеальный день по всем привычкам даёт «Отличный день»", () => {
    setupFilled({
      today: [
        mealEntry("breakfast", 700, 50),
        mealEntry("lunch", 900, 60),
        mealEntry("dinner", 745, 42),
      ],
      waterMl: WATER_GOAL,
      workoutLogs: Array.from({ length: 3 }, (_, i) => ({
        _id: `w${i}`,
        userId: "u1",
        createdAt: 0,
        date: todayKey(),
        workoutName: "Тренировка",
        exercises: [],
      })),
      weights: [
        {
          _id: "wt1",
          userId: "u1",
          createdAt: 0,
          date: todayKey(),
          weightKg: 79,
        } satisfies WeightEntry,
      ],
    });
    renderWithRouter(<Overview />);

    // Оценка 100 → верхняя градация; коуч хвалит (полный текст не совпадает
    // с точной строкой «Отличный день», поэтому матч только по бейджу).
    expect(screen.getByText("Отличный день")).toBeInTheDocument();
    expect(screen.getByText("6 из 6")).toBeInTheDocument();
  });

  it("показывает серию активных дней из диапазона", () => {
    setupFilled({
      activity: [{ date: todayKey(), count: 1 } satisfies ActivityDay],
    });
    renderWithRouter(<Overview />);

    expect(screen.getByText(/день подряд/)).toBeInTheDocument();
  });

  it("показывает динамику веса за неделю в блоке «Неделя»", () => {
    const weekAgo = addDaysKey(-7);
    setupFilled({
      weights: [
        { _id: "w1", userId: "u1", createdAt: 0, date: addDaysKey(-14), weightKg: 81 },
        { _id: "w2", userId: "u1", createdAt: 0, date: weekAgo, weightKg: 80 },
        { _id: "w3", userId: "u1", createdAt: 0, date: todayKey(), weightKg: 79.2 },
      ],
    });
    renderWithRouter(<Overview />);

    expect(screen.getByText("Вся статистика")).toHaveAttribute(
      "href",
      "/dashboard/progress",
    );
    expect(screen.getByText("-0.8 кг за нед.")).toBeInTheDocument();
  });
});

/** Дата-ключ за N дней от сегодня (для фикстур веса). */
function addDaysKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
