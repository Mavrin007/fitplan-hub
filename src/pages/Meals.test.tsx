import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Мок convex-слоя: стабильные ссылки на функции вместо anyApi-Proxy.
vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));

import { api, convexMock, setQuery } from "@/test/convex-react-mock";
import { resetMocks, renderWithRouter, toast } from "@/test/utils";
import { profile, type MealEntry } from "@/test/fixtures";
import { addDays, toDateKey, todayKey } from "@/lib/dates";
import Meals from "./Meals";

function setupMeals({ today = [], foods = [] }: { today?: MealEntry[]; foods?: unknown[] } = {}) {
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
    setQuery(api.mealLog.getByDate, { date: yesterday }, [        {
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
        },
    ]);
    renderWithRouter(<Meals />);

    expect(screen.getByText(/Готово к копированию: 1 запись/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Скопировать в сегодня/ }));

    expect(convexMock.mutationCalls).toContainEqual(
      expect.objectContaining({
        path: "mealLog.addEntries",
        args: [
          {
            entries: expect.arrayContaining([
              expect.objectContaining({
                date: todayKey(),
                mealType: "dinner",
                name: "Лосось (запечённый)",
              }),
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
          },
        ],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Куриная грудка (гриль) — добавлено");
  });

  it("сохраняет свой продукт из формы", async () => {
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
          },
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
        args: [expect.objectContaining({ id: "e1", name: "Яйца", calories: 200 })],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Запись обновлена");
  });
});
