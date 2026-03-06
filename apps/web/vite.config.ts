import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Plugin to serve chat-widget dist file
function serveChatWidget(): Plugin {
  return {
    name: "serve-chat-widget",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/chat-widget.iife.js") {
          const filePath = path.resolve(
            __dirname,
            "../../packages/chat-widget/dist/chat-widget.iife.js"
          );
          if (fs.existsSync(filePath)) {
            res.setHeader("Content-Type", "application/javascript");
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            res.setHeader("Access-Control-Allow-Origin", "*");
            fs.createReadStream(filePath).pipe(res);
            return;
          } else {
            console.error("Chat widget file not found at:", filePath);
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serveChatWidget(), tailwindcss()],
});
