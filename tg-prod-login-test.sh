#!/usr/bin/env bash
# Живой тест провайдера входа через Telegram на Convex prod:
# 1) собирает поля Login Widget, подписывает их реальным токеном бота;
# 2) зовёт auth:signIn через `convex run`;
# 3) печатает только результат (без токенов).
set -euo pipefail

TOKEN="8659935112:AAEO9JMPWuLJh5VPrx_rWzH5Sak6UU458Co"
AUTH_DATE=$(date +%s)
# Случайный telegram id из приватного диапазона тестов
TG_ID=$((100000000 + RANDOM % 899999999))

# Поля виджета (как их отдаёт oauth.telegram.org), кроме hash.
FIELDS_JSON=$(node -e "console.log(JSON.stringify({ id: $TG_ID, first_name: 'Тест', username: 'tg_prod_test', auth_date: $AUTH_DATE }))")

# Считаем hash по алгоритму виджета: sha256(токен) -> HMAC по отсортированным key=value.
HASH=$(TOKEN="$TOKEN" FIELDS="$FIELDS_JSON" node -e '
const crypto = require("crypto");
const fields = JSON.parse(process.env.FIELDS);
const token = process.env.TOKEN;
const checkString = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
const secret = crypto.createHash("sha256").update(token).digest();
process.stdout.write(crypto.createHmac("sha256", secret).update(checkString).digest("hex"));
')

ARGS=$(node -e "
const fields = $FIELDS_JSON;
fields.hash = '$HASH';
console.log(JSON.stringify({ provider: 'telegram', params: { source: 'widget', ...fields } }));
")

echo "== calling auth:signIn (provider=telegram, widget) on prod =="
KEY="$(cat ~/.vly-convex/prod.key)"
RESULT=$(CONVEX_DEPLOY_KEY="$KEY" bunx convex run auth:signIn "$ARGS" 2>&1 || true)
echo "$RESULT" | head -c 400
echo ""
if echo "$RESULT" | grep -q '"status":"signedIn"'; then
  echo "RESULT=OK (signedIn)"
else
  echo "RESULT=CHECK_OUTPUT_ABOVE"
fi
