#!/usr/bin/env node
/**
 * Пост-деплой проверка «Войти через Telegram» в реальном браузере (headless
 * chromium): открывает /auth, ждёт заметную кнопку, кликает, ловит попап
 * oauth.telegram.org и убеждается, что Telegram отдал настоящую страницу
 * авторизации (а не «Bot domain invalid» — домен не добавлен в Login Widget
 * бота в @BotFather).
 *
 * Запуск: node scripts/telegram-login-check.mjs [URL]
 * По умолчанию проверяет прод https://fitplan-hub.vercel.app.
 */
import { chromium } from "playwright";

const TARGET = process.argv[2] ?? "https://fitplan-hub.vercel.app";
const AUTH_URL = `${TARGET}/auth`;

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`✘ ${msg}`);
};

try {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Ловим ошибки приложения/консоли на /auth — «добиваем» что сломается.
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push(`console.error: ${msg.text()}`);
  });

  console.log(`→ ${AUTH_URL}`);
  await page.goto(AUTH_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });

  const button = page.getByRole("button", { name: "Войти через Telegram" });
  try {
    await button.waitFor({ state: "visible", timeout: 20_000 });
    console.log("✔ кнопка «Войти через Telegram» видна на /auth");
  } catch {
    fail("кнопка «Войти через Telegram» не появилась на /auth");
    await page.screenshot({ path: "test-results/tg-login-no-button.png", fullPage: true });
    const text = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
    console.log(`  текст страницы: ${text}`);
    console.log(`  URL: ${page.url()}`);
    const loaded = await page.evaluate(() =>
      Array.from(document.querySelectorAll("script[src]")).map((s) => s.src),
    );
    console.log(`  загруженные скрипты: ${loaded.join(", ")}`);
    const hasTg = await page.evaluate(() => ({
      hasTelegram: typeof window.Telegram !== "undefined",
      htmlHasTgAuthResult: document.body.innerHTML.includes("tgAuthResult"),
      htmlHasBtn: document.body.innerHTML.includes("telegram-login-button"),
      htmlHasTgText: document.body.innerHTML.includes("Войти через Telegram"),
    }));
    console.log(`  DOM-маркеры: ${JSON.stringify(hasTg)}`);
    console.log(`  console/page errors: ${pageErrors.join(" | ").slice(0, 600) || "нет"}`);
    throw new Error("кнопка не найдена");
  }

  const popupPromise = page.waitForEvent("popup", { timeout: 10_000 });
  await button.click();
  const popup = await popupPromise;

  await popup.waitForLoadState("domcontentloaded", { timeout: 20_000 });

  const popupUrl = new URL(popup.url());
  const okHost = popupUrl.origin === "https://oauth.telegram.org";
  const okPath = popupUrl.pathname === "/auth";
  const okBotId = popupUrl.searchParams.get("bot_id") === "8659935112";
  const okOrigin = popupUrl.searchParams.get("origin") === TARGET;
  const okReturnTo = popupUrl.searchParams.get("return_to") === `${TARGET}/auth`;
  if (okHost && okPath && okBotId && okOrigin && okReturnTo) {
    console.log("✔ попап открыл oauth.telegram.org/auth с правильными параметрами");
  } else {
    fail(`попап: ${popupUrl} (host=${okHost} path=${okPath} bot_id=${okBotId} origin=${okOrigin} return_to=${okReturnTo})`);
  }

  // Самое важное: Telegram отдаёт настоящую страницу авторизации, а не
  // «Bot domain invalid» (домен не в Login Widget бота).
  const bodyText = await popup.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
  const title = await popup.title().catch(() => "");
  if (bodyText.includes("Bot domain invalid")) {
    fail(`Telegram отклоняет домен: «Bot domain invalid» (${TARGET})`);
  } else if (title.includes("Telegram Authorization") || /Telegram/i.test(bodyText)) {
    console.log(`✔ Telegram отдал страницу авторизации («${title}») — домен добавлен в Login Widget`);
    // Показываем, что страница живая: имя бота/кнопка подтверждения.
    const snippet = bodyText.replace(/\s+/g, " ").slice(0, 160);
    console.log(`  содержимое попапа: ${snippet}`);
  } else {
    fail(`неожиданное содержимое попапа: ${bodyText.slice(0, 120)}`);
  }

  await page.screenshot({ path: "test-results/tg-login-auth.png", fullPage: false });
  console.log("→ скриншот: test-results/tg-login-auth.png");

  if (pageErrors.length > 0) {
    fail(`ошибки на странице (${pageErrors.length}):`);
    pageErrors.slice(0, 5).forEach((e) => console.error(`  ${e.slice(0, 300)}`));
  } else {
    console.log("✔ ошибок консоли/приложения на /auth нет");
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nВход через Telegram: боевой флоу исправен ✅" : `\nНайдено проблем: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
