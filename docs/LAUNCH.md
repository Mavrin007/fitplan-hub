# 🚀 Запуск продакшена (чек-лист)

Всё в коде готово: сборка, тесты, линт проходят; CI на GitHub уже умеет
деплоить в Convex и Vercel автоматически (джоба `deploy` в
`.github/workflows/ci.yml`) — при каждом пуше в `main`, если заданы секреты.

Ниже — только то, что требует ваших аккаунтов. Один раз настраивается, дальше
деплой идёт сам по каждому коммиту в `main`.

---

## Текущий статус (проверено 2026-08-17, обновлено после деплоя)

| Компонент | Статус | Ссылка / детали |
| --- | --- | --- |
| Репозиторий GitHub | ✅ опубликован (public) | <https://github.com/Mavrin007/fitplan-hub> (`main`, v2.11) |
| CI на GitHub | ✅ lint / typecheck / tests / build / lighthouse — зелёные; E2E — исправлен и перезапущен | Actions → последний прогон |
| Фронтенд Vercel | ✅ **живой** | <https://fitplan-hub.vercel.app> (HTTP 200, `VITE_CONVEX_URL=https://energetic-coyote-927.convex.cloud`) |
| Бэкенд Convex (production) | ✅ **функции задеплоены** | `energetic-coyote-927` — `users:currentUser` отвечает, http-роуты живые (вебхук ждёт токен) |
| Переменные окружения Convex | ✅ заданы платформой | `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL`, `VLY_CONVEX_AUTH_ISSUER`, `VLY_INTEGRATION_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, … |
| Telegram (бот + Mini App) | ✅ **готов** | бот **@FitplanKiloBot**, вебхук + команды + кнопка Mini App зарегистрированы |
| Секреты GitHub (авто-деплой) | ⚠️ опционально | джоба `deploy` в CI запускается; без секретов — шаги skipped |
| Google OAuth | ⏳ опционально | README → «Enabling Google OAuth» |

**Ключевой вывод:** прод полностью живой — фронт на Vercel смотрит в прод-бэкенд
Convex, функции и env-переменные на месте, вход/данные работают. Единственный
незакрытый кусок — Telegram (нужен токен бота от @BotFather) и, по желанию,
секреты для авто-деплоя из CI.

---

## Шаг 1 — Бэкенд Convex ✅ (сделано 2026-08-17)

Функции задеплоены в production **`energetic-coyote-927`** (через deploy-ключ,
который платформа хранит в `~/.vly-convex/prod.key`), схема создана
(включая таблицы Telegram: `linkCodes`, `telegramAccounts`, `telegramStates`),
env-переменные на месте.

Проверка:

```bash
curl https://energetic-coyote-927.convex.cloud/api/query \
  -d '{"path":"users:currentUser","format":"json","args":{}}' -H 'Content-Type: application/json'
# → {"status":"success","value":null}
```

При следующем изменении функций деплой так же делается из проекта:
`CONVEX_DEPLOY_KEY=$(cat ~/.vly-convex/prod.key) npx convex deploy`.

## Шаг 2 — Секреты GitHub (для авто-деплоя из CI, по желанию)

## Шаг 2 — Секреты GitHub (для авто-деплоя из CI, по желанию)

**GitHub → ваш репозиторий → Settings → Secrets and variables → Actions → New repository secret:**

| Секрет | Откуда взять |
| --- | --- |
| `VERCEL_TOKEN` | https://vercel.com/account/settings/tokens → Create Token |
| `VERCEL_ORG_ID` | из `.vercel/project.json`: `team_Ozqdb3sPJrXCKbegDdn6iKMS` |
| `VERCEL_PROJECT_ID` | из `.vercel/project.json`: `prj_InGaQMdY0UV7uEoWzhqu1v7FElZg` |
| `CONVEX_DEPLOY_TOKEN` | Convex Dashboard → Project → Settings → Deploy Keys → Create key (с правом deploy) |

## Шаг 3 — Переменные окружения Convex (Dashboard → Project → Settings → Environment Variables)

Скопируйте из текущего проекта значения и добавьте новые:

- `VLY_CONVEX_AUTH_ISSUER` = `https://freebuff.com`
- `JWT_PRIVATE_KEY`, `JWT_STORAGE_KEY`, `JWKS` — те же, что работают сейчас
- `SITE_URL` = `https://fitplan-hub.vercel.app` (ваш прод-домен)
- `VLY_INTEGRATION_KEY` — ключ VLY (email-коды + fallback ассистента; взять из
  Keys/API keys платформы)
- `GEMINI_API_KEY` — опционально (ИИ-ассистент)
- `TELEGRAM_BOT_TOKEN` — из Шага 5
- `TELEGRAM_WEBHOOK_SECRET` — любая строка (см. Шаг 5)
- `TELEGRAM_MINI_APP_URL` = `https://fitplan-hub.vercel.app`

## Шаг 4 — Переменные Vercel (Dashboard → Project → Settings → Environment Variables)

- `VITE_CONVEX_URL` = `https://energetic-coyote-927.convex.cloud` — **уже задано**
  при деплое (проверьте, если деплоили с другим URL). После изменения — передеплой
  (CI или `vercel deploy --prod`).

## Шаг 5 — Telegram: бот + Mini App ✅ (сделано 2026-08-17)

- Бот: **https://t.me/FitplanKiloBot** (id 8659935112, «Kilo»)
- Mini App: **https://t.me/FitplanKiloBot/app** (кнопка «Открыть КИЛО» → https://fitplan-hub.vercel.app)
- Вебхук: `https://energetic-coyote-927.convex.site/telegram-webhook` (secret_token задан, проверен: без секрета 401, с секретом 200)
- Команды: `/day`, `/meal`, `/water`, `/recent`, `/today`, `/menu`, `/link`, `/help`
- Env в Convex prod: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_MINI_APP_URL`

Если понадобится пересоздать вебхук (например, после смены токена):

```bash
TELEGRAM_BOT_TOKEN=<токен> \
TELEGRAM_WEBHOOK_URL=https://energetic-coyote-927.convex.site/telegram-webhook \
TELEGRAM_WEBHOOK_SECRET=<строка> \
npm run telegram:setup
```

## Шаг 6 — Авто-деплой из CI (когда секреты из Шага 2 заданы)

Джоба `deploy` сработает автоматически при следующем пуше в `main`
(или PR-мерже). Прогресс: **GitHub → Actions → Deploy to Vercel (production)**.

Она делает: `convex deploy` → `vercel build` → `vercel deploy --prod` →
смоук-тест URL. Ссылки: бот `https://t.me/<бот>`, Mini App `https://t.me/<бот>/app`.

## Проверка после деплоя

- [ ] Открыть сайт — лендинг и вход работают
- [ ] Войти по email (код приходит) — авторизация жива
- [ ] Бот: `/start`, `/link <код>`, `/day` — отвечает
- [ ] Mini App: `https://t.me/<бот>/app` — приложение открывается в Telegram
