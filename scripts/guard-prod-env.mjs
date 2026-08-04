// Гард продакшен-сборки: фейлит деплой, если VITE_CONVEX_URL отсутствует,
// указывает на localhost/127.0.0.1 или не https.
//
// Запуск: node scripts/guard-prod-env.mjs [путь к env-файлу]
// По умолчанию читает .vercel/.env.production.local — туда `vercel pull`
// складывает переменные из панели Vercel. Фронтенд без валидного Convex-URL
// соберётся «пустым» (клиент упадёт в runtime), поэтому проверяем до сборки.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envFile = process.argv[2] ?? ".vercel/.env.production.local";
const full = resolve(envFile);

if (!existsSync(full)) {
  console.error(`[guard-prod-env] ${envFile} не найден: переменные не подтянуты (vercel pull) или VITE_CONVEX_URL не задан в панели Vercel.`);
  process.exit(1);
}

const content = readFileSync(full, "utf8");
const match = content.match(/^VITE_CONVEX_URL\s*=\s*(.+)$/m);
const raw = match?.[1]?.trim() ?? "";
const url = raw.replace(/^["']|["']$/g, "");

const isLocalhost = /(127\.0\.0\.1|localhost|0\.0\.0\.0)/.test(url);
const isHttps = /^https:\/\//.test(url);

if (!url || isLocalhost || !isHttps) {
  console.error(`[guard-prod-env] VITE_CONVEX_URL некорректен для продакшена: "${url || "(пусто)"}"`);
  console.error("[guard-prod-env] Ожидается https://<project>.convex.cloud — без localhost/127.0.0.1.");
  process.exit(1);
}

console.log(`[guard-prod-env] OK: VITE_CONVEX_URL = ${url}`);
