import React from "react";
import { createRoot } from "react-dom/client";
import { ChatWidget } from "./ChatWidget";
import "./styles.css";

// Export component for module usage
export { ChatWidget };

// ---------------------------------------------------------------------------
// Auto-init for script tag usage.
// Reads window.NAVBOT_CONFIG.siteId if set, otherwise falls back to hostname.
// The siteId is used as the localStorage key so history is scoped per site
// and survives page navigations and refreshes.
// ---------------------------------------------------------------------------
function init() {
  const siteId =
    window.NAVBOT_CONFIG?.siteId || window.location.hostname || "unknown-site";

  const container = document.createElement("div");
  container.id = "chat-widget-root";
  document.body.appendChild(container);

  // ChatWidget reads siteId from window.NAVBOT_CONFIG internally,
  // but setting it here ensures it's available before the component mounts.
  if (!window.NAVBOT_CONFIG) {
    window.NAVBOT_CONFIG = {};
  }
  if (!window.NAVBOT_CONFIG.siteId) {
    window.NAVBOT_CONFIG.siteId = siteId;
  }

  createRoot(container).render(<ChatWidget />);
}

// Auto-initialize when DOM is ready
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}