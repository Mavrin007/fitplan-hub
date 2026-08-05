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
    logs?: { date: string; exercises: { name: string; weightKg: number }[] }[];
    saving?: boolean;
  } = {},
) {
  const onSave = vi.fn(async () => {});
  const onClose = vi.fn();
  render(
    <WorkoutMode
      day={DAY}
      planName="Силовой фулбоди"
      weekLabel="Неделя 2 · Прогресс"
      logs={overrides.logs ?? []}
      saving={overrides.saving ?? false}
      onClose={onClose}
      onSave={onSave}
    />,
  );
  return { onSave, onClose };
}

describe("WorkoutMode", () => {
  beforeEach(() => {
    vi.useRealTimers();
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
    expect(exercises).toEqual([
      { name: "Жим гантелей", sets: 3, reps: 8, weightKg: 20 },
      { name: "Подтягивания", sets: 3, reps: 5, weightKg: 0 },
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
});
