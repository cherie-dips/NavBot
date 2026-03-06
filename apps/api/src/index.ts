import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { json, urlencoded } from "express";

import { router as siteRouter } from "./routes/sites";
import { router as chatRouter } from "./routes/chat";

const app = express();

app.use(
  cors({
    origin: "*",
  })
);
app.use(morgan("dev"));
app.use(json({ limit: "10mb" }));
app.use(urlencoded({ extended: true, limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/sites", siteRouter);
app.use("/api/chat", chatRouter);

const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});

