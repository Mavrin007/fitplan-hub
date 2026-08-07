import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding } from "./helpers";

/**
 * Мобильная адаптивность: на узком viewport (375px, проект mobile-chromium)
 * все 5 страниц дашборда должны рендериться без горизонтального скролла —
 * это классический признак свёрстанных «на вырост» блоков (фиксированные
 * ширины, незаворачивающиеся строки, нерезиновые гриды).
 *
 * Одно замечание: до рефакторинга превью проверялось только на
 * десктоп+планшет; этот спец закрывает пробел честной проверкой мобильного.
 */

/** Прокрутить страницу вниз, чтобы «разбудить» отложенный контент (ленивые
 *  секции, тяжелые графики) — скролл измеряем после полного рендера. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 300));
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
}

/** Проверить отсутствие горизонтального скролла и сохранить ошибки по странице. */
async function assertNoHorizontalScroll(page: Page, pageName: string) {
  await settle(page);
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
        const w = el.getBoundingClientRect().width;
        return `${el.tagName}[${cls}] w=${Math.round(w)}`;
      }),
  }));
  expect(
    metrics.scrollWidth,
    `${pageName}: horizontal overflow ${metrics.scrollWidth}px > ${metrics.clientWidth}px; offenders: ${metrics.offenders.join(", ")}`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

test("мобильная версия: 5 страниц дашборда без горизонтального скролла", async ({
  page,
}) => {
  await page.goto("/auth");
  await page.getByRole("button", { name: "Продолжить как гость" }).click();

  // Онбординг-визард — тоже мобильный экран: проверяем его первым.
  await expect(page.getByRole("heading", { name: "Ваши данные" })).toBeVisible();
  await assertNoHorizontalScroll(page, "онбординг-визард (шаг 1)");
  await completeOnboarding(page);

  // Дождаться, пока профиль сохранится и визард закроется (иначе goto ниже
  // перезагрузит страницу в момент, когда upsertProfile ещё в полёте, и
  // профиль потеряется).
  await expect(page.getByRole("heading", { name: "Сегодня" })).toBeVisible({
    timeout: 20_000,
  });

  // Дашборд: 5 страниц. Заголовок страницы подтверждает, что контент реально
  // отрисован (а не пустой скелетон).
  const pages: { url: string; heading: string }[] = [
    { url: "/dashboard", heading: "Сегодня" },
    { url: "/dashboard/meals", heading: "Рацион за сегодня" },
    { url: "/dashboard/workouts", heading: "Тренировки" },
    { url: "/dashboard/progress", heading: "Тренды" },
    { url: "/dashboard/profile", heading: "Ваши цифры" },
  ];

  for (const p of pages) {
    await page.goto(p.url);
    await expect(page.getByRole("heading", { name: p.heading })).toBeVisible({
      timeout: 20_000,
    });
    await assertNoHorizontalScroll(page, p.url);
    // Скрыть верхнюю панель-навигацию на мобильном? Нет — она фиксированная,
    // скролл не влияет. Снимок для визуальной проверки отчёта.
    await page.screenshot({
      path: `test-results/mobile-${p.url.replace(/[^a-z]/g, "-")}.png`,
      fullPage: true,
    });
  }
});
