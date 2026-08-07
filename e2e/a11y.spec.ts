import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { completeOnboarding } from "./helpers";

/**
 * Сквозной axe-прогон по ключевым экранам: доступность (контраст, aria,
 * структура заголовков) проверяется реальным движком axe, а не глазами.
 *
 * Проходит под гостевой сессией: /auth → гость → онбординг → 5 страниц
 * дашборда — в ОБЕИХ темах (светлой и тёмной), потому что контрастные
 * цвета в тёмной теме задаются отдельными токенами (dark:...). Ожидаем
 * 0 критических/серьёзных нарушений (критерий WCAG A/AA) в каждой теме.
 */

const DASHBOARD_PAGES: { url: string; heading: string }[] = [
  { url: "/dashboard", heading: "Сегодня" },
  { url: "/dashboard/meals", heading: "Рацион за сегодня" },
  { url: "/dashboard/workouts", heading: "Тренировки" },
  { url: "/dashboard/progress", heading: "Тренды" },
  { url: "/dashboard/profile", heading: "Ваши цифры" },
];

/** Нарушения с impact critical/serious — их отсутствие и есть критерий. */
async function seriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((v) =>
    ["critical", "serious"].includes(v.impact ?? ""),
  );
}

/** Краткое описание нарушений: id (impact) + первые селекторы. */
function describeViolations(violations: Awaited<ReturnType<typeof seriousViolations>>) {
  return (
    violations
      .map((v) => {
        const targets = v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(" | ");
        return `${v.id} (${v.impact}): ${targets}`;
      })
      .join(" || ") || "нет нарушений"
  );
}

test("axe: /auth не имеет критических нарушений (светлая и тёмная темы)", async ({
  page,
}) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/auth");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(
      describeViolations(await seriousViolations(page)),
      `/auth, тема ${colorScheme}`,
    ).toBe("нет нарушений");
  }
});

test("axe: 5 страниц дашборда без критических нарушений (светлая и тёмная темы)", async ({
  page,
}) => {
  // Гостевая сессия + онбординг — один раз, потом сканируем обе темы.
  await page.goto("/auth");
  await page.getByRole("button", { name: "Продолжить как гость" }).click();
  await completeOnboarding(page);
  await expect(page.getByRole("heading", { name: "Сегодня" })).toBeVisible();

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const p of DASHBOARD_PAGES) {
      await page.goto(p.url);
      await expect(page.getByRole("heading", { name: p.heading })).toBeVisible({
        timeout: 20_000,
      });
      expect(
        describeViolations(await seriousViolations(page)),
        `${p.url}, тема ${colorScheme}`,
      ).toBe("нет нарушений");
    }
  }
});
