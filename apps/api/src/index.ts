import "dotenv/config";
import "./sentry"; // must init before anything else that could throw
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { Sentry, sentryEnabled } from "./sentry";
import { json, urlencoded } from "express";
import swaggerUi from "swagger-ui-express";

import { router as siteRouter } from "./routes/sites";
import { router as chatRouter } from "./routes/chat";
import { router as colorRouter } from "./routes/colors";
import { router as syncRouter } from "./routes/sync";
import { startAutoSync } from "./services/auto-sync";
import { shutdownBrowser } from "./services/crawl/browser-render";
import { openApiSpec } from "./openapi/openapi-spec";
import { initAppDatabase } from "./services/platform/db";

const app = express();

// Render sits in front of this service as a single reverse proxy — without this,
// req.ip resolves to the proxy's address, not the visitor's, and the per-IP rate
// limiter in routes/chat.ts effectively rate-limits nothing.
app.set("trust proxy", 1);

app.use(
  helmet({
    // The Swagger UI at /api-docs relies on inline scripts/styles; a default CSP breaks
    // it, and this app has no other HTML pages of its own to protect with one.
    contentSecurityPolicy: false,
    // This service is deliberately called cross-origin by any customer's website
    // embedding the widget — helmet's same-origin default would block those fetches.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(cors({ origin: "*" }));
app.use(morgan("dev"));
app.use(json({ limit: "10mb" }));
app.use(urlencoded({ extended: true, limit: "10mb" }));

/** Interactive API docs + built-in request examples (test cases) */
app.use(
  "/api-docs",
  swaggerUi.serve as unknown as express.RequestHandler,
  swaggerUi.setup(openApiSpec as Record<string, unknown>, {
    customSiteTitle: "NavBot API",
    customCss: ".swagger-ui .topbar { display: none }",
  }) as unknown as express.RequestHandler
);

/** Base URL — browsers and uptime checks often hit `/` first; there is no HTML homepage. */
app.get("/", (_req: express.Request, res: express.Response) => {
  res.json({
    service: "navbot-api",
    ok: true,
    health: "/health",
    docs: "/api-docs",
    api: {
      sites: "/api/sites",
      chat: "/api/chat",
      colors: "/api/colors",
    },
  });
});

app.get("/health", (_req: express.Request, res: express.Response) => {
  res.json({ status: "ok" });
});

app.use("/api/sites", siteRouter);
app.use("/api/sites", syncRouter); // /:siteId/sync routes
app.use("/api/chat", chatRouter);
app.use("/api/colors", colorRouter);

if (sentryEnabled) Sentry.setupExpressErrorHandler(app);

const port = process.env.PORT || 3001;

void initAppDatabase()
  .then(() => {
    app.listen(Number(port), "0.0.0.0", () => {
      console.log(`API server listening on http://0.0.0.0:${port}`);
      startAutoSync();
    });
  })
  .catch((err: unknown) => {
    console.error("[api] Database init failed:", err);
    process.exit(1);
  });

async function gracefulShutdown(signal: string) {
  console.log(`[api] ${signal} — closing headless browser pool…`);
  await shutdownBrowser();
  process.exit(0);
}

process.once("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.once("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("unhandledRejection", (err) => {
  console.error("[api] unhandledRejection:", err);
  if (sentryEnabled) Sentry.captureException(err);
});