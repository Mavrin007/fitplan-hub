// Диагностика Telegram-бота: webhook info + тестовый апдейт /start
const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error("Usage: node tg-debug.mjs <token>");
  process.exit(1);
}
const API = `https://api.telegram.org/bot${TOKEN}`;

async function api(method, body, opts = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...opts,
  });
  const data = await res.json();
  return { status: res.status, data };
}

(async () => {
  // 1. getWebhookInfo
  const wh = await api("getWebhookInfo", {});
  console.log("== getWebhookInfo ==");
  console.log(JSON.stringify(wh.data.result ?? wh.data, null, 2));

  // 2. getMe
  const me = await api("getMe", {});
  console.log("\n== getMe ==");
  console.log(JSON.stringify(me.data.result ?? me.data, null, 2));

  // 3. getMyCommands
  const cmds = await api("getMyCommands", {});
  console.log("\n== getMyCommands ==");
  console.log(JSON.stringify(cmds.data.result ?? cmds.data, null, 2));

  // 4. Тестовый апдейт /start на вебхук (последний url из getWebhookInfo)
  const url = wh.data.result?.url;
  if (!url) {
    console.log("\n!! Вебхук не зарегистрирован");
    process.exit(0);
  }
  const chatId = Number(process.argv[3] || 0);
  const testUpdate = {
    update_id: Math.floor(Math.random() * 1e9),
    message: {
      message_id: 1,
      from: {
        id: chatId || 111111,
        is_bot: false,
        first_name: "Тест",
        username: "testuser",
        language_code: "ru",
      },
      chat: { id: chatId || 111111, first_name: "Тест", type: "private" },
      date: Math.floor(Date.now() / 1000),
      text: "/start",
    },
  };
  console.log(`\n== POST ${url} (имитация /start) ==`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(testUpdate),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}: ${text.slice(0, 500)}`);

  // 5. Есть ли pending update count после этого
  const info2 = await api("getWebhookInfo", {});
  console.log(
    `\n== pending_update_count после теста: ${info2.data.result?.pending_update_count ?? "?"} ==`,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
