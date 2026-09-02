/**
 * The embed code a site owner pastes into their page.
 *
 * Built in three places before this: GetStartedPage, DashboardPage and IntegrationPanel
 * each assembled the same two strings by hand. IntegrationPanel then regex-parsed the
 * `src="..."` back out of the string its caller had just built, purely to recover the
 * widget URL that caller already had — the clearest sign the snippet had no owner.
 */
import type { WidgetTheme } from "@repo/widget-theme";

/**
 * Where the widget bundle is served from, as the customer's page will load it.
 *
 * Checked for emptiness rather than with `??`: an unset key in a .env file arrives as
 * "" rather than undefined, and `??` would happily hand that straight to `src=""`.
 */
export const WIDGET_SCRIPT_URL =
  import.meta.env.VITE_WIDGET_SCRIPT_URL?.trim() ||
  (typeof window !== "undefined"
    ? `${window.location.origin}/chat-widget.iife.js`
    : "/chat-widget.iife.js");

export interface EmbedSnippets {
  /** One-liner to paste into a browser console, for trying it on a live page. */
  consoleCode: string;
  /** The real installation: two script tags, before </body>. */
  scriptTag: string;
}

export function buildEmbedSnippets(params: {
  apiBase: string;
  siteId: string;
  /** Omit to embed with the site's saved theme rather than pinning one in the snippet. */
  theme?: WidgetTheme;
  widgetScriptUrl?: string;
}): EmbedSnippets {
  const { apiBase, siteId, theme, widgetScriptUrl = WIDGET_SCRIPT_URL } = params;

  const configEntries = `apiBase: "${apiBase}", siteId: "${siteId}"`;
  const themeMin = theme ? `,theme:${JSON.stringify(theme)}` : "";

  const consoleCode =
    `(function(){if(document.getElementById("chat-widget-root")){console.log("NavBot already loaded.");return;}` +
    `window.NAVBOT_CONFIG={apiBase:"${apiBase}",siteId:"${siteId}"${themeMin}};` +
    `var s=document.createElement("script");s.src="${widgetScriptUrl}";document.body.appendChild(s);})();`;

  const configBlock = theme
    ? `{\n    apiBase: "${apiBase}",\n    siteId: "${siteId}",\n    theme: ${indent(JSON.stringify(theme, null, 2))}\n  }`
    : `{ ${configEntries} }`;

  const scriptTag =
    `<script>\n  window.NAVBOT_CONFIG = ${configBlock};\n</script>\n` +
    `<script src="${widgetScriptUrl}"></script>`;

  return { consoleCode, scriptTag };
}

/** Re-indent a pretty-printed JSON block to sit inside the config object. */
function indent(json: string): string {
  return json
    .split("\n")
    .map((line, i) => (i === 0 ? line : `    ${line}`))
    .join("\n");
}
