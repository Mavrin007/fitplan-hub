import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Мок convex-слоя: стабильные ссылки на функции вместо anyApi-Proxy.
vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));

import { api, convexMock, setQuery } from "@/test/convex-react-mock";
import { resetMocks, renderWithRouter, toast } from "@/test/utils";
import {
  profile,
  type FoodArgs,
  type FoodEntry,
  type MealEntry,
  type MealLogArgs,
  type MealLogUpdateArgs,
} from "@/test/fixtures";
import { addDays, toDateKey, todayKey } from "@/lib/dates";
import Meals from "./Meals";

/** Список продуктов типизируется FoodEntry (поля из foodsFieldsValidator
 *  схемы) — расхождение фикстур со схемой ловится на этапе компиляции. */
function setupMeals({ today = [], foods = [] }: { today?: MealEntry[]; foods?: FoodEntry[] } = {}) {
  setQuery(api.profiles.getMyProfile, undefined, profile);
  setQuery(api.mealLog.getByDate, { date: todayKey() }, today);
  setQuery(api.foods.listMyFoods, {}, foods);
}

describe("Meals", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("без профиля предлагает перейти в профиль", () => {
    setQuery(api.profiles.getMyProfile, undefined, null);
    setQuery(api.mealLog.getByDate, { date: todayKey() }, []);
    renderWithRouter(<Meals />);

    expect(
      screen.getByText("Цели ещё не рассчитаны"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти в профиль" })).toHaveAttribute(
      "href",
      "/dashboard/profile",
    );
  });

  it("пустой день: четыре карточки приёмов и генератор плана", () => {
    setupMeals();
    renderWithRouter(<Meals />);

    expect(
      screen.getByRole("heading", { name: "Рацион за сегодня" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Итоги дня")).toBeInTheDocument();
    expect(screen.getAllByText("Пока ничего не записано.")).toHaveLength(4);
    expect(
      screen.getByRole("button", { name: /Сгенерировать план на день/ }),
    ).toBeInTheDocument();
  });

  it("показывает свои продукты из библиотеки (типизированный FoodEntry)", () => {
    // Литерал проверяется типом FoodEntry из foodsFieldsValidator схемы —
    // дрейф схемы (новое поле/смена типа) ломает компиляцию этого теста.
    setupMeals({
      foods: [
        {
          _id: "f1",
          userId: "u1",
          createdAt: 0,
          name: "Овсянка",
          amount: 100,
          unit: "г",
          calories: 350,
          protein: 12,
          carbs: 60,
          fat: 6,
        },
      ],
    });
    renderWithRouter(<Meals />);

    expect(screen.getByText("Овсянка")).toBeInTheDocument();
    expect(
      screen.getByText("350 ккал / 100 г · Б 12 · У 60 · Ж 6"),
    ).toBeInTheDocument();
  });

  it("показывает записи дня, суммы и макросы", () => {
    setupMeals({
      today: [
        {
          _id: "e1",
          userId: "u1",
          createdAt: 0,
          date: todayKey(),
          mealType: "breakfast",
          name: "Куриная грудка (гриль)",
          quantity: 1,
          calories: 500,
          protein: 40,
          carbs: 0,
          fat: 10,
        },
        {
          _id: "e2",
          userId: "u1",
          createdAt: 0,
          date: todayKey(),
          mealType: "lunch",
          name: "Белый рис",
          quantity: 2,
          calories: 300,
          protein: 6,
          carbs: 56,
          fat: 1,
        },
      ],
    });
    renderWithRouter(<Meals />);

    expect(screen.getByText("Куриная грудка (гриль)")).toBeInTheDocument();
    expect(screen.getByText("Белый рис")).toBeInTheDocument();
    // «500 ккал» дважды: бейдж карточки завтрака и строка самой записи.
    expect(screen.getAllByText("500 ккал").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Б 40 · У 0 · Ж 10")).toBeInTheDocument();
    // Итог: 500 + 300 = 800 ккал
    expect(screen.getByText("800")).toBeInTheDocument();
  });

  it("переносит записи из прошлого дня", async () => {
    const user = userEvent.setup();
    const yesterday = toDateKey(addDays(new Date(), -1));
    setupMeals();
    setQuery(
      api.mealLog.getByDate,
      { date: yesterday },
      [
        {
          _id: "y1",
          userId: "u1",
          createdAt: 0,
          date: yesterday,
          mealType: "dinner",
          name: "Лосось (запечённый)",
          quantity: 1,
          calories: 400,
          protein: 20,
          carbs: 0,
          fat: 13,
        } satisfies MealEntry,
      ],
    );
    renderWithRouter(<Meals />);

    expect(screen.getByText(/Готово к копированию: 1 запись/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Скопировать в сегодня/ }));

    expect(convexMock.mutationCalls).toContainEqual(
      expect.objectContaining({
        path: "mealLog.addEntries",
        args: [
          {
            entries: expect.arrayContaining([
              expect.objectContaining(
                {
                  date: todayKey(),
                  mealType: "dinner",
                  name: "Лосось (запечённый)",
                } satisfies Partial<MealLogArgs>,
              ),
            ]),
          },
        ],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("Скопировано записей: 1"),
    );
  });

  it("добавляет продукт из библиотеки через диалог", async () => {
    const user = userEvent.setup();
    setupMeals();
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: /Добавить в завтрак/ }));
    const dialog = screen.getByRole("dialog");

    await user.type(within(dialog).getByLabelText("Поиск по библиотеке"), "курин");
    await user.click(within(dialog).getByRole("button", { name: /Куриная грудка/ }));
    await user.click(within(dialog).getByRole("button", { name: /Добавить в завтрак/ }));

    // Куриная грудка: 165 ккал / 31 б / 3.6 ж на 150 г. 1 порция = 150 г,
    // ratio = 1.5 → 165·1.5 = 247.5 ≈ 248, белки 31·1.5 = 46.5, жиры 3.6·1.5 = 5.4.
    expect(convexMock.mutationCalls).toContainEqual(
      expect.objectContaining({
        path: "mealLog.addEntry",
        // Литерал проверяется MealLogArgs из схемы — дрейф полей дневника
        // (смена типа, новое обязательное поле) ломает компиляцию.
        args: [
          {
            date: todayKey(),
            mealType: "breakfast",
            name: "Куриная грудка (гриль)",
            quantity: 1,
            calories: 248,
            protein: 46.5,
            carbs: 0,
            fat: 5.4,
          } satisfies MealLogArgs,
        ],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Куриная грудка (гриль) — добавлено");
  });

  // Под полной нагрузкой coverage-прогона (все файлы параллельно) тест
  // с dialog-аннимациями не успевает за дефолтные 5 секунд — даём запас.
  it("сохраняет свой продукт из формы", { timeout: 20000 }, async () => {
    const user = userEvent.setup();
    setupMeals();
    renderWithRouter(<Meals />);

    await user.type(screen.getByLabelText("Название"), "Мой протеиновый коктейль");
    await user.type(screen.getByLabelText("ккал"), "400");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(convexMock.mutationCalls).toContainEqual(
      expect.objectContaining({
        path: "foods.addFood",
        args: [
          {
            name: "Мой протеиновый коктейль",
            amount: 100,
            unit: "г",
            calories: 400,
            protein: 0,
            carbs: 0,
            fat: 0,
          } satisfies FoodArgs,
        ],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Продукт сохранён");
  });

  it("удаляет запись по кнопке", async () => {
    const user = userEvent.setup();
    setupMeals({
      today: [
        {
          _id: "e1",
          userId: "u1",
          createdAt: 0,
          date: todayKey(),
          mealType: "snack",
          name: "Яблоко",
          quantity: 1,
          calories: 90,
          protein: 0,
          carbs: 20,
          fat: 0,
        },
      ],
    });
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: /Удалить/ }));

    expect(convexMock.mutationCalls).toContainEqual(
      expect.objectContaining({
        path: "mealLog.deleteEntry",
        args: [{ id: "e1" }],
      }),
    );
  });

  it("добавляет предложенный план на день в дневник", async () => {
    const user = userEvent.setup();
    setupMeals();
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: /Сгенерировать план на день/ }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Предложенный план на сегодня"),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: /Добавить всё в дневник/ }),
    );

    expect(convexMock.mutationCalls).toContainEqual(
      expect.objectContaining({
        path: "mealLog.addEntries",
        args: [expect.objectContaining({ entries: expect.any(Array) })],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("План на день добавлен в дневник");
  });

  it("переключатель цели недельного меню перестраивает план и диалог", async () => {
    const user = userEvent.setup();
    setupMeals();
    renderWithRouter(<Meals />);

    // Цель профиля — «Похудение»: чип выбран по умолчанию, день из 4 приёмов.
    const loseChip = screen.getByRole("button", { name: "Похудение" });
    expect(loseChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/4 приёмов/)).toBeInTheDocument();

    // Переключаем недельное меню на «Набор массы».
    await user.click(screen.getByRole("button", { name: "Набор мышечной массы" }));

    expect(
      screen.getByRole("button", { name: "Набор мышечной массы" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(loseChip).toHaveAttribute("aria-pressed", "false");

    // У набора массы день из 5 приёмов (два перекуса) — сводка пересчиталась.
    expect(screen.getByText(/5 приёмов/)).toBeInTheDocument();

    // В недельном меню у каждого дня два перекуса: 7 дней × 2 = 14 строк.
    const weekly = screen
      .getByRole("heading", { name: "Недельное меню" })
      .closest("section");
    expect(weekly).not.toBeNull();
    expect(within(weekly!).getAllByText("Перекус")).toHaveLength(14);

    // Диалог «Предложенный план на сегодня» строится под выбранную цель.
    await user.click(
      screen.getByRole("button", { name: /Сгенерировать план на день/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/набор мышечной массы/i),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText("Перекус")).toHaveLength(2);

    // Добавление плана в дневник использует приёмы выбранной цели (snack ×2).
    await user.click(
      within(dialog).getByRole("button", { name: /Добавить всё в дневник/ }),
    );
    expect(convexMock.mutationCalls).toContainEqual(
      expect.objectContaining({
        path: "mealLog.addEntries",
        args: [
          expect.objectContaining({
            entries: expect.arrayContaining([
              expect.objectContaining({ mealType: "snack" }),
              expect.objectContaining({ mealType: "snack" }),
            ]),
          }),
        ],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("План на день добавлен в дневник");
  });

  it("редактирует запись: диалог предзаполнен, изменения сохраняются", async () => {
    const user = userEvent.setup();
    setupMeals({
      today: [
        {
          _id: "e1",
          userId: "u1",
          createdAt: 0,
          date: todayKey(),
          mealType: "breakfast",
          name: "Яйца",
          quantity: 1,
          calories: 155,
          protein: 13,
          carbs: 1.1,
          fat: 11,
        },
      ],
    });
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: "Редактировать запись" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Изменить запись")).toBeInTheDocument();

    const cals = within(dialog).getByPlaceholderText("ккал");
    expect(cals).toHaveValue("155");
    await user.clear(cals);
    await user.type(cals, "200");
    await user.click(within(dialog).getByRole("button", { name: "Сохранить изменения" }));

    expect(convexMock.mutationCalls).toContainEqual(
      expect.objectContaining({
        path: "mealLog.updateEntry",
        args: [
          expect.objectContaining(
            { id: "e1", name: "Яйца", calories: 200 } satisfies Partial<MealLogUpdateArgs>,
          ),
        ],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Запись обновлена");
  });
});
