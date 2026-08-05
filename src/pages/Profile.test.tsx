import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { todayKey } from "@/lib/dates";

// Мок convex-слоя: useQuery(api.profiles.getMyProfile) и остальные адресуются
// через стабильные ссылки (см. convex-react-mock).
vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
vi.mock("sonner", () => import("@/test/sonner-mock"));

// useAuth подменяем целиком: user — гость без почты (email: null), чтобы
// блок привязки рендерился; signIn/signOut — контролируемые моки.
const { authMocks, guestUser } = vi.hoisted(() => ({
  authMocks: {
    signIn: vi.fn(),
    signOut: vi.fn(),
  },
  guestUser: { id: "u1", email: null as string | null, name: "Гость" },
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: guestUser,
    signIn: authMocks.signIn,
    signOut: authMocks.signOut,
  }),
}));

import { api, convexMock, setMutation, setQuery } from "@/test/convex-react-mock";
import { resetMocks, renderWithRouter, toast } from "@/test/utils";
import { profile, type WeightEntry } from "@/test/fixtures";
import Profile from "./Profile";

/** Записи веса: три замера, чтобы график и список записей отрисовались. */
function weightEntries(): WeightEntry[] {
  return [
    { _id: "w1", userId: "u1", createdAt: 0, date: "2026-07-01", weightKg: 82 },
    { _id: "w2", userId: "u1", createdAt: 0, date: "2026-07-08", weightKg: 81 },
    { _id: "w3", userId: "u1", createdAt: 0, date: "2026-07-15", weightKg: 80 },
  ];
}

/** Профиль + журнал веса, чтобы страница отрисовала полный дашборд. */
function setupFilled(overrides: { profile?: typeof profile | null; weights?: WeightEntry[] } = {}) {
  setQuery(api.profiles.getMyProfile, undefined, overrides.profile ?? profile);
  setQuery(api.weightEntries.listMyWeights, {}, overrides.weights ?? weightEntries());
}

/** Секция привязки почты (гость без email) — скоуп для OTP-инпута. */
function attachSection(): HTMLElement {
  const section = screen
    .getByText("Привяжите почту, чтобы сохранить данные")
    .closest("section");
  if (!section) throw new Error("Секция привязки почты не найдена");
  return section as HTMLElement;
}

/** Привязка почты: отправка email (FormData без code) → шаг OTP. */
async function gotoAttachOtpStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByPlaceholderText("name@example.com"),
    "test@example.com",
  );
  await user.click(screen.getByRole("button", { name: "Отправить код" }));
  await screen.findByText(/Мы отправили код на/);
}

/** Ввод кода в единственный textbox OTP внутри секции привязки. */
async function typeAttachOtp(
  user: ReturnType<typeof userEvent.setup>,
  code: string,
) {
  await user.type(within(attachSection()).getByRole("textbox"), code);
}

