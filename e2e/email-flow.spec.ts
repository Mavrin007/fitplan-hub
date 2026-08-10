import { expect, test } from "@playwright/test";
import { readDevOtp, submitOtp } from "./helpers";

/**
 * Фокусная проверка входа по email (см. run.md: полностью локальный стек,
 * dev-OTP коды показываются в форме — VLY_EMAIL_DEV_CAPTURE / devCaptureEnabled).
 *
 * Покрывает именно auth-флоу: email → OTP-шаг → dev-код → неверный код
 * (ошибка) → верный код → /dashboard → сессия переживает перезагрузку,
 * плюс вход гостем. Тяжёлый продукт-флоу (онбординг, план, привязка в
 * профиле, повторный вход с rate-limit) покрыт в critical-path.spec.ts.
 */

const EMAIL = `login-${Date.now()}@example.com`;

test("вход по email: неверный код → верный код → дашборд, сессия сохраняется", async ({
  page,
}) => {
  await page.goto("/auth");
  await expect(page.getByText("Вход в Кило")).toBeVisible();

  // Шаг 1: email → код.
  await page.getByPlaceholder("name@example.com").fill(EMAIL);
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();

  // Dev-режим: код показывается в форме (без реальной почты).
  const code = await readDevOtp(page);

  // Неверный код → понятная ошибка, поле очищается.
  await submitOtp(page, "000000", /Подтвердить/);
  await expect(
    page.getByText("Введённый код подтверждения неверен."),
  ).toBeVisible();
  await expect(
    page.locator("input[autocomplete='one-time-code']"),
  ).toHaveValue("");

  // Верный код → вход и редирект на дашборд.
  await submitOtp(page, code, /Подтвердить/);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  // Сессия переживает перезагрузку: RequireAuth не выбрасывает на /auth.
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
});

test("вход гостем → дашборд", async ({ page }) => {
  await page.goto("/auth");
  await page.getByRole("button", { name: "Продолжить как гость" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
});
