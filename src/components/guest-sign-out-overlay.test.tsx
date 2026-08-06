import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Мок convex-слоя: api.guestStats.* адресуется через stableStringify.
vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
// Скачивание проверяем через заглушки: экспорт-функции сами создают Blob и
// кликают по ссылке — в тесте важно, что они вызваны с реальными строками.
vi.mock("@/lib/export", () => ({
  exportWeights: vi.fn(),
  exportMeals: vi.fn(),
  exportWorkouts: vi.fn(),
  exportWater: vi.fn(),
  exportFoods: vi.fn(),
}));

import { api, setQuery } from "@/test/convex-react-mock";
import { resetMocks, renderWithRouter } from "@/test/utils";
import {
  exportMeals,
  exportWeights,
  exportWorkouts,
  exportWater,
  exportFoods,
} from "@/lib/export";
import { GuestSignOutOverlay } from "./guest-sign-out-overlay";

/** Широкий диапазон дат, которым оверлей запрашивает дневник питания. */
const EXPORT_RANGE = { from: "0000-01-01", to: "9999-12-31" };

// vi.mocked привязывает типы jest-моков к заглушкам из vi.mock выше.
const exportWeightsMock = vi.mocked(exportWeights);
const exportMealsMock = vi.mocked(exportMeals);
const exportWorkoutsMock = vi.mocked(exportWorkouts);
const exportWaterMock = vi.mocked(exportWater);
const exportFoodsMock = vi.mocked(exportFoods);

const onCancel = vi.fn();
const onAttach = vi.fn();
const onSignOut = vi.fn();

// Модель двухступенчатого запроса: сначала дешёвый hasMyData (undefined args),
// точный countMyData запрашивается только при hasData=true (тогда args
// undefined; иначе компонент шлёт "skip" и мок его не матчит).
function renderOverlay(opts?: { hasData?: boolean; count?: number }) {
  if (opts?.hasData !== undefined) {
    setQuery(api.guestStats.hasMyData, undefined, opts.hasData);
  }
  if (opts?.hasData === true && opts.count !== undefined) {
    setQuery(api.guestStats.countMyData, undefined, opts.count);
  }
  return renderWithRouter(
    <GuestSignOutOverlay
      open
      onCancel={onCancel}
      onAttach={onAttach}
      onSignOut={onSignOut}
    />,
  );
}

/** Задаёт ответы на запросы данных для кнопки «Скачать свои данные»
 *  (оверлей запрашивает их только после клика — с теми же args). */
function setExportData() {
  setQuery(api.weightEntries.listMyWeights, {}, [
    { date: "2026-08-05", weightKg: 80.5 },
  ]);
  setQuery(api.mealLog.getByRange, EXPORT_RANGE, [
    {
      date: "2026-08-05",
      mealType: "lunch",
      name: "Куриная грудка",
      quantity: 1.5,
      calories: 248,
      protein: 46.5,
      carbs: 0,
      fat: 5.4,
    },
  ]);
  setQuery(api.workouts.listLogs, {}, [
    {
      date: "2026-08-05",
      workoutName: "Фулбоди A",
      exercises: [{ name: "Приседания", sets: 1, reps: 8, weightKg: 0 }],
    },
  ]);
  setQuery(api.water.listMyWater, {}, [
    { date: "2026-08-05", amountMl: 1750 },
  ]);
  setQuery(api.foods.listMyFoods, {}, [
    {
      name: "Творог 5%",
      amount: 150,
      unit: "г",
      calories: 165,
      protein: 20,
      carbs: 4,
      fat: 7,
    },
  ]);
}

function renderWithData(count: number) {
  return renderOverlay({ hasData: true, count });
}

