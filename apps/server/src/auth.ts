import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { Pool } from "pg";
import { getTrustedOrigins } from "./cors-origins.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Add it to apps/server/.env (e.g. Render PostgreSQL URL)."
  );
}

const isProd = process.env.NODE_ENV === "production";

/** Public URL of this auth service only — no path, no trailing slash (Google OAuth is sensitive to mismatches). */
function normalizeAuthBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

const authSecret =
  process.env.BETTER_AUTH_SECRET?.trim() ||
  (isProd
    ? ""
    : "navbot-local-dev-only-min-32-chars-secret-key!");
if (!authSecret) {
  throw new Error(
    "BETTER_AUTH_SECRET is not set. Generate a long random string (e.g. openssl rand -base64 32) and set it on navbot-auth in Render."
  );
}

const authBaseUrlRaw =
  process.env.BETTER_AUTH_URL?.trim() ||
  process.env.BETTER_AUTH_BASE_URL?.trim() ||
  (isProd ? "" : "http://localhost:3000");
if (!authBaseUrlRaw) {
  throw new Error(
    "Set BETTER_AUTH_URL (or BETTER_AUTH_BASE_URL) to your auth service’s public URL, e.g. https://navbot-auth.onrender.com"
  );
}
const authBaseUrl = normalizeAuthBaseUrl(authBaseUrlRaw);

const authPool = new Pool({
  connectionString,
  max: isProd ? 2 : 10,
  idleTimeoutMillis: isProd ? 20_000 : 30_000,
  connectionTimeoutMillis: isProd ? 15_000 : 20_000,
  ...(isProd ? { ssl: { rejectUnauthorized: false } } : {}),
});

const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const hasGitHub = !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};
if (hasGoogle) {
  socialProviders.google = {
    prompt: "select_account",
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  };
  console.log(
    `[auth] Google OAuth — add this exact Authorized redirect URI in Google Cloud Console → Credentials → your Web client:\n` +
      `     ${authBaseUrl}/api/auth/callback/google`
  );
}
if (hasGitHub) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  };
}
if (!hasGoogle && !hasGitHub) {
  console.warn(
    "No OAuth credentials set. Add GOOGLE_CLIENT_ID/SECRET or GITHUB_CLIENT_ID/SECRET to apps/server/.env to enable social sign-in."
  );
}

export const authOptions: BetterAuthOptions = {
  database: authPool,
  secret: authSecret,
  baseURL: authBaseUrl,
  emailAndPassword: {
    enabled: true,
  },
  ...(Object.keys(socialProviders).length > 0 && { socialProviders }),
  trustedOrigins: getTrustedOrigins(),
  ...(isProd
    ? {
        /**
         * Web app (e.g. navbot-web.onrender.com) and auth (navbot-auth.onrender.com) are different sites.
         * Default SameSite=Lax cookies are not stored/sent reliably on credentialed cross-origin requests,
         * which breaks OAuth "state" linkage and session cookies. None + Secure is required on HTTPS.
         */
        advanced: {
          defaultCookieAttributes: {
            sameSite: "none",
            secure: true,
          },
        },
        /**
         * OAuth state is still verified via the DB verification row; the extra signed `state` cookie
         * often never persists when sign-in starts from a cross-origin fetch (browser third-party rules).
         */
        account: {
          skipStateCookieCheck: true,
        },
      }
    : {}),
};

export const auth: ReturnType<typeof betterAuth> = betterAuth(authOptions);