describe("Profile", () => {
  beforeEach(() => {
    resetMocks();
    authMocks.signIn.mockClear();
    authMocks.signOut.mockClear();
    // По умолчанию: верификация OTP (FormData с code) успешна, если код 123456.
    authMocks.signIn.mockImplementation(
      async (_provider: string, form?: FormData | { email: string }) => {
        if (form instanceof FormData && form.get("code")) {
          if (form.get("code") !== "123456") throw new Error("Could not verify code");
        }
      },
    );
  });

  it("показывает скелетон, пока профиль не загрузился", () => {
    renderWithRouter(<Profile />);
    // Профиль ещё не пришёл — заголовка и формы нет, только скелетон.
    expect(screen.queryByText("Ваши цифры")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Сохранить профиль" })).not.toBeInTheDocument();
  });

  it("гидратирует форму значениями из загруженного профиля", () => {
    setQuery(api.profiles.getMyProfile, undefined, {
      ...profile,
      age: 45,
      weightKg: 90,
      targetWeightKg: 85,
    });
    setQuery(api.weightEntries.listMyWeights, {}, []);
    renderWithRouter(<Profile />);

    expect(screen.getByLabelText("Возраст")).toHaveValue("45");
    expect(screen.getByLabelText("Вес (кг)")).toHaveValue("90");
    expect(screen.getByLabelText("Целевой вес (кг)")).toHaveValue("85");
    // Из данных профиля: BMR и TDEE пересчитаны (45 лет, 90 кг) — BMR
    // встречается и в шапке целей, и в разборе калорий.
    expect(screen.getAllByText(/BMR/).length).toBeGreaterThan(0);
  });

  it("гость без почты видит блок привязки и переходит на шаг OTP", async () => {
    const user = userEvent.setup();
    setupFilled();
    renderWithRouter(<Profile />);

    expect(
      screen.getByText("Привяжите почту, чтобы сохранить данные"),
    ).toBeInTheDocument();

    await gotoAttachOtpStep(user);

    expect(authMocks.signIn).toHaveBeenCalledTimes(1);
    const call = authMocks.signIn.mock.calls[0][1] as FormData;
    expect(call).toBeInstanceOf(FormData);
    expect(call.get("email")).toBe("test@example.com");
    expect(
      screen.getByText(/test@example.com/),
    ).toBeInTheDocument();
  });

  it("привязка почты: верный код → toast и возврат к email-шагу", async () => {
    const user = userEvent.setup();
    setupFilled();
    renderWithRouter(<Profile />);

    await gotoAttachOtpStep(user);

    // Ввод кода в InputOTP (единственный textbox в секции привязки).
    await typeAttachOtp(user, "123456");
    await user.click(screen.getByRole("button", { name: "Подтвердить" }));

    expect(authMocks.signIn).toHaveBeenCalledTimes(2);
    const call = authMocks.signIn.mock.calls[1][1] as FormData;
    expect(call.get("email")).toBe("test@example.com");
    expect(call.get("code")).toBe("123456");
    expect(toast.success).toHaveBeenCalledWith(
      "Почта привязана — данные привязаны к вашему аккаунту",
    );
    // Вернулись к email-шагу (форма ввода email снова видна).
    expect(
      screen.getByPlaceholderText("name@example.com"),
    ).toBeInTheDocument();
  });

  it("привязка почты: неверный код → понятная ошибка, сессия не ломается", async () => {
    const user = userEvent.setup();
    setupFilled();
    renderWithRouter(<Profile />);

    await gotoAttachOtpStep(user);

    await typeAttachOtp(user, "000000");
    await user.click(screen.getByRole("button", { name: "Подтвердить" }));

    expect(
      await screen.findByText("Введённый код подтверждения неверен."),
    ).toBeInTheDocument();
    // Остаёмся на OTP-шаге, поле очищено (кнопка снова disabled), форма жива.
    expect(
      screen.getByRole("button", { name: "Подтвердить" }),
    ).toBeDisabled();
  });

  it("валидация: возраст меньше 10 → локальная ошибка, мутация не вызывается", async () => {
    const user = userEvent.setup();
    setupFilled();
    renderWithRouter(<Profile />);

    const age = screen.getByLabelText("Возраст");
    await user.clear(age);
    await user.type(age, "5");
    await user.click(screen.getByRole("button", { name: "Сохранить профиль" }));

    expect(
      screen.getByText("Возраст: укажите число от 10 до 120 лет."),
    ).toBeInTheDocument();
    expect(convexMock.mutationCalls).toHaveLength(0);
  });

  it("валидация: нечитаемый вес → ошибка без вызова мутации", async () => {
    const user = userEvent.setup();
    setupFilled();
    renderWithRouter(<Profile />);

    const weight = screen.getByLabelText("Вес (кг)");
    await user.clear(weight);
    await user.type(weight, "abc");
    await user.click(screen.getByRole("button", { name: "Сохранить профиль" }));

    expect(
      screen.getByText("Вес: укажите число от 20 до 500 кг."),
    ).toBeInTheDocument();
    expect(convexMock.mutationCalls).toHaveLength(0);
  });

  it("валидация: невалидный целевой вес → ошибка", async () => {
    const user = userEvent.setup();
    setupFilled();
    renderWithRouter(<Profile />);

    const target = screen.getByLabelText("Целевой вес (кг)");
    await user.clear(target);
    await user.type(target, "0");
    await user.click(screen.getByRole("button", { name: "Сохранить профиль" }));

    expect(
      screen.getByText("Целевой вес: укажите число, например 72,5."),
    ).toBeInTheDocument();
    expect(convexMock.mutationCalls).toHaveLength(0);
  });

  it("сохранение профиля: upsertProfile с аргументами формы + toast", async () => {
    const user = userEvent.setup();
    setupFilled();
    renderWithRouter(<Profile />);

    // Правки: вес 78 (запятая как разделитель), цель — набор массы.
    const weight = screen.getByLabelText("Вес (кг)");
    await user.clear(weight);
    await user.type(weight, "78,5");
    await user.click(screen.getByRole("button", { name: "Сохранить профиль" }));

    expect(convexMock.mutationCalls).toContainEqual(
      expect.objectContaining({
        path: "profiles.upsertProfile",
        args: [
          expect.objectContaining({
            age: 30,
            gender: "male",
            heightCm: 180,
            weightKg: 78.5,
            targetWeightKg: 75,
            activityLevel: "moderate",
            fitnessGoal: "lose_weight",
            experienceLevel: "intermediate",
            equipment: [],
            limitations: [],
            preferredTrainingDays: 3,
            trainingStyle: "balanced",
          }),
        ],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Профиль сохранён");
  });

  it("ошибка сервера при сохранении → читаемый toast", async () => {
    const user = userEvent.setup();
    setupFilled();
    setMutation(api.profiles.upsertProfile, () =>
      Promise.reject(
        new Error(
          "[CONVEX A(profiles:upsertProfile)] [Request ID: x] Server Error\n" +
            "Uncaught Error: Возраст: укажите число от 10 до 120 лет.\n",
        ),
      ),
    );
    renderWithRouter(<Profile />);

    await user.click(screen.getByRole("button", { name: "Сохранить профиль" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Возраст: укажите число от 10 до 120 лет.",
    );
  });

  it("запись веса: валидный ввод → addWeight, невалидный → toast без вызова", async () => {
    const user = userEvent.setup();
    setupFilled();
    renderWithRouter(<Profile />);

    const input = screen.getByLabelText("Вес сегодня (кг)");
    await user.type(input, "74,5");
    await user.click(screen.getByRole("button", { name: "Записать" }));

    expect(convexMock.mutationCalls).toContainEqual({
      path: "weightEntries.addWeight",
      args: [{ date: todayKey(), weightKg: 74.5 }],
    });
    expect(toast.success).toHaveBeenCalledWith("Вес записан");

    // Невалидный ввод: 0 — toast-ошибка (mock не рендерит тосты в DOM),
    // мутация не вызывается.
    convexMock.mutationCalls = [];
    await user.clear(input);
    await user.type(input, "0");
    await user.click(screen.getByRole("button", { name: "Записать" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Вес: укажите число от 0 до 400 кг, например 74,5.",
    );
    expect(convexMock.mutationCalls).toHaveLength(0);
  });

  it("удаление записи веса вызывает deleteWeight с id записи", async () => {
    const user = userEvent.setup();
    setupFilled();
    renderWithRouter(<Profile />);

    // Список последних записей: три замера из фикстуры.
    await user.click(screen.getAllByRole("button", { name: "Удалить запись" })[0]);

    expect(convexMock.mutationCalls).toContainEqual({
      path: "weightEntries.deleteWeight",
      args: [{ id: "w1" }],
    });
  });

  it("с целевым весом показывает разницу до цели", async () => {
    setupFilled();
    renderWithRouter(<Profile />);

    // Профиль: 80 кг, цель 75 кг → «осталось сбросить 5.0 кг».
    expect(screen.getByText(/осталось сбросить 5\.0 кг/)).toBeInTheDocument();
  });

  it("менее двух замеров → заглушка вместо графика", () => {
    setupFilled({
      weights: [weightEntries()[0]],
    });
    renderWithRouter(<Profile />);

    expect(
      screen.getByText("Запишите минимум два замера веса — кривая появится здесь."),
    ).toBeInTheDocument();
  });
});
