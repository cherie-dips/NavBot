import { useState } from "react";
import { Code, Terminal, Globe } from "lucide-react";
import { ColorThemePicker } from "./ColorThemePicker";
import { DEFAULT_THEME, type WidgetTheme } from "@repo/widget-theme";
import { buildEmbedSnippets } from "../lib/embed-snippet";

interface IntegrationPanelProps {
  /** The site being embedded. The snippet is derived, not passed in. */
  info: {
    siteId: string;
    url: string;
  };
  apiBase?: string;
  initialTheme?: WidgetTheme | null;
}

export const IntegrationPanel = ({
  info,
  apiBase = "http://localhost:3001",
  initialTheme = null,
}: IntegrationPanelProps) => {
  const [theme, setTheme] = useState<WidgetTheme>(initialTheme ? { ...DEFAULT_THEME, ...initialTheme } : DEFAULT_THEME);
  const [activeTab, setActiveTab] = useState<"theme" | "code">("theme");

  // The snippet is rebuilt here rather than taken from `info`, because it has to track
  // the theme the owner is editing on this screen.
  const { consoleCode, scriptTag } = buildEmbedSnippets({
    apiBase,
    siteId: info.siteId,
    theme,
  });

  const tabs = [
    { id: "theme" as const, label: "Customize Theme", icon: Globe },
    { id: "code" as const, label: "Integration Code", icon: Code },
  ];

  return (
    <div className="space-y-6">
      <div className="section-shell overflow-hidden rounded-[2rem] p-6">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[10%] top-[16%] h-28 w-28 rounded-full bg-[#f2d4b8]/35 blur-3xl" />
          <div className="absolute bottom-[10%] right-[12%] h-32 w-32 rounded-full bg-[#dbe5f1]/45 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#bc6c25]">
              Integration Ready
            </p>
            <h2 className="font-display text-xl font-light text-[#1f2522]">
              Embed NavBot on <span className="font-semibold">{info.url}</span>
            </h2>
          </div>
          <div className="rounded-lg bg-[#fbfaf7] px-3 py-1.5 font-mono text-xs text-[#65726d]">
            ID: {info.siteId}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-[#1f2522] text-white shadow-md"
                  : "border border-[#1f2522]/8 bg-white/80 text-[#65726d] hover:border-[#bc6c25]/30 hover:text-[#1f2522]"
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
        <div className="section-shell overflow-hidden rounded-[2rem] p-6 md:p-8">
          <ColorThemePicker
            siteId={info.siteId}
            siteUrl={info.url}
            apiBase={apiBase}
            initialTheme={initialTheme}
            onSave={setTheme}
            onThemeChange={setTheme}
          />
        </div>
      )}

      {activeTab === "code" && (
        <div className="space-y-4">
          <div className="section-shell overflow-hidden rounded-[2rem] p-6 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f6eee3]">
                <Terminal className="h-4 w-4 text-[#bc6c25]" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-[#1f2522]">Browser Console</h4>
                <p className="text-xs text-[#8a938f]">Paste in DevTools to test instantly</p>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-2xl border border-[#1f2522]/8 bg-[#fbfaf7] px-4 py-3 font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap text-[#5f6b67] select-all">
              {consoleCode}
            </div>
          </div>

          <div className="section-shell overflow-hidden rounded-[2rem] p-6 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#edf2f7]">
                <Code className="h-4 w-4 text-[#456a92]" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-[#1f2522]">HTML Script Tag</h4>
                <p className="text-xs text-[#8a938f]">Add before the closing &lt;/body&gt; tag</p>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-2xl border border-[#1f2522]/8 bg-[#fbfaf7] px-4 py-3 font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap text-[#5f6b67] select-all">
              {scriptTag}
            </div>
          </div>

          <p className="py-1 text-center text-xs text-[#8a938f]">
            Theme colors are embedded in the config — no extra requests needed by the widget.
          </p>
        </div>
      )}
    </div>
  );
};
