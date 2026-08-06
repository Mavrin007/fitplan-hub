import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Мок convex-слоя: стабильные ссылки на функции вместо anyApi-Proxy.
vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));
// Частичный мок mealLibrary: по умолчанию работают реальные генераторы, но
// тест duplicate-key может подменить generateWeeklyMealPlan фиксированным
// планом с двумя одинаковыми перекусами в одном дне.
vi.mock("@/lib/mealLibrary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mealLibrary")>();
  return {
    ...actual,
    generateWeeklyMealPlan: vi.fn(actual.generateWeeklyMealPlan),
    generateMealPlan: vi.fn(actual.generateMealPlan),
  };
});

import { api, convexMock, setMutation, setQuery } from "@/test/convex-react-mock";
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
import {
  generateMealPlan,
  generateWeeklyMealPlan,
  type MealType,
  type PlannedMeal,
  type WeeklyDay,
  type WeeklyMealPlan,
} from "@/lib/mealLibrary";
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
    // Частичный мок mealLibrary по умолчанию вызывает оригиналы —
    // возвращаем их после теста, который подменял план на фиксированный.
    vi.mocked(generateWeeklyMealPlan).mockRestore();
    vi.mocked(generateMealPlan).mockRestore();
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

  // Бывший источник duplicate-key: ключ недельного меню — `${mealType}-${name}`,
  // поэтому два snack в один день с ОДИНАКОВЫМ названием давали бы дубликат
  // React-ключа. Тест подменяет generateWeeklyMealPlan фиксированным планом
  // «набора массы» с двумя одинаковыми перекусами в дне и требует, чтобы
  // рендер не уронил duplicate-key предупреждение в консоль.
  it("5-приёмное меню «Набор массы»: два одинаковых перекуса в дне не дают duplicate-key", async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      setupMeals();

      // План недели из 5 приёмов в день; в первом дне два snack
      // с одинаковым именем «Протеиновый батончик» — ключ `snack-…`
      // совпадал бы дважды.
      const meal = (mealType: MealType, name: string): PlannedMeal => ({
        mealType,
        name,
        foods: [],
        calories: 100,
        protein: 10,
        carbs: 20,
        fat: 5,
        priceByn: 1,
      });
      const day = (i: number): WeeklyDay => {
        const meals: PlannedMeal[] = [
          meal("breakfast", "Овсянка с бананом"),
          meal("lunch", "Курица с рисом"),
          meal("dinner", "Гречка с говядиной"),
          meal("snack", "Протеиновый батончик"),
          meal("snack", i === 0 ? "Протеиновый батончик" : "Кефир с бананом"),
        ];
        return {
          dateKey: toDateKey(addDays(new Date(), i)),
          weekday: i,
          meals,
          calories: meals.reduce((s, m) => s + m.calories, 0),
          protein: 40,
          carbs: 80,
          fat: 20,
        };
      };
      const plan: WeeklyMealPlan = {
        goal: "gain_muscle",
        days: Array.from({ length: 7 }, (_, i) => day(i)),
      };
      vi.mocked(generateWeeklyMealPlan).mockReturnValue(plan);

      renderWithRouter(<Meals />);

      // Переключаем недельное меню на «Набор массы» — 5 приёмов в день.
      await user.click(screen.getByRole("button", { name: "Набор мышечной массы" }));
      expect(screen.getByText(/5 приёмов/)).toBeInTheDocument();
      expect(vi.mocked(generateWeeklyMealPlan)).toHaveBeenCalledWith(
        "gain_muscle",
        expect.anything(),
      );

      // Два одинаковых перекуса отрендерены в первом дне (2 + 1×6 = 8 раз),
      // без duplicate-key предупреждений React.
      expect(screen.getAllByText("Протеиновый батончик")).toHaveLength(8);
      const dupKeyErrors = errorSpy.mock.calls.filter((args) =>
        /same key|duplicate key/i.test(String(args[0] ?? "")),
      );
      expect(dupKeyErrors).toHaveLength(0);
    } finally {
      errorSpy.mockRestore();
    }
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

  it("показывает скелетон, пока профиль и дневник загружаются", () => {
    // Ни одного setQuery — профиль и дневник в состоянии undefined (загрузка).
    const { container } = renderWithRouter(<Meals />);

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Рацион за сегодня" }),
    ).not.toBeInTheDocument();
  });

  it("копирование: день без записей показан как пустой и кнопка отключена", () => {
    setupMeals();
    renderWithRouter(<Meals />);

    // Пустой «вчерашний» день: подсказка и отключённая кнопка — мутация
    // физически не может быть вызвана (защитная ветка хендлера недостижима
    // из UI, но сообщение пользователю покрыто).
    expect(
      screen.getByText(/Записей за .+ нет — выберите другой день/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Скопировать в сегодня/ }),
    ).toBeDisabled();
  });

  it("копирование из сегодняшней даты заблокировано в UI", () => {
    setupMeals();
    renderWithRouter(<Meals />);

    // max={вчера} в JSX не мешает fireEvent — переводим дату на сегодня:
    // кнопка отключается, подсказка меняется (сам хендлер недостижим из UI,
    // поэтому защитный гард внутри него не вызывается — это ок, ветка
    // `copyFromDate === todayKey()` покрывается оценкой условия в других тестах).
    fireEvent.change(screen.getByLabelText("День"), {
      target: { value: todayKey() },
    });

    expect(
      screen.getByRole("button", { name: /Скопировать в сегодня/ }),
    ).toBeDisabled();
    expect(screen.getByText("Выберите прошедший день.")).toBeInTheDocument();
  });

  it("библиотека: невалидное число порций блокируется понятной ошибкой", async () => {
    const user = userEvent.setup();
    setupMeals();
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: /Добавить в завтрак/ }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Поиск по библиотеке"), "курин");
    await user.click(within(dialog).getByRole("button", { name: /Куриная грудка/ }));

    const qty = within(dialog).getByLabelText("Порций");
    await user.clear(qty);
    await user.type(qty, "0");
    await user.click(
      within(dialog).getByRole("button", { name: /Добавить в завтрак/ }),
    );

    expect(toast.error).toHaveBeenCalledWith(
      "Порций: укажите число больше нуля, например 1,5.",
    );
    expect(
      convexMock.mutationCalls.filter((c) => c.path === "mealLog.addEntry"),
    ).toHaveLength(0);
  });

  it("библиотека: ошибка мутации показывает понятный toast", async () => {
    const user = userEvent.setup();
    setupMeals();
    setMutation(api.mealLog.addEntry, () =>
      Promise.reject(new Error("сеть упала")),
    );
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: /Добавить в завтрак/ }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Поиск по библиотеке"), "курин");
    await user.click(within(dialog).getByRole("button", { name: /Куриная грудка/ }));
    await user.click(
      within(dialog).getByRole("button", { name: /Добавить в завтрак/ }),
    );

    expect(toast.error).toHaveBeenCalledWith("Не удалось добавить продукт");
  });

  it("своё блюдо: смена приёма через Select и добавление с макросами", async () => {
    const user = userEvent.setup();
    setupMeals();
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: /Добавить в завтрак/ }));
    const dialog = screen.getByRole("dialog");

    // Меняем приём пищи «Завтрак» → «Обед» через Radix Select.
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Обед" }));

    await user.type(
      within(dialog).getByPlaceholderText("Название продукта"),
      "Творог 5%",
    );
    await user.type(within(dialog).getByPlaceholderText("ккал"), "180");
    await user.type(within(dialog).getByPlaceholderText("Белки, г"), "18");
    await user.type(within(dialog).getByPlaceholderText("Углеводы, г"), "6");
    await user.type(within(dialog).getByPlaceholderText("Жиры, г"), "9");
    await user.click(within(dialog).getByRole("button", { name: /Добавить своё/ }));

    expect(convexMock.mutationCalls).toContainEqual(
      expect.objectContaining({
        path: "mealLog.addEntry",
        args: [
          {
            date: todayKey(),
            mealType: "lunch",
            name: "Творог 5%",
            quantity: 1,
            calories: 180,
            protein: 18,
            carbs: 6,
            fat: 9,
          } satisfies MealLogArgs,
        ],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Творог 5% — добавлено");
  });

  it("своё блюдо: нулевые калории блокируются", async () => {
    const user = userEvent.setup();
    setupMeals();
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: /Добавить в завтрак/ }));
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByPlaceholderText("Название продукта"),
      "Вода",
    );
    await user.type(within(dialog).getByPlaceholderText("ккал"), "0");
    await user.click(within(dialog).getByRole("button", { name: /Добавить своё/ }));

    expect(toast.error).toHaveBeenCalledWith(
      "Укажите калории числом, например 250",
    );
  });

  it("редактирование: невалидные калории и порции показывают ошибки", async () => {
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

    const cals = within(dialog).getByPlaceholderText("ккал");
    await user.clear(cals);
    await user.type(cals, "0");
    await user.click(
      within(dialog).getByRole("button", { name: "Сохранить изменения" }),
    );
    expect(toast.error).toHaveBeenCalledWith(
      "Укажите калории числом, например 250",
    );

    // Калории чиним, но порции делаем невалидными.
    await user.clear(cals);
    await user.type(cals, "200");
    const qty = within(dialog).getByPlaceholderText("1");
    await user.clear(qty);
    await user.type(qty, "0");
    await user.click(
      within(dialog).getByRole("button", { name: "Сохранить изменения" }),
    );
    expect(toast.error).toHaveBeenCalledWith(
      "Порций: укажите число больше нуля, например 1,5.",
    );
  });

  it("форма своего продукта: пустая отправка показывает ошибку", async () => {
    const user = userEvent.setup();
    setupMeals();
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(toast.error).toHaveBeenCalledWith("Укажите название и калории");
    expect(
      convexMock.mutationCalls.filter((c) => c.path === "foods.addFood"),
    ).toHaveLength(0);
  });

  it("форма своего продукта: ошибка мутации показывает toast", async () => {
    const user = userEvent.setup();
    setupMeals();
    setMutation(api.foods.addFood, () => Promise.reject(new Error("boom")));
    renderWithRouter(<Meals />);

    // Заполняем все поля формы (включая «На», «Единица», макросы), чтобы
    // покрыть onChange каждого инпута.
    await user.type(screen.getByLabelText("Название"), "Кефир 2,5%");
    await user.type(screen.getByLabelText("На"), "250");
    await user.type(screen.getByLabelText("Единица"), "мл");
    await user.type(screen.getByLabelText("ккал"), "150");
    await user.type(screen.getByLabelText("Белки (г)"), "3");
    await user.type(screen.getByLabelText("Углеводы (г)"), "4");
    await user.type(screen.getByLabelText("Жиры (г)"), "2");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(toast.error).toHaveBeenCalledWith("Не удалось сохранить продукт");
  });

  it("удаляет свой продукт из библиотеки", async () => {
    const user = userEvent.setup();
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
        } satisfies FoodEntry,
      ],
    });
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: "Удалить Овсянка" }));

    expect(convexMock.mutationCalls).toContainEqual(
      expect.objectContaining({
        path: "foods.deleteFood",
        args: [{ id: "f1" }],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Овсянка — удалено из моих продуктов",
    );
  });

  it("«Записать» из своих продуктов открывает диалог с предзаполнением", async () => {
    const user = userEvent.setup();
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
        } satisfies FoodEntry,
      ],
    });
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: /Записать/ }));
    const dialog = screen.getByRole("dialog");

    // Поля предзаполнены значениями продукта, приём — «Перекус» (snack).
    expect(within(dialog).getByPlaceholderText("ккал")).toHaveValue("350");
    expect(within(dialog).getByPlaceholderText("Название продукта")).toHaveValue(
      "Овсянка",
    );

    await user.click(within(dialog).getByRole("button", { name: /Добавить своё/ }));

    expect(convexMock.mutationCalls).toContainEqual(
      expect.objectContaining({
        path: "mealLog.addEntry",
        args: [
          expect.objectContaining(
            {
              mealType: "snack",
              name: "Овсянка",
              calories: 350,
            } satisfies Partial<MealLogArgs>,
          ),
        ],
      }),
    );
  });

  it("Escape закрывает диалог добавления", async () => {
    const user = userEvent.setup();
    setupMeals();
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: /Добавить в завтрак/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("ошибка копирования дня показывает понятный toast", async () => {
    const user = userEvent.setup();
    setupMeals();
    setQuery(
      api.mealLog.getByDate,
      { date: toDateKey(addDays(new Date(), -1)) },
      [
        {
          _id: "y1",
          userId: "u1",
          createdAt: 0,
          date: toDateKey(addDays(new Date(), -1)),
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
    setMutation(api.mealLog.addEntries, () =>
      Promise.reject(new Error("сеть упала")),
    );
    renderWithRouter(<Meals />);

    await user.click(
      screen.getByRole("button", { name: /Скопировать в сегодня/ }),
    );

    expect(toast.error).toHaveBeenCalledWith("Не удалось скопировать записи");
  });

  it("ошибка добавления своего блюда показывает toast", async () => {
    const user = userEvent.setup();
    setupMeals();
    setMutation(api.mealLog.addEntry, () => Promise.reject(new Error("boom")));
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: /Добавить в завтрак/ }));
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByPlaceholderText("Название продукта"),
      "Творог",
    );
    await user.type(within(dialog).getByPlaceholderText("ккал"), "180");
    await user.click(within(dialog).getByRole("button", { name: /Добавить своё/ }));

    expect(toast.error).toHaveBeenCalledWith("Не удалось добавить продукт");
  });

  it("ошибка обновления записи показывает toast", async () => {
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
    setMutation(api.mealLog.updateEntry, () =>
      Promise.reject(new Error("boom")),
    );
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: "Редактировать запись" }));
    const dialog = screen.getByRole("dialog");
    const cals = within(dialog).getByPlaceholderText("ккал");
    await user.clear(cals);
    await user.type(cals, "200");
    await user.click(
      within(dialog).getByRole("button", { name: "Сохранить изменения" }),
    );

    expect(toast.error).toHaveBeenCalledWith("Не удалось обновить запись");
  });

  it("ошибка удаления записи показывает toast", async () => {
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
    setMutation(api.mealLog.deleteEntry, () =>
      Promise.reject(new Error("boom")),
    );
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: /Удалить Яйца/ }));

    expect(toast.error).toHaveBeenCalledWith("Не удалось удалить запись");
  });

  it("ошибка удаления своего продукта показывает toast", async () => {
    const user = userEvent.setup();
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
        } satisfies FoodEntry,
      ],
    });
    setMutation(api.foods.deleteFood, () => Promise.reject(new Error("boom")));
    renderWithRouter(<Meals />);

    await user.click(screen.getByRole("button", { name: "Удалить Овсянка" }));

    expect(toast.error).toHaveBeenCalledWith("Не удалось удалить продукт");
  });

  it("ошибка добавления плана в дневник показывает toast", async () => {
    const user = userEvent.setup();
    setupMeals();
    setMutation(api.mealLog.addEntries, () =>
      Promise.reject(new Error("boom")),
    );
    renderWithRouter(<Meals />);

    await user.click(
      screen.getByRole("button", { name: /Сгенерировать план на день/ }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /Добавить всё в дневник/,
      }),
    );

    expect(toast.error).toHaveBeenCalledWith("Не удалось добавить план");
  });
});
