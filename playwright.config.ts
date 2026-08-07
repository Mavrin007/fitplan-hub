import { defineConfig, devices } from "@playwright/test";

/**
 * E2E против полностью локального стека (как в run.md):
 *  - локальный Convex-бэкенд на :3210 (CONVEX_DEV_DEPLOYMENT=local),
 *  - Vite dev-сервер на :5173.
 *
 * reuseExistingServer: true — если dev-серверы уже запущены (обычный dev-флоу
 * из run.md), Playwright их переиспользует вместо нового запуска. Это
 * единственный способ протестировать email-флоу: dev-OTP коды хранятся на
 * бэкенде, и оба процесса должны быть подняты.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Мобильная адаптивность: узкий viewport (375px, iPhone-класс) — проверка,
    // что 5 страниц дашборда не имеют горизонтального скролла. Проект гоняет
    // только свой спец: остальные (критический путь, axe) рассчитаны на
    // десктоп и на мобильном лишь удваивают время прогона.
    {
      name: "mobile-chromium",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: [
    {
      command: "npx convex dev --typecheck disable",
      url: "http://127.0.0.1:3210",
      timeout: 180_000,
      reuseExistingServer: true,
      env: { CONVEX_DEV_DEPLOYMENT: "local" },
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npm run dev",
      url: "http://127.0.0.1:5173",
      timeout: 120_000,
      reuseExistingServer: true,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
