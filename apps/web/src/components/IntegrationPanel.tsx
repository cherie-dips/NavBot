import { useState } from "react";
import { ColorThemePicker, type WidgetTheme } from "./ColorThemePicker";

interface IntegrationPanelProps {
  info: {
    siteId: string;
    url: string;
    consoleCode: string;
    scriptTag: string;
  };
  userId?: string;
  apiBase?: string;
  initialTheme?: WidgetTheme | null;
}

function buildSnippets(
  siteId: string,
  url: string,
  apiBase: string,
  widgetScriptUrl: string,
  theme: WidgetTheme
) {
  const themeJson = JSON.stringify(theme);
  const consoleCode =
    `(function(){if(document.getElementById("chat-widget-root")){console.log("NavBot already loaded.");return;}` +
    `window.NAVBOT_CONFIG={apiBase:"${apiBase}",siteId:"${siteId}",theme:${themeJson}};` +
    `var s=document.createElement("script");s.src="${widgetScriptUrl}";s.crossOrigin="anonymous";document.body.appendChild(s);})();`;

  const scriptTag =
    `<script>\n  window.NAVBOT_CONFIG = {\n    apiBase: "${apiBase}",\n    siteId: "${siteId}",\n    theme: ${themeJson}\n  };\n</script>\n` +
    `<script src="${widgetScriptUrl}" crossorigin="anonymous"></script>`;

  return { consoleCode, scriptTag };
}

export const IntegrationPanel = ({
  info,
  userId = "",
  apiBase = "http://localhost:3001",
  initialTheme = null,
}: IntegrationPanelProps) => {
  const [theme, setTheme] = useState<WidgetTheme>(
    initialTheme ?? {
      primary: "#2E3538",
      launcherBg: "#2E3538",
      botBubbleBg: "rgba(255,255,255,0.4)",
      userBubbleBg: "rgba(0,0,0,0.06)",
      headerTextColor: "#2E3538",
    }
  );

  // Derive widget script URL from the existing snippet (extract src)
  const widgetSrcMatch = info.scriptTag.match(/src="([^"]+chat-widget[^"]+)"/);
  const widgetScriptUrl = widgetSrcMatch?.[1] ?? `${window.location.origin}/chat-widget.iife.js`;

  const { consoleCode, scriptTag } = buildSnippets(
    info.siteId,
    info.url,
    apiBase,
    widgetScriptUrl,
    theme
  );

  return (
    <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-100 shadow-lg shadow-[#8691CA]/10 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#478EDB] uppercase tracking-wide mb-1">
            Integration ready
          </p>
          <h2 className="font-serif text-xl font-light text-[#2E3538]">
            Embed NavBot on <span className="font-medium">{info.url}</span>
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          Site ID: <span className="font-mono text-slate-700">{info.siteId}</span>
        </p>
      </div>

      {/* ── Color Theme Picker ────────────────────────────────────────────── */}
      <div className="border-t border-slate-50 pt-6">
        <ColorThemePicker
          siteId={info.siteId}
          siteUrl={info.url}
          userId={userId}
          apiBase={apiBase}
          initialTheme={initialTheme}
          onSave={setTheme}
        />
      </div>

      {/* ── Code Snippets (update in real-time with theme) ─────────────────── */}
      <div className="flex flex-col gap-6 border-t border-slate-50 pt-6">
        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-600">JavaScript (console)</span>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] text-slate-800 font-mono whitespace-pre-wrap break-words select-all">
            {consoleCode}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-600">HTML</span>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] text-slate-800 font-mono whitespace-pre-wrap break-words select-all">
            {scriptTag}
          </div>
        </div>

        <p className="text-xs text-slate-400">
          ✓ Theme colors are embedded in the config — no extra requests needed by the widget.
        </p>
      </div>
    </div>
  );
};