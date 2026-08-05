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
    // Тесты с 1-сек cooldown-таймерами (OTP) и Radix-диалогами на полном
    // параллельном прогоне не укладываются в дефолтные 5 с — изолированно
    // они проходят за 1–2 с. Запас на гонки параллельных воркеров.
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Честная полная выборка: замеряем весь src/, включая модули, которые
      // тесты не исполняют (иначе непокрытые слои невидимы для гейта).
      include: ["src/**"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/convex/_generated/**",
        // Не-JS файлы внутри src: JSON (tsconfig конвекса), иконки/ассеты —
        // rollup их не парсит, но include: ["src/**"] их цепляет и роняет
        // провайдер coverage.
        "src/**/*.json",
        "src/assets/**",
        "src/**/*.d.ts",
      ],
      thresholds: {
        lines: 80,
        branches: 75,
      },
    },
  },
});
