#!/usr/bin/env node
/**
 * Direct test of Telegram Mini App auth against the deployed Convex server.
 *
 * This script:
 * 1. Generates valid Telegram Mini App initData (signed with the bot token)
 * 2. Sends it to the Convex auth endpoint
 * 3. Verifies the response
 *
 * Usage: node scripts/test-tg-auth.mjs <TELEGRAM_BOT_TOKEN>
 */
import { createHmac } from "node:crypto";

const BOT_TOKEN = process.argv[2];
if (!BOT_TOKEN) {
  console.error("Usage: node scripts/test-tg-auth.mjs <TELEGRAM_BOT_TOKEN>");
  process.exit(1);
}

const CONVEX_URL = "https://nautical-butterfly-851.eu-west-1.convex.cloud";

// ── Generate valid Telegram Mini App initData ────────────────────────

const fakeUser = {
  id: 123456789,
  first_name: "Test",
  last_name: "User",
  username: "test_user",
  language_code: "ru",
  is_premium: false,
};

const authDate = Math.floor(Date.now() / 1000);

// Build initData in the format Telegram uses
const initDataParams = new URLSearchParams();
initDataParams.set("query_id", "AAHdF6IQG14");
initDataParams.set("user", JSON.stringify(fakeUser));
initDataParams.set("auth_date", String(authDate));
// hash will be added last

// Build data_check_string: sorted key=value joined by \n
const paramsForHash = new URLSearchParams(initDataParams);
const dataCheckString = Array.from(paramsForHash.entries())
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([key, value]) => `${key}=${value}`)
  .join("\n");

// secret_key = HMAC-SHA256(key="WebAppData", message=bot_token)
const secretKey = createHmac("sha256", "WebAppData")
  .update(BOT_TOKEN)
  .digest();

// calculated_hash = HMAC-SHA256(key=secret_key, message=data_check_string)
const hash = createHmac("sha256", secretKey)
  .update(dataCheckString)
  .digest("hex");

// Add hash to initData
initDataParams.set("hash", hash);
const initData = initDataParams.toString();

console.log("=== Telegram Mini App Auth Test ===\n");
console.log(`Bot token length: ${BOT_TOKEN.length}`);
console.log(`Bot token prefix: ${BOT_TOKEN.substring(0, 5)}...`);
console.log(`Auth date: ${authDate}`);
console.log(`Data check string:\n${dataCheckString}`);
console.log(`\nHash: ${hash}`);
console.log(`Init data length: ${initData.length}`);

// ── Verify HMAC locally first ───────────────────────────────────────

console.log("\n=== Local HMAC Verification ===");

// Re-verify using the same algorithm as the server
const paramsVerify = new URLSearchParams(initData);
const receivedHash = paramsVerify.get("hash");
paramsVerify.delete("hash");
const verifyDcs = Array.from(paramsVerify.entries())
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([key, value]) => `${key}=${value}`)
  .join("\n");

const verifySecretKey = createHmac("sha256", "WebAppData")
  .update(BOT_TOKEN)
  .digest();
const expectedHash = createHmac("sha256", verifySecretKey)
  .update(verifyDcs)
  .digest("hex");

console.log(`Expected: ${expectedHash}`);
console.log(`Received: ${receivedHash}`);
console.log(`Match: ${expectedHash === receivedHash ? "✅ YES" : "❌ NO"}`);

if (expectedHash !== receivedHash) {
  console.error("\n❌ Local HMAC verification failed - aborting server test");
  process.exit(1);
}
console.log("✅ Local HMAC verification passed\n");

// ── Test against the deployed Convex server ──────────────────────────

console.log("=== Server Test ===");
console.log(`Testing against: ${CONVEX_URL}\n`);

// Method 1: Test the telegram-status endpoint to check deployed version
console.log("--- Test 1: Check deployed version ---");
try {
  const statusRes = await fetch(`${CONVEX_URL}/../api/v1/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "users:currentUser",
      args: {},
    }),
  });
  console.log(`Status endpoint response: ${statusRes.status}`);
} catch (e) {
  console.log(`Status check failed: ${e.message}`);
}

// Method 2: Try to call the auth function via Convex client API
console.log("\n--- Test 2: Direct auth call ---");
try {
  // Convex auth uses a specific API endpoint for credential auth
  const authRes = await fetch(`${CONVEX_URL}/api/v1/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "auth:signIn",
      args: {
        provider: "telegram",
        params: {
          source: "webapp",
          initData: initData,
          create: true,
        },
      },
    }),
  });
  const authData = await authRes.json();
  console.log(`Auth response status: ${authRes.status}`);
  console.log(`Auth response:`, JSON.stringify(authData, null, 2));
} catch (e) {
  console.log(`Auth call failed: ${e.message}`);
}

// Method 3: Check telegram-status endpoint
console.log("\n--- Test 3: Telegram status endpoint ---");
try {
  const statusRes = await fetch(
    `${CONVEX_URL.replace(".convex.cloud", ".convex.site")}/telegram-status`,
  );
  const statusText = await statusRes.text();
  console.log(`Status: ${statusRes.status}`);
  try {
    const statusJson = JSON.parse(statusText);
    console.log(`Response:`, JSON.stringify(statusJson, null, 2));
  } catch {
    console.log(`Response (raw): ${statusText.substring(0, 500)}`);
  }
} catch (e) {
  console.log(`Status check failed: ${e.message}`);
}

console.log("\n=== Done ===");
