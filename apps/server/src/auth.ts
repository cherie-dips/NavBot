import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

type BetterAuthOptions = Parameters<typeof betterAuth>[0];

export const db: InstanceType<typeof Database> = new Database("./sqlite.db");

export const authOptions: BetterAuthOptions = {
  database: db,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      prompt: "select_account",
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  trustedOrigins: ["http://localhost:5173"],
};

export const auth: ReturnType<typeof betterAuth> = betterAuth(authOptions);