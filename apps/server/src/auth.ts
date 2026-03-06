import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

type BetterAuthOptions = Parameters<typeof betterAuth>[0];

export const db: InstanceType<typeof Database> = new Database("./sqlite.db");

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
  console.warn("No OAuth credentials set. Add GOOGLE_CLIENT_ID/SECRET or GITHUB_CLIENT_ID/SECRET to apps/server/.env to enable social sign-in.");
}

export const authOptions: BetterAuthOptions = {
  database: db,
  emailAndPassword: {
    enabled: true,
  },
  ...(Object.keys(socialProviders).length > 0 && { socialProviders }),
  trustedOrigins: ["http://localhost:5173"],
};

export const auth: ReturnType<typeof betterAuth> = betterAuth(authOptions);