import { expect, type Page } from "@playwright/test";

/**
 * Общие шаги e2e-флоу, используемые несколькими спецами (critical-path,
 * a11y, mobile). Единый источник правды: если онбординг поменяется,
 * править нужно одно место, а не три копии.
 */

/** Пройти онбординг-визард (профиль ещё не создан → 3 шага). */
export async function completeOnboarding(page: Page) {
  await expect(page.getByRole("heading", { name: "Ваши данные" })).toBeVisible();

  // Шаг 1: антропометрия.
  await page.getByLabel("Возраст").fill("32");
  await page.getByLabel("Рост (см)").fill("180");
  await page.getByLabel("Вес (кг)").fill("85");
  await page.getByRole("button", { name: /Далее/ }).click();

  // Шаг 2: цель + опыт.
  await expect(page.getByRole("heading", { name: "Цель и опыт" })).toBeVisible();
  await page.getByRole("button", { name: /Далее/ }).click();

  // Шаг 3: инвентарь и дни.
  await expect(page.getByRole("heading", { name: "Инвентарь и дни" })).toBeVisible();
  // exact — пресеты «Штанга + гантели» / «Гантели дома» тоже содержат слово.
  await page.getByRole("button", { name: "Гантели", exact: true }).click();
  await page.getByRole("button", { name: /Создать план/ }).click();
}

/** Прочитать dev-OTP код из формы (показывается в dev-режиме). */
export async function readDevOtp(page: Page): Promise<string> {
  const code = await page
    .locator("p.font-mono")
    .filter({ hasText: /^\d{6}$/ })
    .first()
    .textContent({ timeout: 20_000 });
  expect(code).toMatch(/^\d{6}$/);
  return code!;
}

/** Ввести код в InputOTP (один textbox с autocomplete=one-time-code) и подтвердить. */
export async function submitOtp(page: Page, code: string, submitName: RegExp) {
  // InputOTP прячет единственный input c autocomplete="one-time-code" —
  // уточняем, чтобы не зацепить остальные поля формы (профиль).
  const input = page.locator("input[autocomplete='one-time-code']");
  await expect(input).toBeVisible();
  await input.fill(code);
  await page.getByRole("button", { name: submitName }).click();
}
