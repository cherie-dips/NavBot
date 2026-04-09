import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { json, urlencoded } from "express";
import swaggerUi from "swagger-ui-express";

import { router as siteRouter } from "./routes/sites";
import { router as chatRouter } from "./routes/chat";
import { router as colorRouter } from "./routes/colors";
import { router as syncRouter } from "./routes/sync";
import { startAutoSync } from "./services/auto-sync";
import { openApiSpec } from "./openapi/openapi-spec";

const app = express();

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

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/sites", siteRouter);
app.use("/api/sites", syncRouter); // /:siteId/sync routes
app.use("/api/chat", chatRouter);
app.use("/api/colors", colorRouter);

const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
  startAutoSync();
});