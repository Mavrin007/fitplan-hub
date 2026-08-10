import { defineConfig, devices } from "@playwright/test";

/**
 * E2E с двумя режимами бэкенда (переключатель E2E_CONVEX):
 *
 *  - "cloud" (по умолчанию) — локальный Convex НЕ требуется: Playwright
 *    поднимает только vite dev-сервер на :5173, а приложение ходит в бэкенд
 *    из .env.local (VITE_CONVEX_URL). В dev-песочнице Freebuff это облачный
 *    dev-деплой, у которого CONVEX_SITE_URL заканчивается на convex.site —
 *    поэтому dev-OTP коды показываются в форме (devOtp.devCaptureEnabled)
 *    и email-флоу работает без локального бэкенда. Это и есть fallback для
 *    окружений, где локальный Convex не настроен.
 *
 *  - "local" (E2E_CONVEX=local) — классический полностью локальный стек:
 *    Playwright поднимает `npx convex dev` и ждёт бэкенд на :3210, а vite
 *    получает VITE_CONVEX_URL=http://127.0.0.1:3210 (перекрывает .env.local).
 *    Требует проекта, настроенного на локальный деплой
 *    (`npx convex dev --configure --dev-deployment local`).
 *
 * reuseExistingServer: true в обоих режимах — если серверы уже запущены,
 * Playwright их переиспользует. Это единственный способ протестировать
 * email-флоу: dev-OTP коды хранятся на бэкенде, к которому подключён фронтенд.
 */
const E2E_CONVEX: "local" | "cloud" =
  process.env.E2E_CONVEX === "local" ? "local" : "cloud";

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
    // Локальный Convex поднимается только в режиме "local" (опт-ин через
    // E2E_CONVEX=local). В "cloud" этого webServer нет: иначе Playwright
    // вечно ждал бы :3210 там, где локальный бэкенд не настроен.
    ...(E2E_CONVEX === "local"
      ? [
          {
            command: "npx convex dev --typecheck disable",
            url: "http://127.0.0.1:3210",
            timeout: 180_000,
            reuseExistingServer: true,
            // CONVEX_DEV_DEPLOYMENT=local понимали старые версии CLI; на
            // актуальных режим задаётся конфигурацией проекта
            // (`convex dev --configure --dev-deployment local`). Безвредно.
            env: { CONVEX_DEV_DEPLOYMENT: "local" },
            stdout: "pipe",
            stderr: "pipe",
          },
        ]
      : []),
    {
      command: "npm run dev",
      url: "http://127.0.0.1:5173",
      timeout: 120_000,
      reuseExistingServer: true,
      // В локальном режиме vite обязан смотреть в локальный бэкенд, а не в
      // .env.local (там может лежать облачный URL). Vite не перетирает уже
      // заданные process.env — env из webServer имеет приоритет.
      ...(E2E_CONVEX === "local"
        ? { env: { VITE_CONVEX_URL: "http://127.0.0.1:3210" } }
        : {}),
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
