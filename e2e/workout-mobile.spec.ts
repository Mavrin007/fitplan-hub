import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding } from "./helpers";

/**
 * Мобильный QA Workout Player на узких ширинах (проект mobile-chromium
 * гоняет этот спец; внутри дополнительно перебираем 320/375/390/430 px).
 *
 * Цепочка из плана: Today → Тренировки → «Начать тренировку» → подходы →
 * таймер/RPE → выход обратно. Проверяем «глазами теста» то, что важно на
 * телефоне в зале:
 *  - нет горизонтального скролла в полноэкранном режиме;
 *  - кнопки подходов — честные touch-цели ≥ 44×44 px;
 *  - после подхода счётчик обновляется и появляются RPE-чипы.
 *
 * Состояние: свежий гость → онбординг (профиль) → «Сгенерировать план» на
 * странице тренировок (онбординг план не создаёт — только профиль).
 */

const WIDTHS = [320, 375, 390, 430];
const HEIGHT = 800;

/** Нет горизонтального переполнения ни у одного элемента (включая оверлей). */
async function assertNoHorizontalOverflow(page: Page, label: string) {
  await page.waitForTimeout(200);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    offenders: Array.from(document.querySelectorAll("*"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.right > document.documentElement.clientWidth + 1;
      })
      .slice(0, 8)
      .map((el) => {
        const cls =
          typeof el.className === "string"
            ? el.className.split(/\s+/).slice(0, 3).join(".")
            : el.tagName;
        return `${el.tagName}[${cls}] w=${Math.round(el.getBoundingClientRect().width)}`;
      }),
  }));
  expect(
    metrics.scrollWidth,
    `${label}: overflow ${metrics.scrollWidth}px > ${metrics.clientWidth}px; offenders: ${metrics.offenders.join(", ")}`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

test("мобильный Workout Player: 320–430px без overflow, touch-цели ≥ 44px, подходы/RPE", async ({
  page,
}) => {
  await page.goto("/auth");
  await page.getByRole("button", { name: "Продолжить как гость" }).click();

  // Профиль → дашборд (онбординг план не создаёт).
  await completeOnboarding(page);
  await expect(page.getByRole("heading", { name: "Сегодня" })).toBeVisible({
    timeout: 20_000,
  });

  // Страница тренировок → генерируем план (как критический путь).
  await page.getByRole("link", { name: "Тренировки" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/workouts/);
  await page.getByRole("button", { name: /Сгенерировать план/ }).first().click();

  const start = page.getByRole("button", { name: /Начать тренировку/ }).first();
  await expect(start).toBeVisible({ timeout: 30_000 });

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT });

    // Полноэкранный режим тренировки.
    await start.click();
    const close = page.getByRole("button", {
      name: "Закрыть режим тренировки",
    });
    await expect(close).toBeVisible();

    // 1) Нет горизонтального переполнения (классический «свёрстан на вырост»).
    await assertNoHorizontalOverflow(page, `workout @ ${width}px`);

    // 2) Кнопка подхода — touch-цель ≥ 44×44 px (мокрые руки, перчатки).
    const set1 = page.getByRole("button", { name: /Подход 1/ }).first();
    await expect(set1).toBeVisible();
    const box = await set1.boundingBox();
    expect(box, `set-кнопка @ ${width}px`).not.toBeNull();
    expect(box!.width, `ширина set-кнопки @ ${width}px`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `высота set-кнопки @ ${width}px`).toBeGreaterThanOrEqual(44);

    // 3) Отмечаем подход → счётчик в шапке обновился.
    await set1.click();
    await expect(page.getByText(/1 из \d+ подходов/)).toBeVisible();

    // 4) После первого подхода появляются RPE-чипы (управление нагрузкой).
    await expect(page.getByRole("button", { name: "RPE 7" })).toBeVisible();
    await expect(page.getByRole("button", { name: "RPE 10" })).toBeVisible();

    // Таймер отдыха запускается не у всех упражнений (у кардио restSeconds=0),
    // поэтому жёстко не ассертим — счётчик и RPE уже доказывают интерактивность.

    // Закрываем режим и возвращаемся на страницу (состояние сбрасывается).
    await close.click();
    await expect(close).not.toBeVisible();
  }
});
