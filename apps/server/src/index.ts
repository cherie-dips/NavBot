import "dotenv/config";
import "./sentry.js"; // must init before anything else that could throw
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { getMigrations } from "better-auth/db/migration";
import { auth, authOptions } from "./auth.js";
import { getTrustedOrigins } from "./cors-origins.js";
import { issueApiToken } from "./api-token.js";
import { Sentry, sentryEnabled } from "./sentry.js";

/** First entry of CORS_ORIGIN or WEB_APP_ORIGIN — used to send users back to the SPA on OAuth errors. */
function getWebAppOriginForRedirect(): string | undefined {
  const explicit = process.env.WEB_APP_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) return undefined;
  const first = raw.split(",")[0]?.trim();
  return first ? first.replace(/\/+$/, "") : undefined;
}

/**
 * Serverless Postgres (Neon) suspends its compute after a few idle minutes and can take
 * longer than one connection attempt to wake back up. A cold boot hitting this at the
 * same moment as apps/api used to just fail outright with no retry at all.
 */
async function runMigrationsWithRetry(maxAttempts = 4): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { runMigrations } = await getMigrations(authOptions);
      await runMigrations();
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = /timeout|ECONNRESET|ECONNREFUSED|Connection terminated/i.test(msg);
      if (!retryable || attempt === maxAttempts) throw err;
      const wait = 2000 * attempt;
      console.warn(
        `[server] DB migration check failed (attempt ${attempt}/${maxAttempts}, likely a cold-starting database): ${msg.slice(0, 200)}. Retrying in ${wait}ms…`
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function main(): Promise<void> {
  await runMigrationsWithRetry();
  console.log("Better Auth database migrations applied (PostgreSQL).");

  const app = express();
  const PORT = process.env.PORT || 3000;

  const trustedOrigins = getTrustedOrigins();
  const trustedSet = new Set(trustedOrigins);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      // apps/web is a different origin by design (see cors-origins.ts) — it needs to
      // read responses from here cross-origin; helmet's same-origin default would block it.
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
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

  /** apps/web calls this after getSession() succeeds, to get a token apps/api can verify without seeing this cookie. */
  app.get("/api/session-token", async (req, res) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session?.user?.id) {
      res.status(401).json({ error: "not_authenticated" });
      return;
    }
    res.json(issueApiToken(session.user.id));
  });

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

  if (sentryEnabled) Sentry.setupExpressErrorHandler(app);

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`[cors] trusted origins: ${trustedOrigins.join(", ")}`);
  });
}

main().catch((err) => {
  console.error("[server] Failed to start:", err);
  if (sentryEnabled) Sentry.captureException(err);
  process.exit(1);
});
