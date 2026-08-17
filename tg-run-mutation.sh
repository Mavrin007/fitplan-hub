#!/usr/bin/env bash
# Прогон telegram:processBotUpdate на проде с тестовым /start апдейтом.
set -euo pipefail
KEY="$(cat ~/.vly-convex/prod.key)"
UPDATE='{"update":{"update_id":999001,"message":{"message_id":1,"from":{"id":111111,"is_bot":false,"first_name":"Тест","username":"testuser"},"chat":{"id":111111,"first_name":"Тест","type":"private"},"date":1800000000,"text":"/start"}}}'
CONVEX_DEPLOY_KEY="$KEY" npx convex run telegram:processBotUpdate "$UPDATE" 2>&1 | tail -20
