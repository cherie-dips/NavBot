import { useState } from "react";
import { Code, Terminal, Globe } from "lucide-react";
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

const DEFAULT_THEME: WidgetTheme = {
  primary: "#2E3538",
  launcherBg: "#2E3538",
  botBubbleBg: "rgba(255,255,255,0.4)",
  userBubbleBg: "rgba(0,0,0,0.06)",
  headerTextColor: "#2E3538",
  timestampColor: "#94a3b8",
  iconColor: "#94a3b8",
  sendBtnBg: "#2E3538",
  sendBtnColor: "#ffffff",
};

function buildSnippets(
  siteId: string,
  _url: string,
  apiBase: string,
  widgetScriptUrl: string,
  theme: WidgetTheme
) {
  const themeJson = JSON.stringify(theme, null, 2);
  const themeJsonMinified = JSON.stringify(theme);

  const consoleCode =
    `(function(){if(document.getElementById("chat-widget-root")){console.log("NavBot already loaded.");return;}` +
    `window.NAVBOT_CONFIG={apiBase:"${apiBase}",siteId:"${siteId}",theme:${themeJsonMinified}};` +
    `var s=document.createElement("script");s.src="${widgetScriptUrl}";s.crossOrigin="anonymous";document.body.appendChild(s);})();`;

  const scriptTag =
    `<script>\n  window.NAVBOT_CONFIG = {\n    apiBase: "${apiBase}",\n    siteId: "${siteId}",\n    theme: ${themeJson.split("\n").map((l, i) => (i === 0 ? l : "    " + l)).join("\n")}\n  };\n</script>\n` +
    `<script src="${widgetScriptUrl}" crossorigin="anonymous"></script>`;

  return { consoleCode, scriptTag };
}

export const IntegrationPanel = ({
  info,
  userId = "",
  apiBase = "http://localhost:3001",
  initialTheme = null,
}: IntegrationPanelProps) => {
  const [theme, setTheme] = useState<WidgetTheme>(initialTheme ?? DEFAULT_THEME);
  const [activeTab, setActiveTab] = useState<"theme" | "code">("theme");

  const widgetSrcMatch = info.scriptTag.match(/src="([^"]+chat-widget[^"]+)"/);
  const widgetScriptUrl = widgetSrcMatch?.[1] ?? `${window.location.origin}/chat-widget.iife.js`;

  const { consoleCode, scriptTag } = buildSnippets(
    info.siteId,
    info.url,
    apiBase,
    widgetScriptUrl,
    theme
  );

  const tabs = [
    { id: "theme" as const, label: "Customize Theme", icon: Globe },
    { id: "code" as const, label: "Integration Code", icon: Code },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#478EDB] uppercase tracking-wider mb-1">
              Integration Ready
            </p>
            <h2 className="font-serif text-xl font-light text-[#2E3538]">
              Embed NavBot on <span className="font-semibold">{info.url}</span>
            </h2>
          </div>
          <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-1.5 font-mono">
            ID: {info.siteId}
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-[#2E3538] text-white shadow-md"
                  : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "theme" && (
        <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-100 shadow-sm">
          <ColorThemePicker
            siteId={info.siteId}
            siteUrl={info.url}
            userId={userId}
            apiBase={apiBase}
            initialTheme={initialTheme}
            onSave={setTheme}
          />
        </div>
      )}

      {activeTab === "code" && (
        <div className="space-y-4">
          {/* Console snippet */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <Terminal className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-[#2E3538]">Browser Console</h4>
                <p className="text-xs text-slate-400">Paste in DevTools to test instantly</p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] text-slate-700 font-mono whitespace-pre-wrap break-words select-all leading-relaxed max-h-48 overflow-y-auto">
              {consoleCode}
            </div>
          </div>

          {/* HTML snippet */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Code className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-[#2E3538]">HTML Script Tag</h4>
                <p className="text-xs text-slate-400">Add before the closing &lt;/body&gt; tag</p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] text-slate-700 font-mono whitespace-pre-wrap break-words select-all leading-relaxed max-h-64 overflow-y-auto">
              {scriptTag}
            </div>
          </div>

          <p className="text-xs text-slate-400 text-center py-1">
            Theme colors are embedded in the config — no extra requests needed by the widget.
          </p>
        </div>
      )}
    </div>
  );
};
