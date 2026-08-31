/**
 * Fast, offline checks for the bearer-token signature/expiry logic. No API calls, no
 * framework — run directly with `tsx apps/api/src/services/api-token.test.ts`.
 *
 * Uses a dynamic import inside an async IIFE so the test secret is set before
 * api-token.ts's module-level getSecret() call runs — a static top-level import would
 * be hoisted ahead of the process.env assignment below and cache a random secret
 * instead (this project compiles to CJS, so top-level await isn't available either).
 */
import assert from "assert";
import crypto from "crypto";

process.env.NAVBOT_API_TOKEN_SECRET = "test-secret-do-not-use-in-real-env";

function mintToken(userId: string, expiresAt: number, secret = process.env.NAVBOT_API_TOKEN_SECRET!): string {
  const payload = Buffer.from(`${userId}:${expiresAt}`, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `v1.${payload}.${sig}`;
}

(async () => {
  const { verifyApiToken } = await import("./api-token");

  const validToken = mintToken("user-123", Date.now() + 60_000);
  assert.strictEqual(verifyApiToken(validToken), "user-123", "valid token should round-trip to its userId");

  const [version] = validToken.split(".");
  const tamperedPayload = Buffer.from("attacker-999:" + (Date.now() + 60_000), "utf8").toString("base64url");
  const tampered = `${version}.${tamperedPayload}.${validToken.split(".")[2]}`;
  assert.strictEqual(verifyApiToken(tampered), null, "payload swapped without re-signing should be rejected");

  const expired = mintToken("user-123", Date.now() - 1000);
  assert.strictEqual(verifyApiToken(expired), null, "expired token should be rejected");

  assert.strictEqual(verifyApiToken("not-a-token"), null, "malformed token should be rejected");
  assert.strictEqual(verifyApiToken(undefined), null, "missing token should be rejected");
  assert.strictEqual(verifyApiToken(mintToken("user-123", Date.now() + 60_000, "wrong-secret")), null, "wrong secret should be rejected");

  console.log("all api-token checks passed");
})();
