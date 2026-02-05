import React from "react";
import { createRoot } from "react-dom/client";
import { ChatWidget } from "./ChatWidget";
import "./styles.css";

// Export component for module usage
export { ChatWidget };

// Auto-init for script tag usage
function init() {
  const container = document.createElement("div");
  container.id = "chat-widget-root";
  document.body.appendChild(container);
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
