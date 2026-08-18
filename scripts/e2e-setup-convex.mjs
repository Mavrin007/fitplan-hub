// Ставит auth-окружение на локальный Convex-бэкенд для e2e (CI).
//
// Свежий `convex dev` на раннере создаёт пустой деплой: без переменных ниже
// @convex-dev/auth падает в runtime с «Missing environment variable …»
// (tokens.js: requireEnv("JWT_PRIVATE_KEY") и т.д.), /auth не рендерит h1 и
// ВСЕ e2e-тесты уходят в таймаут. Локально эти переменные ставятся вручную
// через `convex env set` (см. .freebuff/run.md) — здесь то же самое, но
// автоматически: JWT-ключи генерируются на лету (node:crypto), поэтому в
// репозиторий и GitHub-секреты ничего класть не нужно. e2e ходит только
// гостем и через dev-OTP — Google OAuth не используется, его ключи не нужны.
//
// Порядок: `convex dev` поднят в фоне (шаг CI перед этим), скрипт ждёт
// готовности бэкенда на :3210, затем делает `convex env set` для каждой
// переменной (spawnSync с массивом args — без шелл-квотинга многострочных
// значений вроде PEM-ключа).
import { spawnSync } from "node:child_process";
import { createPublicKey, generateKeyPairSync, randomBytes } from "node:crypto";

const BACKEND_URL = "http://127.0.0.1:3210";

function waitForBackend(url = BACKEND_URL, timeoutMs = 180_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        // Любой HTTP-ответ (включая 4xx/5xx) значит, что бэкенд уже слушает
        // порт — fetch выбросит исключение только пока соединение не
        // устанавливается вовсе.
        void res;
        return resolve();
      } catch {
        /* бэкенд ещё стартует */
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Convex backend не поднялся за ${timeoutMs}ms`));
      }
      setTimeout(tick, 2000);
    };
    void tick();
  });
}

/** Генерирует RSA-пару и собирает JWKS для @convex-dev/auth. */
function makeAuthEnv() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const jwk = createPublicKey(publicKey).export({ format: "jwk" });
  return {
    // requireEnv-переменные @convex-dev/auth (tokens.js / implementation).
    JWT_PRIVATE_KEY: privateKey,
    JWKS: JSON.stringify({
      keys: [{ kty: "RSA", use: "sig", alg: "RS256", kid: "e2e", n: jwk.n, e: jwk.e }],
    }),
    // Не requireEnv, но хранит ключ шифрования сессий — ставим для единообразия.
    JWT_STORAGE_KEY: randomBytes(32).toString("base64"),
    // SITE_URL — requireEnv: callback-база auth-редиректов = URL локального деплоя.
    SITE_URL: BACKEND_URL,
    // VLY_CONVEX_AUTH_ISSUER — читается auth.config.ts (customJwt-провайдер
    // freebuff). CLI/локальный бэкенд проверяет auth-config env-переменные по
    // хранилищу деплоя (не process.env): без неё свежий локальный деплой
    // падает на пуше ещё до `env set` («used in auth config file but its value
    // was not set»). Для e2e эмиттер freebuff не нужен (гостевой вход +
    // dev-OTP), поэтому достаточно заглушки.
    VLY_CONVEX_AUTH_ISSUER: "https://freebuff.com",
    // dev-перехват OTP-кодов (convex/emailOtp.ts): без него код ушёл бы в
    // реальный VLY-шлюз, который на раннере не настроен.
    VLY_EMAIL_DEV_CAPTURE: "1",
  };
}

function setEnv(name, value) {
  // Значение передаём через stdin (команда без value-аргумента), а не
  // аргументом: PEM-ключ и JWKS начинаются с '-', и commander-CLI принял бы
  // их за опцию («error: unknown option '-----BEGIN PRIVATE KEY-----'»).
  const res = spawnSync("npx", ["convex", "env", "set", name], {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
    env: { ...process.env, CONVEX_DEV_DEPLOYMENT: "local" },
  });
  if (res.status !== 0) {
    throw new Error(`convex env set ${name} завершился с кодом ${res.status}`);
  }
}

async function main() {
  await waitForBackend();
  const env = makeAuthEnv();
  for (const [name, value] of Object.entries(env)) {
    setEnv(name, value);
  }
  console.log(`[e2e] auth-окружение установлено (${Object.keys(env).length} переменных)`);
}

main().catch((err) => {
  console.error("[e2e] настройка бэкенда не удалась:", err);
  process.exit(1);
});
