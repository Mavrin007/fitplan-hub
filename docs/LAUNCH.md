# 🚀 Запуск продакшена (чек-лист)

Всё в коде готово: сборка, тесты, линт проходят; CI на GitHub уже умеет
деплоить в Convex и Vercel автоматически (джоба `deploy` в
`.github/workflows/ci.yml`) — при каждом пуше в `main`, если заданы секреты.

Ниже — только то, что требует ваших аккаунтов. Один раз настраивается, дальше
деплой идёт сам по каждому коммиту в `main`.

---

## Шаг 1 — Секреты GitHub (5 минут)

**GitHub → ваш репозиторий → Settings → Secrets and variables → Actions → New repository secret:**

| Секрет | Откуда взять |
| --- | --- |
| `VERCEL_TOKEN` | https://vercel.com/account/settings/tokens → Create Token |
| `VERCEL_ORG_ID` | из `.vercel/project.json`: `team_Ozqdb3sPJrXCKbegDdn6iKMS` |
| `VERCEL_PROJECT_ID` | из `.vercel/project.json`: `prj_InGaQMdY0UV7uEoWzhqu1v7FElZg` |
| `CONVEX_DEPLOY_TOKEN` | Convex Dashboard → Project → Settings → Deploy Keys → Create key (с правом deploy) |

## Шаг 2 — Переменные окружения Convex (Dashboard → Project → Settings → Environment Variables)

Скопируйте из текущего проекта значения и добавьте новые:

- `VLY_CONVEX_AUTH_ISSUER` = `https://freebuff.com`
- `JWT_PRIVATE_KEY`, `JWT_STORAGE_KEY`, `JWKS` — те же, что работают сейчас
- `SITE_URL` = `https://fitplan-hub.vercel.app` (ваш прод-домен)
- `VLY_INTEGRATION_KEY` — ключ VLY (email-коды + fallback ассистента)
- `GEMINI_API_KEY` — опционально (ИИ-ассистент)
- `TELEGRAM_BOT_TOKEN` — из шага 4
- `TELEGRAM_WEBHOOK_SECRET` — любая строка (см. шаг 4)
- `TELEGRAM_MINI_APP_URL` = `https://fitplan-hub.vercel.app`

## Шаг 3 — Переменные Vercel (Dashboard → Project → Settings → Environment Variables)

- `VITE_CONVEX_URL` = `https://<project>.convex.cloud` — появится после первого
  деплоя бэкенда (или задайте заранее, URL виден в Convex Dashboard)

## Шаг 4 — Telegram: бот + Mini App

1. **@BotFather** (`https://t.me/BotFather`):
   - `/newbot` → получите токен → `TELEGRAM_BOT_TOKEN`
   - `/newapp` → укажите https-URL приложения (домен Vercel) — включит Mini App
2. `TELEGRAM_BOT_TOKEN` и `TELEGRAM_WEBHOOK_SECRET` → в Convex Dashboard (шаг 2)
3. После деплоя зарегистрируйте вебхук (один раз, с любой машины):
   ```bash
   TELEGRAM_BOT_TOKEN=<токен> \
   TELEGRAM_WEBHOOK_URL=https://<project>.convex.site/telegram-webhook \
   TELEGRAM_WEBHOOK_SECRET=<строка> \
   npm run telegram:setup
   ```
   Скрипт поставит вебхук, команды (`/day`, `/meal`, `/water`, …) и кнопку
   «Открыть КИЛО» (Mini App).

## Шаг 5 — Запуск деплоя

Джоба `deploy` в CI сработает автоматически при следующем пуше в `main`
(или PR-мерже). Прогресс: **GitHub → Actions → Deploy to Vercel (production)**.

Она делает: `convex deploy` → `vercel build` → `vercel deploy --prod` →
смоук-тест URL. Ссылки: бот `https://t.me/<бот>`, Mini App `https://t.me/<бот>/app`.

## Проверка после деплоя

- [ ] Открыть сайт — лендинг и вход работают
- [ ] Войти по email (код приходит) — авторизация жива
- [ ] Бот: `/start`, `/link <код>`, `/day` — отвечает
- [ ] Mini App: `https://t.me/<бот>/app` — приложение открывается в Telegram
