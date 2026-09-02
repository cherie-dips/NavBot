/**
 * Verifies the short-lived bearer tokens apps/server mints after checking a real
 * Better Auth session (see apps/server/src/api-token.ts for the issuing side and the
 * full rationale). apps/api never talks to Better Auth or its DB tables directly — it
 * only needs to confirm a token was signed with the shared secret and hasn't expired.
 */
import crypto from "crypto";

const TOKEN_VERSION = "v1";

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
      "NAVBOT_API_TOKEN_SECRET is not set. This must be the SAME value configured on navbot-auth — " +
        "without it, every dashboard request that needs to prove who the caller is will be rejected."
    );
  }

  cachedSecret = crypto.randomBytes(32).toString("hex");
  console.warn(
    "[api-token] NAVBOT_API_TOKEN_SECRET is not set — using a random per-process secret. " +
      "Tokens minted by apps/server will not verify unless it uses the exact same secret. Set NAVBOT_API_TOKEN_SECRET in production."
  );
  return cachedSecret;
}

// Fail at import time (server boot), not on the first dashboard request. requireSiteOwner
// is async with no try/catch around this call, so a throw here would otherwise surface as
// an unhandled rejection on a real request instead of a clear, immediate boot failure.
getSecret();

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/** Returns the verified userId, or null if the token is missing, malformed, tampered, or expired. */
export function verifyApiToken(token: string | undefined | null): string | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [version, payload, sig] = parts as [string, string, string];
  if (version !== TOKEN_VERSION || !payload || !sig) return null;

  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const sepIndex = decoded.lastIndexOf(":");
  if (sepIndex === -1) return null;
  const userId = decoded.slice(0, sepIndex);
  const expiresAt = Number(decoded.slice(sepIndex + 1));
  if (!userId || !Number.isFinite(expiresAt)) return null;
  if (Date.now() > expiresAt) return null;

  return userId;
}
