import "dotenv/config";
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { getMigrations } from "better-auth/db/migration";
import { auth, authOptions } from "./auth.js";
import { getTrustedOrigins } from "./cors-origins.js";
import { sitesRouter } from "./sites.js";

/** First entry of CORS_ORIGIN or WEB_APP_ORIGIN — used to send users back to the SPA on OAuth errors. */
function getWebAppOriginForRedirect(): string | undefined {
  const explicit = process.env.WEB_APP_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) return undefined;
  const first = raw.split(",")[0]?.trim();
  return first ? first.replace(/\/+$/, "") : undefined;
}

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
  app.use(sitesRouter);

  const redirectOAuthErrorToWeb = (
    req: express.Request,
    res: express.Response
  ): void => {
    const web = getWebAppOriginForRedirect();
    const err =
      typeof req.query.error === "string" ? req.query.error : undefined;
    if (web && err) {
      const dest = new URL("/", web);
      dest.searchParams.set("auth_error", err);
      res.redirect(302, dest.toString());
      return;
    }
    if (err && !web) {
      res
        .status(400)
        .type("text/plain")
        .send(
          `OAuth error: ${err}. Set CORS_ORIGIN (or WEB_APP_ORIGIN) on this service to your static site URL (e.g. https://navbot-web.onrender.com) so users are redirected back with this message.`
        );
      return;
    }
    res
      .type("text/plain")
      .send(
        "NavBot auth API is running. Sign in from the web app.\nGET /health for status.\n"
      );
  };

  app.get("/", redirectOAuthErrorToWeb);
  app.get("/error", redirectOAuthErrorToWeb);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`[cors] trusted origins: ${trustedOrigins.join(", ")}`);
  });
}

main().catch((err) => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});
