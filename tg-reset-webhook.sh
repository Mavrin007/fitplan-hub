#!/usr/bin/env bash
# Перерегистрация вебхука: секрет берём из Convex prod (источник истины).
set -euo pipefail
KEY="$(cat ~/.vly-convex/prod.key)"
SECRET="$(CONVEX_DEPLOY_KEY="$KEY" npx convex env list 2>/dev/null | sed -n 's/^TELEGRAM_WEBHOOK_SECRET=//p' | head -1)"
TOKEN="$(CONVEX_DEPLOY_KEY="$KEY" npx convex env list 2>/dev/null | sed -n 's/^TELEGRAM_BOT_TOKEN=//p' | head -1)"
if [ -z "$SECRET" ] || [ -z "$TOKEN" ]; then
  echo "!! Не нашёл секрет или токен в Convex env" >&2
  exit 1
fi
echo "Секрет найден: ${SECRET:0:8}… (длина ${#SECRET})"
TELEGRAM_BOT_TOKEN="$TOKEN" \
TELEGRAM_WEBHOOK_URL="https://energetic-coyote-927.convex.site/telegram-webhook" \
TELEGRAM_WEBHOOK_SECRET="$SECRET" \
  node scripts/telegram-setup.mjs 2>&1 | tail -8
