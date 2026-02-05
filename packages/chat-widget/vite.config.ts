import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss(), cssInjectedByJsPlugin()],
  build: {
    lib: {
      entry: "src/index.tsx",
      name: "ChatWidget",
      formats: ["es", "umd", "iife"],
      fileName: (format) => `chat-widget.${format === "es" ? "js" : format + ".js"}`,
    },
    rollupOptions: {
      // Bundle everything for IIFE (script tag)
      output: {
        globals: {},
      },
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
