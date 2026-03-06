# Testing the chatbot on Plaksha (dev mode)

## 1. Start services

In one terminal:
```bash
pnpm --filter api dev
```

In another terminal (from repo root):
```bash
pnpm exec turbo run build --filter=@repo/chat-widget
pnpm dev
```
This builds the widget and starts the web app so the widget script is served at `http://localhost:5173/chat-widget.iife.js`.

## 2. Open Plaksha website

Go to **https://plaksha.edu.in** (or any page on that site).

## 3. Paste this in the browser console

Open DevTools (F12 or Cmd+Option+J) → **Console** tab, then paste and press Enter:

```javascript
(function() {
  if (document.getElementById("chat-widget-root")) {
    console.log("NavBot already loaded.");
    return;
  }
  window.NAVBOT_CONFIG = {
    apiBase: "http://localhost:3001",
    siteId: "plaksha"
  };
  var s = document.createElement("script");
  s.src = "http://localhost:5173/chat-widget.iife.js";
  s.crossOrigin = "anonymous";
  s.onload = function() { console.log("NavBot chat widget loaded."); };
  s.onerror = function() { console.error("Failed to load widget. Is pnpm dev running and chat-widget built?"); };
  document.body.appendChild(s);
})();
```

The chat bubble should appear on the page. Use it to send a message; the request goes to your local API and RAG over the indexed Plaksha content.

**If the widget doesn’t load:** ensure the API is running on port 3001 and the web app (with widget) on 5173, and that you’ve run the chat-widget build once so `packages/chat-widget/dist/chat-widget.iife.js` exists.
