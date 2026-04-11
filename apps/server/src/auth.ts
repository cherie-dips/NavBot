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

export const authPool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
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
  emailAndPassword: {
    enabled: true,
  },
  ...(Object.keys(socialProviders).length > 0 && { socialProviders }),
  trustedOrigins: getTrustedOrigins(),
  ...(process.env.BETTER_AUTH_BASE_URL?.trim()
    ? { baseURL: process.env.BETTER_AUTH_BASE_URL.trim() }
    : {}),
};

export const auth: ReturnType<typeof betterAuth> = betterAuth(authOptions);
