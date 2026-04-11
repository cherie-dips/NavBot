import "dotenv/config";
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { getMigrations } from "better-auth/db/migration";
import { auth, authOptions } from "./auth.js";
import { getTrustedOrigins } from "./cors-origins.js";

async function main(): Promise<void> {
  const { runMigrations } = await getMigrations(authOptions);
  await runMigrations();
  console.log("Better Auth database migrations applied (PostgreSQL).");

  const app = express();
  const PORT = process.env.PORT || 3000;

  const trustedOrigins = getTrustedOrigins();
  const trustedSet = new Set(trustedOrigins);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (trustedSet.has(origin)) return callback(null, origin);
        console.warn(`[cors] blocked origin: ${origin} (set CORS_ORIGIN in apps/server/.env)`);
        callback(null, false);
      },
      credentials: true,
    })
  );

  app.all("/api/auth/*", toNodeHandler(auth));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`[cors] trusted origins: ${trustedOrigins.join(", ")}`);
  });
}

main().catch((err) => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});
