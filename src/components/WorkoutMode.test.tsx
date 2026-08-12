import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import { WorkoutMode } from "./WorkoutMode";
import type { WorkoutDay } from "@/lib/workoutLibrary";

/** Один день плана: два упражнения, у одного — стартовый вес, у другого — нет. */
const DAY: WorkoutDay = {
  day: 1,
  focus: "Верх тела",
  exercises: [
    { name: "Жим гантелей", sets: 3, reps: "8-12", restSeconds: 90, weightKg: 20 },
    { name: "Подтягивания", sets: 3, reps: "5-8", restSeconds: 60 },
  ],
  notes: ["Плечи: избегать болевых ощущений"],
};

/** Секция конкретного упражнения — для скоупа кнопок подходов. */
function exerciseSection(name: string): HTMLElement {
  const section = screen.getByText(name).closest("section");
  if (!section) throw new Error(`Секция ${name} не найдена`);
  return section as HTMLElement;
}

/** Отметить подходы упражнения через скоуп его секции. */
async function markSets(
  user: ReturnType<typeof userEvent.setup>,
  exerciseName: string,
  count: number,
) {
  const section = exerciseSection(exerciseName);
  for (let i = 1; i <= count; i++) {
    await user.click(
      within(section).getByRole("button", {
        name: `Подход ${i} — отметить выполненным`,
      }),
    );
  }
}

function renderMode(
  overrides: {
    logs?: {
      date: string;
      effort?: "easy" | "normal" | "hard";
      exercises: {
        name: string;
        weightKg: number;
        reps?: number;
        rpe?: number;
        sets?: number;
        setDetails?: { weightKg: number; reps: number; rpe?: number }[];
      }[];
    }[];
    saving?: boolean;
    equipment?: ("barbell" | "dumbbell" | "machine" | "cable" | "kettlebell" | "bodyweight")[];
  } = {},
) {
  const onSave = vi.fn(async () => true);
  const onClose = vi.fn();
  render(
    <WorkoutMode
      day={DAY}
      planName="Силовой фулбоди"
      weekLabel="Неделя 2 · Прогресс"
      logs={overrides.logs ?? []}
      saving={overrides.saving ?? false}
      equipment={overrides.equipment}
      onClose={onClose}
      onSave={onSave}
    />,
  );
  return { onSave, onClose };
}

