import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const widgetDist = path.join(repoRoot, "packages/chat-widget/dist/chat-widget.iife.js");
const webPublic = path.resolve(__dirname, "../public");
const dest = path.join(webPublic, "chat-widget.iife.js");

if (!fs.existsSync(widgetDist)) {
  console.warn(
    "[copy-widget] chat-widget.iife.js not found. Run `pnpm --filter @repo/chat-widget build` first."
  );
  process.exit(0);
}

fs.mkdirSync(webPublic, { recursive: true });
fs.copyFileSync(widgetDist, dest);
console.log("[copy-widget] Copied chat-widget.iife.js → apps/web/public/");
