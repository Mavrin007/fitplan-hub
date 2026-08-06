import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Мок convex-слоя: useQuery(api.devOtp.getByEmail) адресуется через мок api.
vi.mock("convex/react", () => import("@/test/convex-react-mock"));
vi.mock("@/convex/_generated/api", () => import("@/test/convex-react-mock"));
// useAuth тянет useConvexAuth/useAuthActions из реальных провайдеров — подменяем
// целиком контролируемым объектом (signIn-мок живёт в vi.hoisted, чтобы фабрика
// vi.mock могла его захватить без TDZ-ограничений).
const { authMocks } = vi.hoisted(() => ({
  authMocks: {
    signIn: vi.fn(),
    signOut: vi.fn(),
  },
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: false,
    user: null,
    signIn: authMocks.signIn,
    signOut: authMocks.signOut,
  }),
}));

import { resetConvexMock, setQuery, api } from "@/test/convex-react-mock";
import { renderWithRouter } from "@/test/utils";
import { MemoryRouter, Route, Routes } from "react-router";
import { render } from "@testing-library/react";
import Auth from "./Auth";

/** Один провайдер, но разные этапы: форма email (FormData без code) должна
 *  резолвиться, форма OTP (FormData с code) — отклоняться. Повторная отправка
 *  (объект { email }) — резолвится. Так проверяем, что неверный код не ломает
 *  форму, а именно падает на верификации. */
function setupSignIn() {
  authMocks.signIn.mockImplementation(
    async (_provider: string, form?: FormData | { email: string }) => {
      if (!(form instanceof FormData)) return; // повторная отправка — успех
      const code = form.get("code");
      if (code) {
        throw new Error("Could not verify code");
      }
    },
  );
}

async function gotoOtpStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByPlaceholderText("name@example.com"),
    "test@example.com",
  );
  await user.click(screen.getByRole("button", { name: "Продолжить" }));
  // Ожидаем перехода на шаг ввода кода (useState → перерисовка).
  await screen.findByRole("heading", { name: "Проверьте почту" });
}

// Cooldown повторной отправки в тестах: 1 секунда — достаточно, чтобы
// проверить disabled-состояние и дождаться разблокировки без фейковых
// таймеров (под ними React-апдейты после await не коммитятся).
function renderAuth() {
  return renderWithRouter(<Auth resendCooldownSec={1} />);
}

