# 🚀 Запуск продакшена (чек-лист)

Всё в коде готово: сборка, тесты, линт проходят; CI на GitHub уже умеет
деплоить в Convex и Vercel автоматически (джоба `deploy` в
`.github/workflows/ci.yml`) — при каждом пуше в `main`, если заданы секреты.

Ниже — только то, что требует ваших аккаунтов. Один раз настраивается, дальше
деплой идёт сам по каждому коммиту в `main`.

---

## Текущий статус (проверено 2026-08-17)

| Компонент | Статус | Ссылка / детали |
| --- | --- | --- |
| Репозиторий GitHub | ✅ опубликован (public) | <https://github.com/Mavrin007/fitplan-hub> (`main`, v2.10) |
| CI на GitHub | ✅ lint / typecheck / tests / build / lighthouse — зелёные | Actions → последний прогон |
| Фронтенд Vercel | ✅ **живой** | <https://fitplan-hub.vercel.app> (HTTP 200, собран на `VITE_CONVEX_URL=https://energetic-coyote-927.convex.cloud`) |
| Бэкенд Convex (production) | ⚠️ **деплой создан, но функции НЕ задеплоены** | `energetic-coyote-927` — все http-роуты отвечают 404 («No matching routes found») |
| Переменные окружения Convex | ⚠️ нужно проверить/задать | см. Шаг 3 |
| Секреты GitHub (авто-деплой) | ❌ не заданы | джоба `deploy` в CI запускается, но все шаги — skipped |
| Telegram (бот + Mini App) | ❌ бот ещё не создан | см. Шаг 5 |
| Google OAuth | ⏳ опционально | README → «Enabling Google OAuth» |

**Ключевой вывод:** фронтенд уже в проде, но бэкенд-функции (auth, telegram-вебхук,
вся бизнес-логика) ещё не задеплоены в облачный Convex — пока не сделаете Шаг 1
(деплой бэкенда) и Шаг 3 (env), вход в приложение на <https://fitplan-hub.vercel.app>
работать не будет (бэкенд пустой).

---

## Шаг 1 — Задеплойте бэкенд в Convex (сначала это! ⚠️)

Production-деплой уже создан: **`energetic-coyote-927`** (тот, что вы создали
в дашборде Convex). В него ещё не залиты функции — это главный блокер.

**Самый быстрый вариант — дайте мне deploy-ключ, и я задеплою сам:**

1. Convex Dashboard → Project (`energetic-coyote-927`) → **Settings → Deploy Keys** → **Create key**
   - права: **Admin** (нужен и для деплоя, и для `convex env set`)
2. Пришлите ключ сюда — я выполню `npx convex deploy` и поставлю env-переменные из Шага 3.

**Или сами, с любой машины:**

```bash
npx convex login   # один раз, откроется браузер
npx convex deploy  # зальёт функции и http-роуты в energetic-coyote-927
```

**Или через CI:** задайте секрет `CONVEX_DEPLOY_TOKEN` (Шаг 2) — джоба `deploy`
сама запустит `convex deploy` при следующем пуше в `main`.

После деплоя проверьте:

```bash
# должны перестать быть 404:
curl https://energetic-coyote-927.convex.site/telegram-webhook
curl https://energetic-coyote-927.convex.cloud/api/auth/authorize
```

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

## Шаг 5 — Telegram: бот + Mini App

1. **@BotFather** (`https://t.me/BotFather`):
   - `/newbot` → получите токен → `TELEGRAM_BOT_TOKEN`
   - `/newapp` → укажите https-URL приложения (домен Vercel) — включит Mini App
2. `TELEGRAM_BOT_TOKEN` и `TELEGRAM_WEBHOOK_SECRET` → в Convex Dashboard (Шаг 3)
3. После деплоя бэкенда зарегистрируйте вебхук (один раз, с любой машины):
   ```bash
   TELEGRAM_BOT_TOKEN=<токен> \
   TELEGRAM_WEBHOOK_URL=https://energetic-coyote-927.convex.site/telegram-webhook \
   TELEGRAM_WEBHOOK_SECRET=<строка> \
   npm run telegram:setup
   ```
   Скрипт поставит вебхук, команды (`/day`, `/meal`, `/water`, …) и кнопку
   «Открыть КИЛО» (Mini App). Если пришлёте токен мне — запущу сам.

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
