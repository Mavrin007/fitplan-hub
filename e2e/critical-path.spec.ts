import { expect, test } from "@playwright/test";
import { completeOnboarding, readDevOtp, submitOtp } from "./helpers";

/**
 * Критический путь продукта (полностью локальный стек, см. run.md):
 *
 *   гость → онбординг-визард (профиль) → генерация плана тренировок →
 *   привязка email через dev-OTP → выход → вход по email →
 *   профиль/план сохранились.
 *
 * Предусловия:
 *  - convex dev на :3210 (CONVEX_DEV_DEPLOYMENT=local, VLY_EMAIL_DEV_CAPTURE=1,
 *    ключи из .freebuff/keys) и vite dev на :5173 уже подняты
 *    (или Playwright поднимет их сам по playwright.config.ts).
 *  - Уникальный email на каждый прогон — код из devOtpCodes одноразовый.
 */

const EMAIL = `e2e-${Date.now()}@example.com`;

test("гость → профиль → план → email → данные сохранились", async ({ page }) => {
  // ---- Вход как гость ----
  await page.goto("/auth");
  await page.getByRole("button", { name: "Продолжить как гость" }).click();

  // Первый вход → онбординг-визард (профиля нет).
  await completeOnboarding(page);

  // Профиль сохранён → дашборд «Обзор» с пересчитанными целями.
  await expect(page.getByRole("heading", { name: "Сегодня" })).toBeVisible();
  await expect(page.getByText(/калории/i).first()).toBeVisible();

  // ---- Генерация плана тренировок ----
  await page.getByRole("link", { name: "Тренировки" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/workouts/);
  await page.getByRole("button", { name: /Сгенерировать план/ }).first().click();

  // План собран: появляется хотя бы один день/фокус тренировки.
  await expect(
    page.getByText(/День 1|Тренировка 1|Пн|Вт|Ср|Чт|Пт|Сб|Вс/).first(),
  ).toBeVisible({ timeout: 30_000 });

  // ---- Привязка email через dev-OTP (в профиле) ----
  await page.getByRole("link", { name: "Профиль" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/profile/);

  const attachEmail = page.getByLabel("Email", { exact: true }).first();
  await expect(attachEmail).toBeVisible();
  await attachEmail.fill(EMAIL);
  await page.getByRole("button", { name: /Отправить код/ }).click();

  // Dev-режим: код показывается прямо в форме — читаем и вводим.
  const code = await readDevOtp(page);
  await submitOtp(page, code, /Подтвердить/);

  // Привязка успешна → тост «Почта привязана».
  await expect(page.getByText(/Почта привязана/)).toBeVisible({ timeout: 20_000 });

  // ---- Выход: почта уже привязана, поэтому пользователь НЕ гость —
  // оверлей защиты не нужен; RequireAuth уводит на /auth. ----
  await page.getByRole("button", { name: "Выйти" }).first().click();
  await expect(page).toHaveURL(/\/auth/, { timeout: 15_000 });

  // ---- Вход по email с тем же адресом (поле без label — по placeholder) ----
  await page.getByPlaceholder("name@example.com").fill(EMAIL);

  // Серверный rate-limit: привязка уже отправляла код на этот адрес, поэтому
  // первая отправка может вернуть «Код уже отправлен. Повторите через N сек».
  // Кликаем «Продолжить» (exact — рядом есть «Продолжить как гость»), затем
  // ждём либо dev-код (окно уже открыто), либо блокировку — и в блокировке
  // ждём истечения 60-секундного окна, затем отправляем заново.
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  const rateLimited = page.getByText(/Код уже отправлен/);
  const code2 = await Promise.race([
    readDevOtp(page),
    rateLimited.textContent({ timeout: 15_000 }).then(() => "RATE_LIMITED"),
  ]);

  let finalCode = code2;
  if (code2 === "RATE_LIMITED") {
    await page.waitForTimeout(65_000);
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    finalCode = await readDevOtp(page);
  }
  await submitOtp(page, finalCode!, /Войти|Подтвердить/);

  // ---- Данные сохранились: профиль с антропометрией + план. ----
  // Выход был с /dashboard/profile, поэтому returnTo вернул на профиль —
  // данные видны сразу, это и есть проверка сохранения.
  await expect(page).toHaveURL(/\/dashboard\/profile/, { timeout: 20_000 });
  await expect(page.getByLabel("Возраст")).toHaveValue("32");
  await expect(page.getByLabel("Вес (кг)").first()).toHaveValue("85");

  // Дашборд «Обзор» тоже открывается с заполненным профилем.
  await page.getByRole("link", { name: "Обзор" }).first().click();
  await expect(page.getByRole("heading", { name: "Сегодня" })).toBeVisible();

  // План тоже на месте.
  await page.getByRole("link", { name: "Тренировки" }).first().click();
  await expect(
    page.getByText(/День 1|Тренировка 1|Пн|Вт|Ср|Чт|Пт|Сб|Вс/).first(),
  ).toBeVisible();
});
