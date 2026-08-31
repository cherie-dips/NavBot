/**
 * Short-lived tokens that let apps/api verify who a dashboard request is really from.
 *
 * apps/web only has a Better Auth session cookie scoped to apps/server's origin — it
 * never reaches apps/api. Rather than forward the cookie or give apps/api a copy of
 * Better Auth's schema, apps/server verifies the session once and mints a signed token
 * binding the verified userId, which apps/web attaches as a bearer token instead.
 *
 * Mirrors the HMAC-token shape in apps/api/src/services/session.ts, except the
 * signature is NOT truncated — that file trims for a courtesy anti-guess measure on
 * anonymous rate limits; this token gates real account writes/deletes.
 */
import crypto from "crypto";

const TOKEN_VERSION = "v1";
const TTL_MS = 5 * 60 * 1000;

let cachedSecret: string | null = null;

function getSecret(): string {
  if (cachedSecret) return cachedSecret;

  const configured = process.env.NAVBOT_API_TOKEN_SECRET?.trim();
  if (configured) {
    cachedSecret = configured;
    return cachedSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NAVBOT_API_TOKEN_SECRET is not set. Generate a long random string (e.g. openssl rand -base64 32) " +
        "and set the SAME value on both navbot-auth and navbot-api in Render."
    );
  }

  cachedSecret = crypto.randomBytes(32).toString("hex");
  console.warn(
    "[api-token] NAVBOT_API_TOKEN_SECRET is not set — using a random per-process secret. " +
      "Tokens will not verify against apps/api unless it uses the exact same secret. Set NAVBOT_API_TOKEN_SECRET in production."
  );
  return cachedSecret;
}

// Fail at import time (server boot), not on the first sign-in attempt. A throw from an
// async route handler with no matching try/catch becomes an unhandled promise rejection,
// which crashes the whole process with no listener registered — surfacing this here
// instead means a misconfigured deploy fails its health check immediately and visibly,
// rather than looking "up" until the first real user hits it.
getSecret();

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function issueApiToken(userId: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + TTL_MS;
  const payload = Buffer.from(`${userId}:${expiresAt}`, "utf8").toString("base64url");
  const token = `${TOKEN_VERSION}.${payload}.${sign(payload)}`;
  return { token, expiresAt };
}