describe("WorkoutMode", () => {
  beforeEach(() => {
    vi.useRealTimers();
    // Черновик сессии не должен протекать между тестами (localStorage —
    // черновик тренировки теперь живёт там, чтобы переживать закрытие вкладки).
    localStorage.clear();
  });

  it("показывает план, упражнения и заметки дня", () => {
    renderMode();

    expect(screen.getByText(/Силовой фулбоди · Неделя 2 · Прогресс/)).toBeInTheDocument();
    expect(screen.getByText("Жим гантелей")).toBeInTheDocument();
    expect(screen.getByText("Подтягивания")).toBeInTheDocument();
    expect(screen.getByText(/Плечи: избегать болевых ощущений/)).toBeInTheDocument();
    // 0 из 6 подходов, кнопка завершения недоступна.
    expect(screen.getByText("0 из 6 подходов")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Завершить тренировку/ })).toBeDisabled();
  });

  it("вес подставляется из последнего лога, иначе из плана", () => {
    renderMode({
      logs: [
        { date: "2026-07-20", exercises: [{ name: "Жим гантелей", weightKg: 22.5 }] },
      ],
    });

    // Из лога — 22.5; из плана — 20.
    expect(screen.getByLabelText("Вес для Жим гантелей")).toHaveValue("22.5");
    expect(screen.getByLabelText("Вес для Подтягивания")).toHaveValue("");
    // Подпись «прошлый раз: 22.5 кг» (число в отдельном span — текстматчер
    // собирает полный текст элемента).
    expect(
      screen.getByText((content, el) =>
        el?.textContent === "прошлый раз: 22.5 кг" &&
        content !== "",
      ),
    ).toBeInTheDocument();
  });

  it("«прошлый раз» показывает вес × повторы, если они есть в логе", () => {
    renderMode({
      logs: [
        {
          date: "2026-07-20",
          exercises: [{ name: "Жим гантелей", weightKg: 22.5, reps: 10 }],
        },
      ],
    });

    expect(
      screen.getByText((content, el) =>
        el?.textContent === "прошлый раз: 22.5 × 10" &&
        content !== "",
      ),
    ).toBeInTheDocument();
  });

  it("отметка подхода запускает таймер отдыха с role=timer", async () => {
    const user = userEvent.setup();
    renderMode();

    await markSets(user, "Жим гантелей", 1);
    // Доступность: таймер объявлен как timer и озвучивается скринридером.
    const timer = screen.getByRole("timer", { name: "Таймер отдыха" });
    expect(timer).toHaveTextContent("1:30");
    expect(timer).toHaveAttribute("aria-live", "polite");
  });

  it("отметка подходов ведёт прогресс и запускает таймер отдыха", async () => {
    const user = userEvent.setup();
    renderMode();

    // Первый подход жима → таймер отдыха 90с запускается.
    await markSets(user, "Жим гантелей", 1);
    expect(screen.getByText("Отдых")).toBeInTheDocument();
    expect(screen.getByText("1:30")).toBeInTheDocument();

    // Снятие подхода снова → подходов 0.
    await user.click(
      within(exerciseSection("Жим гантелей")).getByRole("button", {
        name: "Подход 1 — отметить как невыполненный",
      }),
    );
    expect(screen.getByText("0 из 6 подходов")).toBeInTheDocument();
  });

  it("таймер отсчитывает секунды и останавливается на нуле", async () => {
    const user = userEvent.setup();
    // День с коротким отдыхом (3 с), чтобы дождаться нуля на реальных таймерах.
    render(
      <WorkoutMode
        day={{ ...DAY, exercises: [{ name: "Жим гантелей", sets: 1, reps: "8-12", restSeconds: 3, weightKg: 20 }] }}
        planName="Силовой фулбоди"
        logs={[]}
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await markSets(user, "Жим гантелей", 1);
    expect(screen.getByText("0:03")).toBeInTheDocument();

    // Пауза останавливает отсчёт.
    await user.click(screen.getByRole("button", { name: /Пауза/ }));
    expect(screen.getByText("0:03")).toBeInTheDocument();

    // Продолжить — досчёт до нуля, панель отдыха скрывается.
    await user.click(screen.getByRole("button", { name: /Продолжить/ }));
    await waitFor(
      () => expect(screen.queryByText("Отдых")).not.toBeInTheDocument(),
      { timeout: 6000 },
    );
  });

  it("завершение: все подходы → запрос усилия → onSave с упражнениями", async () => {
    const user = userEvent.setup();
    const { onSave } = renderMode();

    // Отмечаем все 3 подхода жима и 3 подхода подтягиваний.
    await markSets(user, "Жим гантелей", 3);
    await markSets(user, "Подтягивания", 3);
    expect(screen.getByText("6 из 6 подходов")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Завершить тренировку/ }));

    // Оверлей оценки усилия.
    expect(screen.getByText("Насколько тяжело было?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Норм/ }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [exercises, effort] = onSave.mock.calls[0] as unknown as [
      unknown[],
      string,
    ];
    expect(effort).toBe("normal");
    // Каждый подход логируется отдельно (setDetails): вес × повторы из плана
    // (фолбэк без редактора), агрегаты берутся из последнего подхода.
    expect(exercises).toEqual([
      {
        name: "Жим гантелей",
        sets: 3,
        reps: 8,
        weightKg: 20,
        setDetails: [
          { weightKg: 20, reps: 8 },
          { weightKg: 20, reps: 8 },
          { weightKg: 20, reps: 8 },
        ],
      },
      {
        name: "Подтягивания",
        sets: 3,
        reps: 5,
        weightKg: 0,
        setDetails: [
          { weightKg: 0, reps: 5 },
          { weightKg: 0, reps: 5 },
          { weightKg: 0, reps: 5 },
        ],
      },
    ]);
  });

  it("завершение без отмеченных подходов невозможно", async () => {
    const user = userEvent.setup();
    const { onSave } = renderMode();

    await user.click(screen.getByRole("button", { name: /Завершить тренировку/ }));
    expect(screen.queryByText("Насколько тяжело было?")).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("кнопка закрытия вызывает onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = renderMode();

    await user.click(screen.getByRole("button", { name: "Закрыть режим тренировки" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("показывает рекомендацию KILO по прошлому логу (двойная прогрессия: повторы → вес)", async () => {
    renderMode({
      logs: [
        {
          date: "2026-07-20",
          effort: "easy",
          exercises: [
            { name: "Жим гантелей", weightKg: 20, reps: 10, rpe: 7 },
          ],
        },
      ],
    });

    // План: 3 × 8-12. 10 повторов — в середине диапазона: «сначала повторы» —
    // тот же вес 20 кг, цель 11–12 (вес 22.5 только на верхней планке 12).
    const rec = within(exerciseSection("Жим гантелей"));
    expect(rec.getByText(/Рекомендация KILO/)).toBeInTheDocument();
    expect(
      rec.getByText((content, el) =>
        el?.textContent === "20 кг × 11–12" && content !== "",
      ),
    ).toBeInTheDocument();
    expect(rec.getByText(/RPE 7/)).toBeInTheDocument();
    expect(rec.getByText(/добираем повторы/)).toBeInTheDocument();
    // Вес тот же — кнопки «Применить» нет.
    expect(
      rec.queryByRole("button", { name: /Применить/ }),
    ).not.toBeInTheDocument();
  });

  it("без данных прошлой тренировки рекомендация не показывается", () => {
    renderMode();
    expect(screen.queryByText("Рекомендация KILO")).not.toBeInTheDocument();
  });

  it("после сохранения показывает сводку, «Готово» закрывает режим", async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderMode();

    await markSets(user, "Жим гантелей", 3);
    await markSets(user, "Подтягивания", 3);
    await user.click(screen.getByRole("button", { name: /Завершить тренировку/ }));
    await user.click(screen.getByRole("button", { name: /Норм/ }));

    await waitFor(() =>
      expect(screen.getByText("Тренировка завершена")).toBeInTheDocument(),
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    // Объём: 20 кг × 8 × 3 = 480 кг (скоуп на карточку «Объём»).
    const volumeBox = screen.getByText("Объём").parentElement as HTMLElement;
    expect(within(volumeBox).getByText(/^480/)).toBeInTheDocument();
    // Без истории сравнений нет.
    expect(screen.queryByText(/к прошлой тренировке/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Готово" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ошибка сохранения: сводка не показывается, черновик не стирается, можно повторить", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => false);
    render(
      <WorkoutMode
        day={DAY}
        planName="Силовой фулбоди"
        weekLabel="Неделя 2 · Прогресс"
        logs={[]}
        saving={false}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await markSets(user, "Жим гантелей", 3);
    await user.click(screen.getByRole("button", { name: /Завершить тренировку/ }));
    await user.click(screen.getByRole("button", { name: /Норм/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    // Сохранение не удалось — сводки «завершено» нет, экран усилия на месте.
    expect(screen.queryByText("Тренировка завершена")).not.toBeInTheDocument();
    expect(screen.getByText("Насколько тяжело было?")).toBeInTheDocument();

    // Повторная попытка успешна — сводка появляется, черновик можно очищать.
    onSave.mockResolvedValue(true);
    await user.click(screen.getByRole("button", { name: /Норм/ }));
    await waitFor(() =>
      expect(screen.getByText("Тренировка завершена")).toBeInTheDocument(),
    );
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("показывает разминочные подходы для упражнения с весом", async () => {
    renderMode();

    // У жима (20 кг) разминка есть; у подтягиваний (собственный вес) — нет.
    expect(
      within(exerciseSection("Жим гантелей")).getByText("Разминка"),
    ).toBeInTheDocument();
    expect(
      within(exerciseSection("Подтягивания")).queryByText("Разминка"),
    ).not.toBeInTheDocument();
    // Первый разминочный подход: 0.4 × 20 = 8 кг, округление к 2.5 → 7.5.
    expect(
      within(exerciseSection("Жим гантелей")).getByText(/7\.5 кг × 8/),
    ).toBeInTheDocument();
  });

  it("редактор подхода: вес × повторы × RPE пишутся в лог по подходам", async () => {
    const user = userEvent.setup();
    const { onSave } = renderMode();

    // Отмечаем первый подход — открывается редактор «Подход 1».
    await markSets(user, "Жим гантелей", 1);
    const section = exerciseSection("Жим гантелей");
    const repsInput = within(section).getByLabelText(
      "Повторы подхода 1 для Жим гантелей",
    );
    expect(repsInput).toHaveValue("8"); // фолбэк из плана «8-12»
    await user.clear(repsInput);
    await user.type(repsInput, "10");
    await user.click(
      within(section).getByRole("button", { name: "RPE 7 для подхода 1" }),
    );

    // Остальные подходы жима (первый уже отмечен) — по умолчанию.
    await user.click(
      within(section).getByRole("button", { name: "Подход 2 — отметить выполненным" }),
    );
    await user.click(
      within(section).getByRole("button", { name: "Подход 3 — отметить выполненным" }),
    );
    await markSets(user, "Подтягивания", 3);
    await user.click(screen.getByRole("button", { name: /Завершить тренировку/ }));
    await user.click(screen.getByRole("button", { name: /Норм/ }));

    const [exercises] = onSave.mock.calls[0] as unknown as [unknown[]];
    expect(exercises).toEqual([
      {
        name: "Жим гантелей",
        sets: 3,
        reps: 8,
        weightKg: 20,
        setDetails: [
          { weightKg: 20, reps: 10, rpe: 7 },
          { weightKg: 20, reps: 8 },
          { weightKg: 20, reps: 8 },
        ],
      },
      expect.objectContaining({
        name: "Подтягивания",
        setDetails: expect.any(Array),
      }),
    ]);
  });

  it("черновик: введённые подходы восстанавливаются после закрытия режима", async () => {
    const user = userEvent.setup();
    const props = {
      day: DAY,
      planName: "Силовой фулбоди",
      logs: [] as never[],
      saving: false,
      onClose: vi.fn(),
      onSave: vi.fn(async () => true),
    };
    const { unmount } = render(<WorkoutMode {...props} />);
    await markSets(user, "Жим гантелей", 2);
    const section = exerciseSection("Жим гантелей");
    const repsInput = within(section).getByLabelText(
      "Повторы подхода 2 для Жим гантелей",
    );
    await user.clear(repsInput);
    await user.type(repsInput, "12");

    // Закрыли режим, не сохранив тренировку.
    unmount();

    // Повторный запуск того же дня — прогресс и вводы на месте.
    render(<WorkoutMode {...props} />);
    expect(screen.getByText("2 из 6 подходов")).toBeInTheDocument();
    const section2 = exerciseSection("Жим гантелей");
    expect(
      within(section2).getByLabelText("Повторы подхода 2 для Жим гантелей"),
    ).toHaveValue("12");
  });

  it("«прошлый раз» показывает полную прошлую сессию (подходы)", () => {
    renderMode({
      logs: [
        {
          date: "2026-07-20",
          exercises: [
            {
              name: "Жим гантелей",
              weightKg: 22.5,
              reps: 10,
              sets: 3,
              setDetails: [
                { weightKg: 22.5, reps: 10, rpe: 7 },
                { weightKg: 22.5, reps: 10, rpe: 8 },
                { weightKg: 20, reps: 9, rpe: 9 },
              ],
            },
          ],
        },
      ],
    });

    expect(
      screen.getByText((content, el) =>
        el?.textContent ===
          "прошлый раз: 22.5 × 10 @7 · 22.5 × 10 @8 · 20 × 9 @9" &&
        content !== "",
      ),
    ).toBeInTheDocument();
  });

  it("«прошлый раз» показывает RPE, когда он есть в логе", () => {
    renderMode({
      logs: [
        {
          date: "2026-07-20",
          exercises: [{ name: "Жим гантелей", weightKg: 22.5, reps: 10, rpe: 7 }],
        },
      ],
    });

    expect(
      screen.getByText((content, el) =>
        el?.textContent === "прошлый раз: 22.5 × 10 @7" &&
        content !== "",
      ),
    ).toBeInTheDocument();
  });

  it("«Готово» закрывает редактор подхода (вес → повторы → Done)", async () => {
    const user = userEvent.setup();
    renderMode();

    await markSets(user, "Жим гантелей", 1);
    const section = exerciseSection("Жим гантелей");
    // Редактор открыт: подпись «Подход 1» видна.
    expect(within(section).getByText("Подход 1")).toBeInTheDocument();

    await user.click(
      within(section).getByRole("button", { name: "Закрыть редактор подхода" }),
    );
    expect(within(section).queryByText("Подход 1")).not.toBeInTheDocument();
  });

  it("замена упражнения: альтернативы по инвентарю, состояние сбрасывается", async () => {
    const user = userEvent.setup();
    renderMode({ equipment: ["dumbbell", "bodyweight"] });

    // «Жим гантелей» в карте замен нет — кнопки нет; у «Подтягиваний» есть.
    expect(
      screen.queryByRole("button", { name: "Заменить Жим гантелей" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Заменить Подтягивания" }),
    );

    const section = exerciseSection("Подтягивания");
    // Тяга гантели (гантели) доступна; тяга верхнего блока (тренажёр/блок) —
    // отфильтрована по инвентарю пользователя.
    expect(
      within(section).getByRole("button", { name: "Тяга гантели в наклоне" }),
    ).toBeInTheDocument();
    expect(
      within(section).queryByRole("button", { name: "Тяга верхнего блока" }),
    ).not.toBeInTheDocument();

    await user.click(
      within(section).getByRole("button", { name: "Тяга гантели в наклоне" }),
    );
    // Упражнение заменено: старого нет, новое на его месте.
    expect(screen.queryByText("Подтягивания")).not.toBeInTheDocument();
    expect(screen.getByText("Тяга гантели в наклоне")).toBeInTheDocument();
  });

  it("−/+ у веса шагают к реально доступному весу снаряда", async () => {
    const user = userEvent.setup();
    renderMode();

    // «Жим гантелей»: стартовый вес из плана 20 кг, следующий доступный — 22.5.
    await user.click(
      screen.getByRole("button", { name: "Следующий вес для Жим гантелей" }),
    );
    expect(screen.getByLabelText("Вес для Жим гантелей")).toHaveValue("22.5");

    // «−» возвращает к предыдущему доступному весу: 22.5 → 20.
    await user.click(
      screen.getByRole("button", { name: "Предыдущий вес для Жим гантелей" }),
    );
    expect(screen.getByLabelText("Вес для Жим гантелей")).toHaveValue("20");

    // Собственный вес (подтягивания) — кнопок −/+ нет: вес тела не меняется.
    expect(
      screen.queryByRole("button", { name: /для Подтягивания/ }),
    ).not.toBeInTheDocument();
  });
});