// Роутер с маршрутами: успешный вход navigate("/dashboard") реально переключает
// экран (в renderWithRouter без Routes форма осталась бы на месте).
function renderAuthRouted() {
  render(
    <MemoryRouter initialEntries={["/auth"]}>
      <Routes>
        <Route path="/auth" element={<Auth resendCooldownSec={1} />} />
        <Route path="/dashboard" element={<div>Dashboard stub</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Auth", () => {
  beforeEach(() => {
    resetConvexMock();
    authMocks.signIn.mockClear();
    authMocks.signOut.mockClear();
    setupSignIn();
  });

  it("неверный OTP показывает ошибку и не ломает форму", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Auth />);
    await gotoOtpStep(user);

    // Вводим заведомо неверный код и подтверждаем.
    await user.type(screen.getByRole("textbox"), "111111");
    await user.click(screen.getByRole("button", { name: /Подтвердить код/ }));

    // Ошибка показана, шаг OTP не меняется, поле очищено.
    expect(
      await screen.findByText("Введённый код подтверждения неверен."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Проверьте почту" }),
    ).toBeInTheDocument();
    // Кнопка снова заблокирована (otp сброшен), форма жива — можно вводить заново.
    expect(
      screen.getByRole("button", { name: /Подтвердить код/ }),
    ).toBeDisabled();

    // Повторный ввод кода снова активирует кнопку — форма не «умерла».
    await user.type(screen.getByRole("textbox"), "222222");
    expect(
      screen.getByRole("button", { name: /Подтвердить код/ }),
    ).toBeEnabled();
  });

  it("rate-limit при отправке кода: signIn отклонён, ошибка показана на шаге email", async () => {
    const user = userEvent.setup();
    // Первый вызов signIn (email-шаг) — отклонение с обёрткой Convex-клиента.
    authMocks.signIn.mockImplementation(async () => {
      throw new Error(
        "[CONVEX A(auth:signIn)] [Request ID: x] Server Error\n" +
          "Uncaught Error: Код уже отправлен. Повторите через 45 сек.\n" +
          "\n  Called by client",
      );
    });
    renderAuth();

    await user.type(
      screen.getByPlaceholderText("name@example.com"),
      "test@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    // Только человекочитаемый текст, без [CONVEX …]/Uncaught Error.
    expect(
      await screen.findByText("Код уже отправлен. Повторите через 45 сек."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Uncaught Error/)).not.toBeInTheDocument();
    // Остаёмся на шаге email — OTP-шаг не открылся.
    expect(
      screen.getByRole("heading", { name: "Вход в Кило" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Проверьте почту" }),
    ).not.toBeInTheDocument();
    // Форма жива: loading снят, можно попробовать снова.
    expect(
      screen.getByRole("button", { name: "Продолжить" }),
    ).toBeEnabled();
    expect(authMocks.signIn).toHaveBeenCalledTimes(1);
  });

  it("исчерпан лимит попыток: прокси-проверка показывает «Подождите час» и не зовёт signIn", async () => {
    const user = userEvent.setup();
    // Прокси лимита попыток ввода: запас исчерпан (attemptsLeft < 1), до
    // следующей попытки — час. Библиотека в этом случае вернула бы generic
    // «Could not verify code» — мы должны показать понятное сообщение.
    setQuery(
      api.otpRateLimit.canAttempt,
      { email: "test@example.com" },
      { allowed: false, retryAfterSec: 3600, attemptsLeft: 0 },
    );
    renderAuth();
    await gotoOtpStep(user);

    await user.type(screen.getByRole("textbox"), "123456");
    await user.click(screen.getByRole("button", { name: /Подтвердить код/ }));

    expect(
      await screen.findByText("Слишком много попыток. Подождите час"),
    ).toBeInTheDocument();
    // Попытка ввода НЕ отправлялась: signIn вызван только один раз (шаг email).
    expect(authMocks.signIn).toHaveBeenCalledTimes(1);
    // Остаёмся на OTP-шаге, generic-ошибка про неверный код не показана.
    expect(
      screen.getByRole("heading", { name: "Проверьте почту" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Введённый код подтверждения неверен."),
    ).not.toBeInTheDocument();
  });

  it("блокировка с частичным ожиданием показывает минуты", async () => {
    const user = userEvent.setup();
    // 720 сек = 12 минут до следующей попытки (1 попытка в 12 мин при 5/час).
    setQuery(
      api.otpRateLimit.canAttempt,
      { email: "test@example.com" },
      { allowed: false, retryAfterSec: 720, attemptsLeft: 0 },
    );
    renderAuth();
    await gotoOtpStep(user);

    await user.type(screen.getByRole("textbox"), "123456");
    await user.click(screen.getByRole("button", { name: /Подтвердить код/ }));

    expect(
      await screen.findByText("Слишком много попыток. Подождите 12 мин"),
    ).toBeInTheDocument();
    expect(authMocks.signIn).toHaveBeenCalledTimes(1);
  });

  it("отправка кода зовёт signIn с FormData кода, ошибка не роняет сессию", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Auth />);
    await gotoOtpStep(user);

    await user.type(screen.getByRole("textbox"), "123456");
    await user.click(screen.getByRole("button", { name: /Подтвердить код/ }));

    // Второй вызов signIn — с FormData, содержащим введённый код.
    await screen.findByText("Введённый код подтверждения неверен.");
    expect(authMocks.signIn).toHaveBeenCalledTimes(2);
    const secondCall = authMocks.signIn.mock.calls[1][1] as FormData;
    expect(secondCall).toBeInstanceOf(FormData);
    expect(secondCall.get("code")).toBe("123456");
    expect(secondCall.get("email")).toBe("test@example.com");
  });

  it("после отправки кода кнопка показывает «Повторить через 60 с» и отключена (серверный интервал)", async () => {
    const user = userEvent.setup();
    // Без пропа resendCooldownSec — дефолтный серверный интервал 60 с.
    renderWithRouter(<Auth />);
    await gotoOtpStep(user);

    // Сразу после отправки кода — автосчётчик от серверного интервала,
    // кнопка деактивирована до истечения 60 с.
    expect(
      screen.getByRole("button", { name: "Повторить через 60 с" }),
    ).toBeDisabled();
  });

  it("«Отправить ещё раз»: таймер блокирует кнопку, затем повторно зовёт signIn", async () => {
    const user = userEvent.setup();
    renderAuth();
    await gotoOtpStep(user);

    // Сразу после отправки кода кнопка в cooldown: отсчёт + disabled.
    const inCooldown = screen.getByRole("button", { name: /Повторить через/ });
    expect(inCooldown).toBeDisabled();

    // Cooldown (1 с) истекает — кнопка снова активна. Таймаут 3s: тик
    // cooldown'а стреляет на ~1000ms и гоняет дефолтный таймаут findByRole.
    const resend = await screen.findByRole(
      "button",
      { name: "Отправить ещё раз" },
      { timeout: 3000 },
    );
    expect(resend).toBeEnabled();

    await user.click(resend);

    // Повторный signIn с тем же email (новый код) — но шаг не меняется.
    expect(authMocks.signIn).toHaveBeenCalledTimes(2);
    const secondCall = authMocks.signIn.mock.calls[1][1] as { email: string };
    expect(secondCall).toEqual({ email: "test@example.com" });
    expect(
      screen.getByRole("heading", { name: "Проверьте почту" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Введённый код подтверждения неверен."),
    ).not.toBeInTheDocument();
  });

  it("rate-limit при повторной отправке показывает читаемое сообщение", async () => {
    const user = userEvent.setup();
    // Первый вызов (email-шаг, FormData) — успех; повторная отправка
    // (объект { email }, как в handleResendCode) — отклонение с обёрткой.
    authMocks.signIn.mockImplementation(
      async (_provider: string, form?: FormData | { email: string }) => {
        if (form instanceof FormData) return;
        throw new Error(
          "[CONVEX A(auth:signIn)] [Request ID: x] Server Error\n" +
            "Uncaught Error: Код уже отправлен. Повторите через 45 сек.\n" +
            "\n  Called by client",
        );
      },
    );
    renderAuth();
    await gotoOtpStep(user);

    // Дожидаемся разблокировки после стартового cooldown (1 с) и нажимаем.
    const resend = await screen.findByRole(
      "button",
      { name: "Отправить ещё раз" },
      { timeout: 3000 },
    );
    await user.click(resend);

    // Только человекочитаемый текст, без префикса [CONVEX …]/Uncaught Error.
    expect(
      await screen.findByText("Код уже отправлен. Повторите через 45 сек."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Uncaught Error/)).not.toBeInTheDocument();
    // Остаёмся на OTP-шаге; кнопка уходит в cooldown по серверному интервалу.
    expect(
      screen.getByRole("heading", { name: "Проверьте почту" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Повторить через \d+ с/ }),
    ).toBeDisabled();
  });

  it("заблокированный ресенд (canSend=false) НЕ зовёт signIn и не трогает старый код", async () => {
    const user = userEvent.setup();
    // Пред-проверка: серверное окно ещё закрыто (запись есть, с тех пор < 60с).
    // canSend отвечает «ранее», поэтому повторная отправка должна остановиться
    // на пред-проверке — signIn вызывается только один раз (первый email-шаг),
    // а старый код из dev-блока остаётся на экране.
    setQuery(
      api.otpRateLimit.canSend,
      { email: "test@example.com" },
      { allowed: false, retryAfterSec: 29 },
    );
    renderAuth();
    await gotoOtpStep(user);

    const resend = await screen.findByRole(
      "button",
      { name: "Отправить ещё раз" },
      { timeout: 3000 },
    );
    await user.click(resend);

    // Сообщение rate-limit показано, signIn НЕ вызывался повторно (только 1-й).
    expect(
      await screen.findByText("Код уже отправлен. Повторите через 29 сек."),
    ).toBeInTheDocument();
    expect(authMocks.signIn).toHaveBeenCalledTimes(1);
    // Остаёмся на OTP-шаге; кнопка в cooldown на серверный интервал.
    expect(
      screen.getByRole("heading", { name: "Проверьте почту" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Повторить через \d+ с/ }),
    ).toBeDisabled();
  });

  it("разрешённый ресенд (canSend=true) идёт через signIn как раньше", async () => {
    const user = userEvent.setup();
    setQuery(
      api.otpRateLimit.canSend,
      { email: "test@example.com" },
      { allowed: true, retryAfterSec: 0 },
    );
    renderAuth();
    await gotoOtpStep(user);

    const resend = await screen.findByRole(
      "button",
      { name: "Отправить ещё раз" },
      { timeout: 3000 },
    );
    await user.click(resend);

    // Повторный signIn с тем же email (новый код) — шаг не меняется.
    expect(authMocks.signIn).toHaveBeenCalledTimes(2);
    const secondCall = authMocks.signIn.mock.calls[1][1] as { email: string };
    expect(secondCall).toEqual({ email: "test@example.com" });
    expect(
      screen.getByRole("heading", { name: "Проверьте почту" }),
    ).toBeInTheDocument();
  });

  it("«Попробовать снова»: возврат на шаг email и повторная отправка с новым адресом очищают ошибку", async () => {
    const user = userEvent.setup();
    renderAuth();
    await gotoOtpStep(user); // первый signIn — test@example.com

    // Показываем ошибку на OTP-шаге (неверный код).
    await user.type(screen.getByRole("textbox"), "111111");
    await user.click(screen.getByRole("button", { name: /Подтвердить код/ }));
    expect(
      await screen.findByText("Введённый код подтверждения неверен."),
    ).toBeInTheDocument();

    // Возврат на шаг email: ошибка и ввод кода сброшены.
    await user.click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(
      await screen.findByRole("heading", { name: "Вход в Кило" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Введённый код подтверждения неверен."),
    ).not.toBeInTheDocument();

    // Повторная отправка на НОВЫЙ email — второй signIn с новым адресом.
    await user.type(
      screen.getByPlaceholderText("name@example.com"),
      "new@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Продолжить" }));

    // OTP-шаг для нового адреса, ошибки нет.
    expect(
      await screen.findByRole("heading", { name: "Проверьте почту" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Мы отправили код на new@example.com."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Введённый код подтверждения неверен."),
    ).not.toBeInTheDocument();
    // Три signIn: первый (email), второй (неверный код), третий (новый email).
    expect(authMocks.signIn).toHaveBeenCalledTimes(3);
    const firstCall = authMocks.signIn.mock.calls[0][1] as FormData;
    const failedCall = authMocks.signIn.mock.calls[1][1] as FormData;
    const retryCall = authMocks.signIn.mock.calls[2][1] as FormData;
    expect(firstCall.get("email")).toBe("test@example.com");
    expect(failedCall.get("code")).toBe("111111");
    expect(retryCall.get("email")).toBe("new@example.com");
  });

  it("успешный код уводит на /dashboard и не показывает ошибку", async () => {
    const user = userEvent.setup();
    // Успех на этапе верификации (code есть, но не бросаем).
    authMocks.signIn.mockImplementation(async () => {});
    renderAuthRouted();
    await gotoOtpStep(user);

    await user.type(screen.getByRole("textbox"), "123456");
    await user.click(screen.getByRole("button", { name: /Подтвердить код/ }));

    // Успех → navigate("/dashboard") — вместо формы появляется заглушка.
    expect(await screen.findByText("Dashboard stub")).toBeInTheDocument();
    expect(
      screen.queryByText("Введённый код подтверждения неверен."),
    ).not.toBeInTheDocument();
    expect(authMocks.signIn).toHaveBeenCalledTimes(2);
  });

  it("повторная отправка: старый код отклоняется, новый принимается", async () => {
    const user = userEvent.setup();
    // Сервер-мок с памятью кодов: каждая отправка (email-шаг и повторная)
    // выдаёт НОВЫЙ код, а верификация принимает только последний выданный —
    // как одноразовый OTP в реальном бэкенде (код удаляется после ввода).
    const issuedCodes: string[] = [];
    let serial = 0;
    const issue = () => String(++serial).padStart(6, "0");
    authMocks.signIn.mockImplementation(
      async (_provider: string, form?: FormData | { email: string }) => {
        if (!(form instanceof FormData)) {
          issuedCodes.push(issue()); // повторная отправка → новый код
          return;
        }
        const code = form.get("code");
        if (!code) {
          issuedCodes.push(issue()); // первая отправка (email-шаг) → код
          return;
        }
        if (code !== issuedCodes[issuedCodes.length - 1]) {
          throw new Error("Could not verify code");
        }
      },
    );
    renderAuthRouted();
    await gotoOtpStep(user); // выдан первый код (issuedCodes[0])

    // Повторная отправка — выдан новый код (issuedCodes[1]).
    const resend = await screen.findByRole(
      "button",
      { name: "Отправить ещё раз" },
      { timeout: 3000 },
    );
    await user.click(resend);
    expect(authMocks.signIn).toHaveBeenCalledTimes(2);
    expect(issuedCodes).toHaveLength(2);

    // Старый код (от первой отправки) отклоняется, остаёмся на OTP-шаге.
    await user.type(screen.getByRole("textbox"), issuedCodes[0]);
    await user.click(screen.getByRole("button", { name: /Подтвердить код/ }));
    expect(
      await screen.findByText("Введённый код подтверждения неверен."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Проверьте почту" }),
    ).toBeInTheDocument();
    // Поле очищено после ошибки — кнопка снова заблокирована, форма жива.
    expect(
      screen.getByRole("button", { name: /Подтвердить код/ }),
    ).toBeDisabled();
    const rejectedCall = authMocks.signIn.mock.calls[2][1] as FormData;
    expect(rejectedCall.get("code")).toBe(issuedCodes[0]);

    // Новый код (от повторной отправки) принимается → /dashboard.
    await user.type(screen.getByRole("textbox"), issuedCodes[1]);
    await user.click(screen.getByRole("button", { name: /Подтвердить код/ }));
    expect(await screen.findByText("Dashboard stub")).toBeInTheDocument();
    expect(authMocks.signIn).toHaveBeenCalledTimes(4);
    const acceptedCall = authMocks.signIn.mock.calls[3][1] as FormData;
    expect(acceptedCall.get("code")).toBe(issuedCodes[1]);
    expect(
      screen.queryByText("Введённый код подтверждения неверен."),
    ).not.toBeInTheDocument();
  });
});
