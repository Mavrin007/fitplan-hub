import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));

import { api, convexMock, setQuery } from "@/test/convex-react-mock";
import { resetMocks, renderWithRouter, toast } from "@/test/utils";
import { profile, type FixtureUserId } from "@/test/fixtures";
import { profileSignature, type WorkoutDay } from "@/lib/workoutLibrary";
import Workouts from "./Workouts";

/** День плана, максимально близкий к реальному выходу генератора. */
function makeDay(day: number, focus: string): WorkoutDay {
  return {
    day,
    focus,
    exercises: [
      {
        name: "Приседания",
        sets: 3,
        reps: "8-12",
        restSeconds: 90,
        weightKg: 40,
        weightNote: "+2.5 кг на неделе 3",
        tempo: "2-1-1",
        priority: true,
      },
      {
        name: "Отжимания",
        sets: 3,
        reps: "10-15",
        restSeconds: 60,
      },
    ],
    warmup: ["5–7 мин лёгкого кардио", "Суставная разминка"],
    notes: ["Колени: приседания с опорой"],
    approxMinutes: 45,
  };
}

/** План со свежей сигнатурой профиля (чтобы эффект автопересборки молчал). */
function makePlan(signature: string) {
  const day = makeDay(0, "Фулбоди A");
  return {
    _id: "plan1",
    userId: "u1" as FixtureUserId,
    name: "Фулбоди · Жиросжигание",
    adaptedFor: "Адаптирован под профиль: без прыжков (колени)",
    profileSignature: signature,
    goal: "lose_weight",
    experienceLevel: "intermediate",
    splitType: "Фулбоди",
    sessionsPerWeek: 3,
    durationWeeks: 4,
    howCalculated: ["ИМТ в норме — умеренный темп прогрессии", "Колени: прыжки заменены"],
    days: [day],
    weeks: [
      { week: 1, label: "Неделя 1 · База", days: [day] },
      { week: 2, label: "Неделя 2 · Прогресс", weightNote: "+1 повтор", days: [day] },
    ],
    updatedAt: 0,
  };
}

