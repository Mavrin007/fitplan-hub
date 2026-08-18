import { expect, test, chromium } from "@playwright/test";
import { completeOnboarding } from "./helpers";

/**
 * Reduced-motion проверка в реальном браузере: запускаем headless Chromium
 * с флагом `--force-prefers-reduced-motion`, который заставляет движок
 * считать системную настройку «уменьшить движение» включённой. Это
 * единственный способ проверить media-запрос `@media
 * (prefers-reduced-motion: reduce)` и `MotionConfig reducedMotion="user"`
 * сквозным образом, а не только через unit-стаб matchMedia.
 *
 * Утверждения:
 *  1. CSS-декоративные анимации (aurora/float/shine/pulse) не запускаются —
 *     computed `animation-name: none`.
 *  2. Motion-карточки не «скользят»: после рендера нет бегущих
 *     transform-анимаций (framer-motion при reducedMotion="user" прыгает
 *     сразу в финальное состояние).
 *  3. Плавный скролл выключен (`scroll-behavior: auto`), а страницы
 *     рендерятся без ошибок консоли.
 *
 * Дополняет изолированные unit-тесты `*.reduced-motion.test.tsx` (jsdom,
 * стаб matchMedia): там проверяется первый кадр, здесь — реальный движок.
 */

test("reduced-motion: CSS-анимации и motion-карточки отключены, скролл мгновенный", async () => {
  // Свой браузер — фикстура `browser` запущена без reduced-motion.
  // Флаг --force-prefers-reduced-motion добавляем на всякий случай (он
  // работает в headed-режиме), но в headless Chromium он игнорируется,
  // поэтому ВАЖНАЯ часть — CDP-эмуляция через reducedMotion: "reduce"
  // в контексте: она гарантированно включает prefers-reduced-motion
  // до загрузки любой страницы.
  const browser = await chromium.launch({
    args: ["--force-prefers-reduced-motion"],
  });
  const page = await browser.newPage({ reducedMotion: "reduce" });
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  // 1. Лендинг: декоративные CSS-анимации выключены.
  await page.goto("/");
  await page.waitForSelector(".animate-aurora, .animate-float, .animate-shine", {
    timeout: 10_000,
  });
  const cssAnimations = await page.evaluate(() => {
    const deco = document.querySelector(
      ".animate-aurora, .animate-float, .animate-shine",
    );
    return deco ? getComputedStyle(deco).animationName : "none";
  });
  expect(cssAnimations).toBe("none");

  // 2. Плавный скролл отключён.
  const scrollBehavior = await page.evaluate(
    () => getComputedStyle(document.documentElement).scrollBehavior,
  );
  expect(scrollBehavior).toBe("auto");

  // 3. Дашборд: гость → онбординг → карточки без бегущих transform-анимаций.
  await page.goto("/auth");
  await page.getByRole("button", { name: "Продолжить как гость" }).click();
  await completeOnboarding(page);
  await expect(page.getByRole("heading", { name: "Сегодня" })).toBeVisible({
    timeout: 20_000,
  });

  // Дождаться, пока framer-motion «устаканится». При reducedMotion="user"
  // framer гасит transform/layout-анимации (карточки не «скользят»), но
  // opacity-фейды остаются намеренно — поэтому проверяем именно transform:
  // ни одна бегущая анимация не должна менять геометрию элемента.
  await page.waitForTimeout(600);

  const runningTransform = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === "running")
      .filter((a) => {
        const kf = a.effect?.getKeyframes?.() ?? [];
        return kf.some((f) => "transform" in f || "translate" in f);
      })
      .map((a) => {
        const node = a.effect?.getComputedTiming();
        return `${node?.duration ?? 0}ms`;
      }),
  );
  expect(
    runningTransform,
    `бегущие transform-анимации: ${runningTransform.join(", ")}`,
  ).toEqual([]);

  // 4. Ни одной ошибки консоли за весь флоу.
  expect(consoleErrors).toEqual([]);

  await browser.close();
});
