import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

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
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serveChatWidget()],
});
