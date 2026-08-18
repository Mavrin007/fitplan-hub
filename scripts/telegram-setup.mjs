#!/usr/bin/env node
/**
 * Разовый setup Telegram-интеграции КИЛО (бот + Mini App).
 *
 * Делает три вещи через Bot API (токен не печатается):
 *   1. setWebhook — приём апдейтов на `https://<deploy>.convex.site/telegram-webhook`
 *      (роут объявлен в src/convex/http.ts), с secret_token в заголовке
 *      X-Telegram-Bot-Api-Secret-Token (проверяется в handleUpdate);
 *   2. setMyCommands — команды бота, совпадающие с src/lib/telegram/bot.ts;
 *   3. setChatMenuButton — кнопка Mini App «Открыть КИЛО» в чате с ботом
 *      (второй вариант интеграции: приложение внутри Telegram).
 *
 * Использование:
 *   TELEGRAM_BOT_TOKEN=<токен> \
 *   TELEGRAM_WEBHOOK_URL=https://<deploy>.convex.site/telegram-webhook \
 *   TELEGRAM_WEBHOOK_SECRET=<строка> \
 *   node scripts/telegram-setup.mjs
 *
 * Опции:
 *   --app-url https://...  URL Mini App (по умолчанию TELEGRAM_MINI_APP_URL,
 *                          фолбэк https://fitplan-hub.vercel.app)
 *   --commands-only        только setMyCommands + меню-кнопка (без вебхука)
 *   --webhook-only         только setWebhook
 *   --unset                удалить вебхук (deleteWebhook) и выйти
 *
 * Переменные окружения: TELEGRAM_BOT_TOKEN (обязателен), TELEGRAM_WEBHOOK_URL,
 * TELEGRAM_WEBHOOK_SECRET, TELEGRAM_MINI_APP_URL. Токен и секрет задаются в
 * Convex dashboard (Environment Variables) — здесь они нужны только для
 * регистрации вебхука, в рантайме их читает src/convex/telegram.ts.
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.argv[2]?.replace(/^token=/i, "");
if (!TOKEN) {
  console.error(
    "[telegram-setup] TELEGRAM_BOT_TOKEN не задан. " +
      "Токен от @BotFather — в Convex dashboard (Environment Variables) и сюда.",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const hasFlag = (name) => args.includes(`--${name}`);

const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL || flag("webhook-url");
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || flag("secret") || "";
const APP_URL =
  flag("app-url") || process.env.TELEGRAM_MINI_APP_URL || "https://fitplan-hub.vercel.app";

const API = "https://api.telegram.org";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** [diag] только префикс — секрет целиком никогда не печатаем. */
console.log(`[telegram-setup] token prefix: ${TOKEN.slice(0, 4)}… (длина ${TOKEN.length})`);

async function tg(method, payload) {
  const res = await fetch(`${API}/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
  }
  return data.result;
}

async function main() {
  const me = await tg("getMe", {});
  console.log(
    `[telegram-setup] бот: @${me.username} (id ${me.id}, «${me.first_name}»)` +
      (me.can_join_groups ? "" : " — не может быть добавлен в группы"),
  );
  console.log(`[telegram-setup] ссылка на бота: https://t.me/${me.username}`);
  console.log(`[telegram-setup] Mini App (в Telegram): https://t.me/${me.username}/app`);

  if (hasFlag("--unset")) {
    await tg("deleteWebhook", { drop_pending_updates: true });
    console.log("[telegram-setup] вебхук удалён (deleteWebhook).");
    return;
  }

  const commandsOnly = hasFlag("--commands-only");
  const webhookOnly = hasFlag("--webhook-only");

  // 1) Вебхук: Telegram → Convex httpAction (/telegram-webhook).
  if (!commandsOnly) {
    if (!WEBHOOK_URL) {
      console.warn(
        "[telegram-setup] TELEGRAM_WEBHOOK_URL не задан — вебхук не трогаем. " +
          "После деплоя запустите снова с URL вида https://<deploy>.convex.site/telegram-webhook.",
      );
    } else {
      await tg("setWebhook", {
        url: WEBHOOK_URL,
        ...(SECRET ? { secret_token: SECRET } : {}),
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      });
      console.log(
        `[telegram-setup] вебхук: ${WEBHOOK_URL}` +
          (SECRET ? " (secret_token задан)" : " — БЕЗ secret_token (рекомендуется задать)"),
      );
    }
  } else {
    console.log("[telegram-setup] --commands-only: вебхук пропущен.");
  }

  // 2) Команды — должны совпадать с src/lib/telegram/bot.ts.
  if (!webhookOnly) {
    await tg("setMyCommands", {
      commands: [
        { command: "day", description: "Итог дня: калории, БЖУ, вода" },
        { command: "meal", description: "Быстро записать еду (или просто напишите название)" },
        { command: "water", description: "Добавить воду" },
        { command: "recent", description: "Повторить недавние записи" },
        { command: "today", description: "Тренировка на сегодня" },
        { command: "menu", description: "Кнопки меню" },
        { command: "link", description: "Привязать аккаунт: /link <код>" },
        { command: "help", description: "Справка" },
      ],
    });
    console.log("[telegram-setup] команды установлены (setMyCommands).");

    // 3) Кнопка Mini App в чате с ботом.
    await tg("setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "Открыть КИЛО",
        web_app: { url: APP_URL },
      },
    });
    console.log(`[telegram-setup] кнопка Mini App: «Открыть КИЛО» → ${APP_URL}`);
  } else {
    console.log("[telegram-setup] --webhook-only: команды и кнопка пропущены.");
  }

  if (!hasFlag("--commands-only") && WEBHOOK_URL) {
    const info = await tg("getWebhookInfo", {});
    console.log(
      `[telegram-setup] проверка вебхука: url=${info.url || "(пусто)"}, pending=${info.pending_update_count}`,
    );
    if (info.last_error_message) {
      console.warn(`[telegram-setup] последняя ошибка Telegram: ${info.last_error_message}`);
    }
  }
  console.log("[telegram-setup] готово. Пользователи: t.me/" + me.username + " (бот) и t.me/" + me.username + "/app (Mini App).");
}

main()
  .catch((err) => {
    console.error(`[telegram-setup] ${err.message}`);
    process.exit(1);
  })
  .finally(() => sleep(0));