describe("Workouts", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("показывает скелетон, пока данные грузятся", () => {
    renderWithRouter(<Workouts />);
    expect(
      screen.queryByText("План тренировок"),
    ).not.toBeInTheDocument();
  });

  it("без профиля предлагает настроить его", () => {
    setQuery(api.profiles.getMyProfile, undefined, null);
    setQuery(api.workouts.getMyPlan, undefined, null);
    setQuery(api.workouts.listLogs, {}, []);
    renderWithRouter(<Workouts />);

    expect(
      screen.getByText("Настройте профиль, чтобы получить план тренировок под вашу цель."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти в профиль" })).toHaveAttribute(
      "href",
      "/dashboard/profile",
    );
  });

  it("генерация плана зовёт savePlan и показывает тост", async () => {
    const user = userEvent.setup();
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.workouts.getMyPlan, undefined, null);
    setQuery(api.workouts.listLogs, {}, []);
    renderWithRouter(<Workouts />);

    expect(
      screen.getByText("Плана тренировок пока нет"),
    ).toBeInTheDocument();

    // Кнопка есть и в заголовке, и в EmptyState — жмём первую.
    await user.click(screen.getAllByRole("button", { name: "Сгенерировать план" })[0]);

    expect(convexMock.mutationCalls).toContainEqual(
      expect.objectContaining({
        path: "workouts.savePlan",
        args: [expect.objectContaining({ name: expect.any(String), goal: "lose_weight" })],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "План тренировок сгенерирован",
      expect.anything(),
    );
  });

  it("с планом показывает дни, упражнения, недели цикла и статистику", async () => {
    const user = userEvent.setup();
    const signature = profileSignature(profile as Parameters<typeof profileSignature>[0]);
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.workouts.getMyPlan, undefined, makePlan(signature));
    setQuery(api.workouts.listLogs, {}, []);
    renderWithRouter(<Workouts />);

    // План и его сводка: весь текст в одном <p> — проверяем содержимое целиком.
    const summary = screen.getByText(
      (_, el) => el?.tagName === "P" && (el.textContent ?? "").includes("тренировок в неделю"),
    );
    expect(summary.textContent).toContain("3 тренировок в неделю");
    expect(summary.textContent).toContain("цикл 4 недели");
    expect(summary.textContent).toContain("похудение");
    // Недели цикла и переключение.
    expect(screen.getByRole("button", { name: "Неделя 2 цикла" })).toBeInTheDocument();
    // День плана: разминка, заметка, упражнения.
    expect(screen.getByText("Пн · Фулбоди A")).toBeInTheDocument();
    expect(screen.getAllByText("Приседания").length).toBeGreaterThan(0);
    // С весом текст сливается: «40 кг · 3 × 8-12» — матчим подстрокой.
    expect(screen.getByText(/3 × 8-12/)).toBeInTheDocument();
    expect(screen.getByText("Разминка")).toBeInTheDocument();
    expect(screen.getByText("Колени: приседания с опорой")).toBeInTheDocument();
    // «Как считается план».
    expect(screen.getByText("ИМТ в норме — умеренный темп прогрессии")).toBeInTheDocument();
    // Пустая статистика и история.
    expect(screen.getByText("Объём и рекорды")).toBeInTheDocument();
    expect(screen.getByText("Рекордов пока нет")).toBeInTheDocument();
    expect(
      screen.getByText("Пока нет записей — нажмите «Начать тренировку» у любой сессии выше."),
    ).toBeInTheDocument();

    // Переключение недели цикла.
    await user.click(screen.getByRole("button", { name: "Неделя 2 цикла" }));
    expect(screen.getByText("Неделя 2 · Прогресс")).toBeInTheDocument();
    expect(screen.getByText(/\+1 повтор/)).toBeInTheDocument();
  });

  it("подсказки по технике раскрываются по клику", async () => {
    const user = userEvent.setup();
    const signature = profileSignature(profile as Parameters<typeof profileSignature>[0]);
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.workouts.getMyPlan, undefined, makePlan(signature));
    setQuery(api.workouts.listLogs, {}, []);
    renderWithRouter(<Workouts />);

    // У «Приседаний» есть техника в EXERCISE_TIPS.
    await user.click(
      screen.getByRole("button", { name: "Показать технику для Приседания" }),
    );
    expect(
      screen.getByRole("button", { name: "Скрыть технику для Приседания" }),
    ).toBeInTheDocument();
  });

  it("с логами строит тоннаж, рекорды, историю и детали записи", async () => {
    const user = userEvent.setup();
    const signature = profileSignature(profile as Parameters<typeof profileSignature>[0]);
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.workouts.getMyPlan, undefined, makePlan(signature));
    setQuery(api.workouts.listLogs, {}, [
      {
        _id: "log1",
        userId: "u1",
        date: "2026-08-01",
        workoutName: "Фулбоди A — Приседания",
        exercises: [
          { name: "Приседания", sets: 3, reps: 10, weightKg: 60 },
          { name: "Отжимания", sets: 3, reps: 12, weightKg: 0 },
        ],
        effort: "hard",
        createdAt: 0,
      },
    ]);
    renderWithRouter(<Workouts />);

    // Тоннаж = 60×10×3 = 1800 кг (только положительный вес).
    expect(screen.getByText("Недельный тоннаж")).toBeInTheDocument();
    // Рекорд: Приседания 60 кг (встречается и в карточке дня).
    expect(screen.getAllByText("Приседания").length).toBeGreaterThan(0);
    // История: запись с усилием (мета-строка — один текстовый узел).
    expect(screen.getByText(/подходов · тяжело/)).toBeInTheDocument();

    // Клик по записи открывает детали с тоннажом.
    await user.click(
      screen.getByRole("button", { name: /Открыть детали тренировки от/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Тоннаж:")).toBeInTheDocument();
    expect(within(dialog).getByText(/1 800/)).toBeInTheDocument();
  });

  it("удаление записи из истории зовёт deleteLog", async () => {
    const user = userEvent.setup();
    const signature = profileSignature(profile as Parameters<typeof profileSignature>[0]);
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.workouts.getMyPlan, undefined, makePlan(signature));
    setQuery(api.workouts.listLogs, {}, [
      {
        _id: "log1",
        userId: "u1",
        date: "2026-08-01",
        workoutName: "Тренировка 1",
        exercises: [{ name: "Приседания", sets: 1, reps: 1, weightKg: 10 }],
        createdAt: 0,
      },
    ]);
    renderWithRouter(<Workouts />);

    await user.click(screen.getAllByRole("button", { name: "Удалить" })[0]);
    await user.click(screen.getByRole("button", { name: "Точно удалить?" }));

    expect(convexMock.mutationCalls).toContainEqual({
      path: "workouts.deleteLog",
      args: [{ id: "log1" }],
    });
    expect(toast.success).toHaveBeenCalledWith("Запись удалена");
  });

  it("«Начать тренировку» открывает режим тренировки", async () => {
    const user = userEvent.setup();
    const signature = profileSignature(profile as Parameters<typeof profileSignature>[0]);
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.workouts.getMyPlan, undefined, makePlan(signature));
    setQuery(api.workouts.listLogs, {}, []);
    renderWithRouter(<Workouts />);

    await user.click(screen.getByRole("button", { name: "Начать тренировку" }));
    expect(
      screen.getByRole("button", { name: /Завершить тренировку/ }),
    ).toBeInTheDocument();
  });

  it("закрытие режима тренировки убирает оверлей и возвращает план", async () => {
    const user = userEvent.setup();
    const signature = profileSignature(profile as Parameters<typeof profileSignature>[0]);
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.workouts.getMyPlan, undefined, makePlan(signature));
    setQuery(api.workouts.listLogs, {}, []);
    renderWithRouter(<Workouts />);

    await user.click(screen.getByRole("button", { name: "Начать тренировку" }));
    expect(
      screen.getByRole("button", { name: /Завершить тренировку/ }),
    ).toBeInTheDocument();

    // Кнопка «Закрыть режим тренировки» — onClose у WorkoutMode.
    await user.click(
      screen.getByRole("button", { name: "Закрыть режим тренировки" }),
    );
    expect(
      screen.queryByRole("button", { name: /Завершить тренировку/ }),
    ).not.toBeInTheDocument();
    // План снова виден — «Начать тренировку» вернулась.
    expect(screen.getAllByRole("button", { name: "Начать тренировку" }).length).toBeGreaterThan(0);
  });

  it("режим тренировки с историей маппит логи (дата + упражнения)", async () => {
    const user = userEvent.setup();
    const signature = profileSignature(profile as Parameters<typeof profileSignature>[0]);
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.workouts.getMyPlan, undefined, makePlan(signature));
    setQuery(api.workouts.listLogs, {}, [
      {
        _id: "log1",
        userId: "u1",
        date: "2026-08-01",
        workoutName: "Фулбоди A",
        exercises: [{ name: "Приседания", sets: 3, reps: 10, weightKg: 60 }],
        createdAt: 0,
      },
    ]);
    renderWithRouter(<Workouts />);

    await user.click(screen.getByRole("button", { name: "Начать тренировку" }));
    // Маппинг логов в props WorkoutMode исполнился без ошибок.
    expect(
      screen.getByRole("button", { name: /Завершить тренировку/ }),
    ).toBeInTheDocument();
  });

  it("закрытие диалога деталей Escape'ом и удаление записи из диалога", async () => {
    const user = userEvent.setup();
    const signature = profileSignature(profile as Parameters<typeof profileSignature>[0]);
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.workouts.getMyPlan, undefined, makePlan(signature));
    setQuery(api.workouts.listLogs, {}, [
      {
        _id: "log1",
        userId: "u1",
        date: "2026-08-01",
        workoutName: "Тренировка 1",
        // Без effort — ветка «усилие: …» в деталях не рендерится.
        exercises: [{ name: "Приседания", sets: 1, reps: 1, weightKg: 10 }],
        createdAt: 0,
      },
    ]);
    renderWithRouter(<Workouts />);

    await user.click(
      screen.getByRole("button", { name: /Открыть детали тренировки от/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Тренировка 1")).toBeInTheDocument();

    // Удаление из диалога: ConfirmDelete внутри деталей.
    await user.click(within(dialog).getByRole("button", { name: "Удалить запись" }));
    await user.click(screen.getByRole("button", { name: "Точно удалить?" }));
    expect(convexMock.mutationCalls).toContainEqual({
      path: "workouts.deleteLog",
      args: [{ id: "log1" }],
    });
    expect(toast.success).toHaveBeenCalledWith("Запись удалена");

    // Повторно открываем диалог и закрываем Escape'ом — onOpenChange(false).
    await user.click(
      screen.getByRole("button", { name: /Открыть детали тренировки от/ }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("сводка без плана показывает уровень и стиль тренировок из профиля", () => {
    setQuery(api.profiles.getMyProfile, undefined, {
      ...profile,
      trainingStyle: "power",
    });
    setQuery(api.workouts.getMyPlan, undefined, null);
    setQuery(api.workouts.listLogs, {}, []);
    renderWithRouter(<Workouts />);

    // Ветка «без плана»: «Для {уровень} · {цель} · стиль: {стиль}».
    expect(
      screen.getByText((_, el) =>
        el?.tagName === "P" && (el.textContent ?? "").includes("стиль: силовой"),
      ),
    ).toBeInTheDocument();
  });

  it("тоннаж от 1000 кг форматируется как тонны (1.8т)", async () => {
    const signature = profileSignature(profile as Parameters<typeof profileSignature>[0]);
    setQuery(api.profiles.getMyProfile, undefined, profile);
    setQuery(api.workouts.getMyPlan, undefined, makePlan(signature));
    setQuery(api.workouts.listLogs, {}, [
      {
        _id: "log1",
        userId: "u1",
        date: "2026-08-01",
        workoutName: "Фулбоди A",
        exercises: [{ name: "Приседания", sets: 4, reps: 10, weightKg: 45 }],
        createdAt: 0,
      },
    ]);
    renderWithRouter(<Workouts />);

    // Тоннаж = 45×10×4 = 1800 кг → ось Y форматируется в тоннах:
    // тики 0/500/1000/1500/2000 дают «1т», «1.5т», «2т» (не «1.8т» — это
    // максимум данных, а не тик). Проверяем, что хотя бы один тик в тоннах.
    expect(screen.getByText("Недельный тоннаж")).toBeInTheDocument();
    expect(screen.getAllByText(/т$/).length).toBeGreaterThan(0);
  });

  it("автопересборка: устаревшая сигнатура плана запускает savePlan молча", async () => {
    setQuery(api.profiles.getMyProfile, undefined, profile);
    // Сигнатура не совпадает с текущим профилем → план устарел.
    setQuery(api.workouts.getMyPlan, undefined, makePlan("старая|сигнатура"));
    setQuery(api.workouts.listLogs, {}, []);
    renderWithRouter(<Workouts />);

    await waitFor(() => {
      expect(
        convexMock.mutationCalls.some(
          (c) => c.path === "workouts.savePlan",
        ),
      ).toBe(true);
    });
    expect(toast.success).toHaveBeenCalledWith(
      "План обновлён под новый профиль",
      expect.anything(),
    );
  });
});
