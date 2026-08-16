import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { handleUpdate } from "./telegram";

const http = httpRouter();

auth.addHttpRoutes(http);

// Вебхук Telegram-бота: регистрируется в BotFather/скриптом telegram-setup.mjs
// с URL `https://<deployment>.convex.site/telegram-webhook`.
http.route({
  path: "/telegram-webhook",
  method: "POST",
  handler: handleUpdate,
});

export default http;