describe("GuestSignOutOverlay", () => {
  beforeEach(() => {
    resetMocks();
    onCancel.mockClear();
    onAttach.mockClear();
    onSignOut.mockClear();
    exportWeightsMock.mockClear();
    exportMealsMock.mockClear();
    exportWorkoutsMock.mockClear();
    exportWaterMock.mockClear();
    exportFoodsMock.mockClear();
  });

  it("с записями (hasData=true) показывает количество и кнопку «Привязать почту»", async () => {
    renderWithData(7);

    expect(
      await screen.findByText("В гостевом аккаунте 7 записей. Без привязки почты они будут недоступны после выхода и с других устройств."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Привязать почту/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Выйти всё равно/ })).toBeInTheDocument();
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("единственное число: 1 запись", async () => {
    renderWithData(1);

    expect(
      await screen.findByText("В гостевом аккаунте 1 запись. Без привязки почты они будут недоступны после выхода и с других устройств."),
    ).toBeInTheDocument();
  });

  it("без данных (hasData=false) выходит сразу, без ожидания клика", async () => {
    renderOverlay({ hasData: false });

    // Контракт: эффект сам вызывает onSignOut (родитель закрывает диалог и
    // выходит); пользователь ничего не нажимает. Точный countMyData при этом
    // не запрашивается (skip) — смотри мок-хелпер выше.
    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("«Привязать почту» зовёт onAttach и не выходит", async () => {
    const user = userEvent.setup();
    renderWithData(3);

    await user.click(
      await screen.findByRole("button", { name: /Привязать почту/ }),
    );

    expect(onAttach).toHaveBeenCalledTimes(1);
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("с данными показывает кнопку «Скачать свои данные»", async () => {
    renderWithData(3);

    expect(
      await screen.findByRole("button", { name: /Скачать свои данные/ }),
    ).toBeInTheDocument();
  });

  it("клик по «Скачать свои данные» выгружает все пять CSV с реальными строками", async () => {
    const user = userEvent.setup();
    setExportData();
    renderWithData(3);

    await user.click(
      await screen.findByRole("button", { name: /Скачать свои данные/ }),
    );

    // Данные запрашиваются лениво (по клику) и уходят в экспорт как есть.
    await waitFor(() => expect(exportWeightsMock).toHaveBeenCalledTimes(1));
    expect(exportWeightsMock).toHaveBeenCalledWith([
      { date: "2026-08-05", weightKg: 80.5 },
    ]);
    expect(exportMealsMock).toHaveBeenCalledWith([
      {
        date: "2026-08-05",
        mealType: "lunch",
        name: "Куриная грудка",
        quantity: 1.5,
        calories: 248,
        protein: 46.5,
        carbs: 0,
        fat: 5.4,
      },
    ]);
    expect(exportWorkoutsMock).toHaveBeenCalledWith([
      {
        date: "2026-08-05",
        workoutName: "Фулбоди A",
        exercises: [{ name: "Приседания", sets: 1, reps: 8, weightKg: 0 }],
      },
    ]);
    expect(exportWaterMock).toHaveBeenCalledWith([
      { date: "2026-08-05", amountMl: 1750 },
    ]);
    expect(exportFoodsMock).toHaveBeenCalledWith([
      {
        name: "Творог 5%",
        amount: 150,
        unit: "г",
        calories: 165,
        protein: 20,
        carbs: 4,
        fat: 7,
      },
    ]);
    // Скачивание не выходит из сессии и не закрывает диалог.
    expect(onSignOut).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("без данных кнопки «Скачать свои данные» нет", async () => {
    renderOverlay(); // hasData=undefined — проверка ещё грузится.

    expect(screen.queryByRole("button", { name: /Скачать свои данные/ })).not.toBeInTheDocument();
  });

  it("«Выйти всё равно» зовёт onSignOut (осознанный отказ от данных)", async () => {
    const user = userEvent.setup();
    renderWithData(3);

    await user.click(
      await screen.findByRole("button", { name: /Выйти всё равно/ }),
    );

    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(onAttach).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("«Отмена» зовёт onCancel и не выходит", async () => {
    const user = userEvent.setup();
    renderWithData(3);

    await user.click(await screen.findByRole("button", { name: "Отмена" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSignOut).not.toHaveBeenCalled();
    expect(onAttach).not.toHaveBeenCalled();
  });

  it("пока проверка грузится (hasData=undefined) — «Проверяем ваши данные…» и можно выйти", async () => {
    renderOverlay(); // hasMyData остаётся undefined — запрос «в полёте».

    expect(
      await screen.findByText("Проверяем ваши данные…"),
    ).toBeInTheDocument();
    // Кнопки активны даже без ответа счётчика (см. комментарий в компоненте).
    expect(screen.getByRole("button", { name: "Выйти" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отмена" })).toBeInTheDocument();
    expect(onSignOut).not.toHaveBeenCalled();
  });
});
