/**
 * Anonymous visitor session tokens.
 *
 * The daily question cap needs something stabler than an IP address: office and campus
 * networks put hundreds of visitors behind one address, and capping that shared address
 * at ten questions would lock out everyone after the first few.
 *
 * So the server issues an opaque token, the widget stores it, and usage is counted per
 * token per day. The token is signed, which stops one visitor from guessing another's
 * token and burning their allowance. It does NOT stop someone clearing their storage and
 * asking for a fresh one — nothing short of an account would, and this is a courtesy
 * limit, not an entitlement check. Treat it as such and it behaves sensibly.
 */
import crypto from "crypto";

const TOKEN_VERSION = "v1";
const ID_BYTES = 16;
/** Truncated HMAC — short enough to keep the token tidy, long enough that guessing is pointless. */
const SIG_LENGTH = 24;

let cachedSecret: string | null = null;

function getSecret(): string {
  if (cachedSecret) return cachedSecret;

  const configured = process.env.NAVBOT_SESSION_SECRET?.trim();
  if (configured) {
    cachedSecret = configured;
    return cachedSecret;
  }

  // A per-process fallback keeps development working, but it is regenerated on every
  // boot and differs between instances — so tokens stop verifying after a deploy and
  // every visitor silently gets a fresh allowance. Fine locally, wrong in production.
  cachedSecret = crypto.randomBytes(32).toString("hex");
  console.warn(
    "[session] NAVBOT_SESSION_SECRET is not set — using a random per-process secret. " +
      "Daily limits will reset on every restart and will not hold across instances. " +
      "Set NAVBOT_SESSION_SECRET in production."
  );
  return cachedSecret;
}

function sign(id: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(id)
    .digest("base64url")
    .slice(0, SIG_LENGTH);
}

export function issueSessionToken(): string {
  const id = crypto.randomBytes(ID_BYTES).toString("base64url");
  return `${TOKEN_VERSION}.${id}.${sign(id)}`;
}

/** Returns the token if it is well-formed and correctly signed, else null. */
export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [version, id, sig] = parts as [string, string, string];
  if (version !== TOKEN_VERSION || !id || !sig) return null;

  const expected = sign(id);
  // Lengths match by construction, but timingSafeEqual throws on a length mismatch
  // rather than returning false, so a malformed token has to be rejected first.
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  return token;
}

/** Verify what the client sent, or mint a fresh token when it is missing or bad. */
export function resolveSessionToken(candidate: string | undefined | null): {
  token: string;
  issued: boolean;
} {
  const valid = verifySessionToken(candidate);
  if (valid) return { token: valid, issued: false };
  return { token: issueSessionToken(), issued: true };
}

/** Header the widget sends it on. A `sessionToken` body field is accepted too. */
export const SESSION_HEADER = "x-navbot-session";

export function sessionTokenFromRequest(
  headers: Record<string, unknown>,
  body?: { sessionToken?: unknown }
): string | undefined {
  const fromHeader = headers[SESSION_HEADER];
  if (typeof fromHeader === "string" && fromHeader) return fromHeader;
  if (typeof body?.sessionToken === "string" && body.sessionToken) return body.sessionToken;
  return undefined;
}
