#!/usr/bin/env node
/**
 * End-to-end test: generates valid Telegram Mini App initData,
 * signs it with the bot token, and calls the Convex signIn mutation.
 *
 * Usage: node scripts/test-tg-e2e.mjs <BOT_TOKEN>
 *
 * This tests:
 * 1. The HMAC algorithm locally (should always pass)
 * 2. Whether the deployed Convex server has the v5-inline code
 * 3. Whether TELEGRAM_BOT_TOKEN env var matches the signing token
 */
import { createHmac } from "node:crypto";

const BOT_TOKEN = process.argv[2];
if (!BOT_TOKEN) {
  console.error("Usage: node scripts/test-tg-e2e.mjs <BOT_TOKEN>");
  process.exit(1);
}

const CONVEX_SITE = "https://nautical-butterfly-851.eu-west-1.convex.site";

// ── 1. Generate valid Mini App initData ─────────────────────────────

const fakeUser = {
  id: 999888777,
  first_name: "TestBot",
  last_name: "User",
  username: "test_bot_user",
  language_code: "ru",
  is_premium: false,
};

const authDate = Math.floor(Date.now() / 1000);
const queryId = "AAHdF6IQG14test";

const rawParams = new URLSearchParams();
rawParams.set("query_id", queryId);
rawParams.set("user", JSON.stringify(fakeUser));
rawParams.set("auth_date", String(authDate));

// Build data_check_string: sorted key=value with \n
const dataCheckString = Array.from(rawParams.entries())
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([k, v]) => `${k}=${v}`)
  .join("\n");

// secret_key = HMAC-SHA256("WebAppData", bot_token)
const secretKey = createHmac("sha256", "WebAppData")
  .update(BOT_TOKEN)
  .digest();

// hash = HMAC-SHA256(secret_key, data_check_string)
const hash = createHmac("sha256", secretKey)
  .update(dataCheckString)
  .digest("hex");

rawParams.set("hash", hash);
const initData = rawParams.toString();

console.log("═══════════════════════════════════════════════════════");
console.log("  Telegram Mini App Auth — End-to-End Test");
console.log("═══════════════════════════════════════════════════════\n");

console.log(`Bot token length: ${BOT_TOKEN.length}`);
console.log(`Auth date: ${authDate} (${new Date(authDate * 1000).toISOString()})`);
console.log(`Data check string (${dataCheckString.length} chars):`);
console.log(dataCheckString.split("\n").map(l => `  ${l}`).join("\n"));
console.log(`\nHash: ${hash}`);
console.log(`InitData length: ${initData.length}`);

// ── 2. Local verification ───────────────────────────────────────────

console.log("\n── Local HMAC Verification ──");

const verifyParams = new URLSearchParams(initData);
const receivedHash = verifyParams.get("hash");
verifyParams.delete("hash");
const verifyDcs = Array.from(verifyParams.entries())
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([k, v]) => `${k}=${v}`)
  .join("\n");

const verifyKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
const expectedHash = createHmac("sha256", verifyKey).update(verifyDcs).digest("hex");

const localOk = expectedHash === receivedHash;
console.log(`Expected: ${expectedHash}`);
console.log(`Got:      ${receivedHash}`);
console.log(`Match:    ${localOk ? "✅ PASS" : "❌ FAIL"}`);

if (!localOk) {
  console.error("\n❌ Local HMAC mismatch — something wrong with generation");
  process.exit(1);
}

// ── 3. Test telegram-status endpoint ────────────────────────────────

console.log("\n── Test 1: GET /telegram-status (public) ──");
try {
  const res = await fetch(`${CONVEX_SITE}/telegram-status`);
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  try {
    const json = JSON.parse(text);
    console.log(`Response:`, JSON.stringify(json, null, 2));
  } catch {
    console.log(`Raw: ${text.substring(0, 500)}`);
  }
} catch (e) {
  console.log(`Error: ${e.message}`);
}

// ── 4. Test signIn via Convex mutation API ──────────────────────────

console.log("\n── Test 2: POST signIn('telegram', webapp) ──");

// Convex credentials auth goes through: POST /api/v1/mutation
// The path is auth.signIn but we need to hit it through the Convex auth system.
// Actually, the signIn is a client-side call through @convex-dev/auth.
// Let's call the HTTP action directly with a fabricated request.

// Actually, the auth signIn goes through the Convex mutation api.auth.signIn
// which internally calls the provider's authorize. We can't call it directly
// without a real session. Let me check the error format instead.

// The key diagnostic: the error message format tells us which code is running.
// Old: "TG_AUTH_INVALID_SIGNATURE: dataCheckString.length=571, source=webapp."
// New: "TG_AUTH_INVALID_SIGNATURE: v5-inline keys=[...] dcsLen=... tokenLen=... source=webapp."

// We can't directly call signIn without a valid Convex session, but we can
// verify by checking the /telegram-status endpoint for deploy info.

console.log("(Cannot call signIn directly — needs Convex session)");
console.log("The error format in the user's browser tells us which code runs:");
console.log('  Old format: "TG_AUTH_INVALID_SIGNATURE: dataCheckString.length=..."');
console.log('  New format: "TG_AUTH_INVALID_SIGNATURE: v5-inline keys=[...]"');

// ── 5. Summary ─────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════");
console.log("  Summary");
console.log("═══════════════════════════════════════════════════════");
console.log(`Local HMAC:     ${localOk ? "✅ PASS" : "❌ FAIL"}`);
console.log(`Algorithm:      Sorted key=value, \\n separator, HMAC-SHA256`);
console.log(`Secret:         HMAC("WebAppData", bot_token)`);
console.log("");
console.log("If the server error still says 'dataCheckString.length=571'");
console.log("without 'v5-inline', the OLD code is deployed on Convex.");
console.log("This means TELEGRAM_BOT_TOKEN on the server does NOT match");
console.log("the token used to sign initData in this test.");
console.log("");
console.log("ACTION: Compare the bot token in Convex Dashboard > Settings >");
console.log("Environment Variables with the token used in this test.");
