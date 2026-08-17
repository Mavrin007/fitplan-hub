// Полная проверка /start: секрет из Convex prod + вебхук + тестовый апдейт.
import fs from "fs";
import { execFileSync } from "child_process";
import os from "os";
import path from "path";

const main = async () => {

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error("Usage: node tg-full-test.mjs <bot-token>");
  process.exit(1);
}

// 1. Прочитать prod-ключ Convex из ~/.vly-convex/prod.key
const keyFile = path.join(os.homedir(), ".vly-convex", "prod.key");
let prodKey = "";
try {
  prodKey = fs.readFileSync(keyFile, "utf8").trim();
  console.log("Prod-ключ найден:", prodKey.split("|")[0].slice(0, 40) + "…");
} catch (e) {
  console.error("Нет prod-ключа:", e.message);
  process.exit(1);
}

// 2. env list → TELEGRAM_WEBHOOK_SECRET
let secret = "";
try {
  const out = execFileSync(
    "npx",
    ["convex", "env", "list"],
    { encoding: "utf8", timeout: 60000, env: { ...process.env, CONVEX_DEPLOY_KEY: prodKey } },
  );
  const lines = out.split(/\r?\n/);
  const row = lines.find((l) => l.startsWith("TELEGRAM_WEBHOOK_SECRET="));
  secret = row ? row.slice("TELEGRAM_WEBHOOK_SECRET=".length) : "";
  console.log("TELEGRAM_WEBHOOK_SECRET найден:", secret ? `${secret.slice(0, 8)}…` : "НЕТ!");
} catch (e) {
  console.error("env list не удался:", String(e).slice(0, 300));
  process.exit(1);
}

// 3. Тестовый апдейт /start с заголовком секрета
const testUpdate = {
  update_id: Math.floor(Math.random() * 1e9),
  message: {
    message_id: 1,
    from: {
      id: 111111,
      is_bot: false,
      first_name: "Тест",
      username: "testuser",
      language_code: "ru",
    },
    chat: { id: 111111, first_name: "Тест", type: "private" },
    date: Math.floor(Date.now() / 1000),
    text: "/start",
  },
};
const url = "https://energetic-coyote-927.convex.site/telegram-webhook";
console.log(`\n== POST ${url} (с секретом) ==`);
const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Telegram-Bot-Api-Secret-Token": secret,
  },
  body: JSON.stringify(testUpdate),
});
console.log(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
console.log("\n(Ожидается 200 — бот попытается ответить в чат 111111 и получит 'chat not found' внутри, но вебхук обработает апдейт.)");
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
