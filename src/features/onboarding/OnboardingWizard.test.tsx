import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));

import { convexMock } from "@/test/convex-react-mock";
import { resetMocks } from "@/test/utils";
import { shouldShowOnboarding } from "./onboarding";
import { OnboardingWizard } from "./OnboardingWizard";

/** Хелпер: проходим шаг «антропометрия» с валидными данными. */
async function fillBodyStep(user: ReturnType<typeof userEvent.setup>) {
  const age = screen.getByLabelText("Возраст");
  await user.clear(age);
  await user.type(age, "32");

  const height = screen.getByLabelText("Рост (см)");
  await user.clear(height);
  await user.type(height, "180");

  const weight = screen.getByLabelText("Вес (кг)");
  await user.clear(weight);
  await user.type(weight, "85");

  await user.click(screen.getByRole("button", { name: /Далее/ }));
}

describe("OnboardingWizard", () => {
  beforeEach(() => {
    resetMocks();
    localStorage.clear();
  });

  it("показывает 3 шага по порядку: антропометрия → цель → инвентарь", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={() => {}} onSkip={() => {}} />);

    expect(screen.getByRole("heading", { name: "Ваши данные" })).toBeInTheDocument();
    expect(screen.getByText("Шаг 1 из 3")).toBeInTheDocument();

    await fillBodyStep(user);
    expect(screen.getByRole("heading", { name: "Цель и опыт" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Далее/ }));
    expect(
      screen.getByRole("heading", { name: "Инвентарь и дни" }),
    ).toBeInTheDocument();
  });

  it("блокирует переход при невалидной антропометрии и показывает ошибку", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={() => {}} onSkip={() => {}} />);

    const age = screen.getByLabelText("Возраст");
    await user.clear(age);
    await user.type(age, "5"); // < 10

    await user.click(screen.getByRole("button", { name: /Далее/ }));
    expect(
      screen.getByText(/Проверьте возраст/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Цель и опыт" })).not.toBeInTheDocument();
  });

  it("сохраняет профиль при завершении и зовёт onComplete", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} onSkip={() => {}} />);

    await fillBodyStep(user);

    // Шаг 2: выбираем цель «Похудение», активность по умолчанию.
    await user.click(screen.getByRole("button", { name: /Похудение/ }));
    await user.click(screen.getByRole("button", { name: /Далее/ }));

    // Шаг 3: инвентарь по умолчанию bodyweight выбран; добавляем гантели
    // (точное имя — пресет «Гантели дома» тоже содержит слово «Гантели»).
    await user.click(screen.getByRole("button", { name: "Гантели" }));
    await user.click(screen.getByRole("button", { name: /Создать план/ }));

    const saved = convexMock.mutationCalls.find(
      (c) => c.path === "profiles.upsertProfile",
    );
    expect(saved).toBeDefined();
    const args = saved!.args[0] as Record<string, unknown>;
    expect(args.age).toBe(32);
    expect(args.heightCm).toBe(180);
    expect(args.weightKg).toBe(85);
    expect(args.fitnessGoal).toBe("lose_weight");
    expect(args.gender).toBe("male");
    expect(args.equipment).toEqual(expect.arrayContaining(["bodyweight", "dumbbell"]));
    expect(args.preferredTrainingDays).toBe(3);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("валидирует шаг инвентаря: без инвентаря не пускает дальше", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={() => {}} onSkip={() => {}} />);

    await fillBodyStep(user);
    await user.click(screen.getByRole("button", { name: /Далее/ }));

    // Снимаем все пресеты инвентаря: bodyweight выбран по умолчанию.
    const bodyweight = screen.getByRole("button", { name: /Собственный вес/ });
    await user.click(bodyweight);

    await user.click(screen.getByRole("button", { name: /Создать план/ }));
    expect(
      screen.getByText(/Выберите хотя бы один вариант инвентаря/),
    ).toBeInTheDocument();

    const saved = convexMock.mutationCalls.find(
      (c) => c.path === "profiles.upsertProfile",
    );
    expect(saved).toBeUndefined();
  });

  it("кнопка «Назад» возвращает на предыдущий шаг", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={() => {}} onSkip={() => {}} />);

    await fillBodyStep(user);
    expect(screen.getByRole("heading", { name: "Цель и опыт" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Назад/ }));
    expect(screen.getByRole("heading", { name: "Ваши данные" })).toBeInTheDocument();
  });

  it("«Пропустить» запоминает выбор в localStorage и зовёт onSkip", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    render(<OnboardingWizard onComplete={() => {}} onSkip={onSkip} />);

    await user.click(screen.getByRole("button", { name: "Пропустить" }));
    expect(localStorage.getItem("kilo:onboarding-skipped")).toBe("1");
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("показывает ошибку сохранения из ConvexError без падения", async () => {
    const user = userEvent.setup();
    convexMock.mutationImpls.set(
      "profiles.upsertProfile",
      async () => {
        // Как реальный ConvexError: причина в data.message.
        throw new Error("Не удалось сохранить профиль. Попробуйте ещё раз.");
      },
    );
    render(<OnboardingWizard onComplete={() => {}} onSkip={() => {}} />);

    await fillBodyStep(user);
    await user.click(screen.getByRole("button", { name: /Далее/ }));
    await user.click(screen.getByRole("button", { name: /Создать план/ }));

    expect(await screen.findByText(/Не удалось сохранить профиль/)).toBeInTheDocument();
  });
});

describe("shouldShowOnboarding", () => {
  const emptyStorage = (): Storage => {
    const store = new Map<string, string>();
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;
  };

  it("показывает визард, когда профиля нет и скип не ставился", () => {
    expect(shouldShowOnboarding(null, emptyStorage())).toBe(true);
  });

  it("не показывает, пока профиль ещё грузится (undefined)", () => {
    expect(shouldShowOnboarding(undefined, emptyStorage())).toBe(false);
  });

  it("не показывает, когда профиль существует", () => {
    expect(shouldShowOnboarding({ age: 30 }, emptyStorage())).toBe(false);
  });

  it("не показывает после скипа в этом браузере", () => {
    const storage = emptyStorage();
    storage.setItem("kilo:onboarding-skipped", "1");
    expect(shouldShowOnboarding(null, storage)).toBe(false);
  });
});
