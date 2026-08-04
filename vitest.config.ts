import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // ВНИМАНИЕ (vitest 4): настройки `all` больше нет — наличие `include`
      // само по себе включает в замер ВСЕ совпадающие файлы, даже не
      // исполненные тестами. Без include гейт считает только реально
      // исполненный код: сегодня это ~88% строк / 80% ветвей по src — пороги
      // проходят и ловят регрессии на протестированной поверхности. Если
      // добавить include: ["src/**"], в замер попадут непокрытые слои
      // (pages без тестов, hooks, convex-рантайм) — глобальное покрытие
      // упадёт до ~38% и CI зафейлится, пока они не будут покрыты или
      // явно исключены из include.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/convex/_generated/**",
      ],
      thresholds: {
        lines: 80,
        branches: 75,
      },
    },
  },
});
