import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { handleUpdate, telegramStatus } from "./telegram";

const http = httpRouter();

auth.addHttpRoutes(http);

// Вебхук Telegram-бота: регистрируется в BotFather/скриптом telegram-setup.mjs
// с URL `https://<deployment>.convex.site/telegram-webhook`.
http.route({
  path: "/telegram-webhook",
  method: "POST",
  handler: handleUpdate,
});

// Диагностика: GET /telegram-status — какой токен стоит на сервере, отвечает
// ли он Bot API, зарегистрирован ли вебхук (без секретов в ответе).
http.route({
  path: "/telegram-status",
  method: "GET",
  handler: telegramStatus,
});

export default http;
