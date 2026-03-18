

import { useState, useEffect, useCallback } from "react";
import { Palette, RefreshCw, Check, Loader2, AlertCircle, Eye } from "lucide-react";


export interface WidgetTheme {
  primary: string;
  launcherBg: string;
  botBubbleBg: string;
  userBubbleBg: string;
  headerTextColor: string;
}

interface ColorEntry {
  hex: string;
  source: string;
  frequency: number;
  luminance: number;
}

interface SitePalette {
  primary: string;
  palette: ColorEntry[];
  cssVars: Record<string, string>;
}

interface ColorThemePickerProps {
  siteId: string;
  siteUrl: string;
  userId: string;
  apiBase: string;
  initialTheme?: WidgetTheme | null;
  onSave?: (theme: WidgetTheme) => void;
}


const DEFAULT_THEME: WidgetTheme = {
  primary: "#2E3538",
  launcherBg: "#2E3538",
  botBubbleBg: "rgba(255,255,255,0.4)",
  userBubbleBg: "rgba(0,0,0,0.06)",
  headerTextColor: "#2E3538",
};


function isLight(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6;
}

function hexIsValid(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}


function sourceLabel(source: string): string {
  if (source === "css-var-primary") return "Primary var";
  if (source === "css-var") return "CSS var";
  if (source === "background") return "Background";
  if (source === "text") return "Text";
  return source;
}


function WidgetPreview({ theme }: { theme: WidgetTheme }) {
  const textOnPrimary = isLight(theme.primary) ? "#1e293b" : "#ffffff";
  return (
    <div
      style={{
        position: "relative",
        width: "200px",
        height: "160px",
        background: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
        borderRadius: "16px",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ height: "8px", background: "#cbd5e1", borderRadius: "4px", width: "80%" }} />
        <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "4px", width: "60%" }} />
        <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "4px", width: "70%" }} />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "40px",
          right: "8px",
          width: "110px",
          height: "76px",
          background: "rgba(255,255,255,0.7)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: "12px",
          padding: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          boxShadow: "0 8px 24px -4px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }}>
          <span
            style={{
              fontSize: "9px",
              fontStyle: "italic",
              fontWeight: 600,
              color: theme.headerTextColor,
              fontFamily: "Georgia, serif",
            }}
          >
            navbot
          </span>
        </div>
        <div
          style={{
            background: theme.botBubbleBg,
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: "2px 8px 8px 8px",
            padding: "3px 6px",
            fontSize: "7px",
            color: "#475569",
            alignSelf: "flex-start",
            maxWidth: "80%",
          }}
        >
          Hi! How can I help?
        </div>

        <div
          style={{
            background: theme.userBubbleBg,
            border: "1px solid rgba(0,0,0,0.06)",
            borderRadius: "8px 2px 8px 8px",
            padding: "3px 6px",
            fontSize: "7px",
            color: "#1e293b",
            alignSelf: "flex-end",
            maxWidth: "75%",
            fontWeight: 500,
          }}
        >
          Tell me more
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "8px",
          right: "8px",
          width: "28px",
          height: "28px",
          background: theme.launcherBg,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 4px 12px -2px ${theme.launcherBg}80`,
        }}
      >
        <svg
          width="12"
          height="12"
          fill="none"
          viewBox="0 0 24 24"
          stroke={textOnPrimary}
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
    </div>
  );
}

function Swatch({
  entry,
  selected,
  onClick,
}: {
  entry: ColorEntry;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`${entry.hex} (${sourceLabel(entry.source)}, ×${entry.frequency})`}
      style={{
        width: "36px",
        height: "36px",
        borderRadius: "8px",
        background: entry.hex,
        border: selected ? "3px solid #2E3538" : "2px solid transparent",
        outline: selected ? "2px solid white" : "1px solid rgba(0,0,0,0.1)",
        outlineOffset: selected ? "-4px" : "0",
        cursor: "pointer",
        position: "relative",
        transition: "transform 0.15s, box-shadow 0.15s",
        boxShadow: selected ? `0 0 0 3px ${entry.hex}40` : "none",
        transform: selected ? "scale(1.1)" : "scale(1)",
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.transform = "scale(1.08)";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {selected && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check
            size={14}
            color={isLight(entry.hex) ? "#1e293b" : "#fff"}
            strokeWidth={3}
          />
        </span>
      )}
    </button>
  );
}


export function ColorThemePicker({
  siteId,
  siteUrl,
  userId,
  apiBase,
  initialTheme,
  onSave,
}: ColorThemePickerProps) {
  const [palette, setPalette] = useState<SitePalette | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [theme, setTheme] = useState<WidgetTheme>(initialTheme ?? DEFAULT_THEME);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [activeRole, setActiveRole] = useState<keyof WidgetTheme>("primary");

  const extractPalette = useCallback(async () => {
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/colors?url=${encodeURIComponent(siteUrl)}`
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error || "Color extraction failed");
      setPalette(data as SitePalette);
      // Auto-apply primary if user hasn't customised yet
      if (!initialTheme) {
        setTheme((prev) => ({
          ...prev,
          primary: data.primary,
          launcherBg: data.primary,
          headerTextColor: data.primary,
        }));
      }
    } catch (err: any) {
      setExtractError(err?.message || "Could not extract colors");
    } finally {
      setExtracting(false);
    }
  }, [apiBase, siteUrl, initialTheme]);

  useEffect(() => {
    extractPalette();
  }, [extractPalette]);

  const setColor = (role: keyof WidgetTheme, hex: string) => {
    setTheme((prev) => {
      const next = { ...prev, [role]: hex };
      // Sync launcher bg to primary by default
      if (role === "primary") next.launcherBg = hex;
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/sites/${encodeURIComponent(siteId)}/theme?userId=${encodeURIComponent(userId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(theme),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Save failed");
      setSaved(true);
      onSave?.(theme);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setSaveError(err?.message || "Could not save theme");
    } finally {
      setSaving(false);
    }
  };

  const ROLES: { key: keyof WidgetTheme; label: string; description: string }[] = [
    { key: "primary", label: "Accent / Primary", description: "Links, highlights, send button" },
    { key: "launcherBg", label: "Launcher button", description: "Floating chat button background" },
    { key: "headerTextColor", label: "Header text", description: "Panel title color" },
    { key: "botBubbleBg", label: "Bot bubble", description: "Bot message background" },
    { key: "userBubbleBg", label: "User bubble", description: "Visitor message background" },
  ];

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#478EDB]/10 flex items-center justify-center">
            <Palette className="w-4 h-4 text-[#478EDB]" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-[#2E3538]">Widget Theme</h3>
            <p className="text-xs text-slate-400">Customize the chatbot colors to match your brand</p>
          </div>
        </div>
        <button
          onClick={extractPalette}
          disabled={extracting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-[#478EDB] hover:bg-[#478EDB]/5 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${extracting ? "animate-spin" : ""}`} />
          Re-extract
        </button>
      </div>

      {/* Preview + Palette side by side */}
      <div className="flex gap-4 flex-wrap">
        {/* Preview */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500 flex items-center gap-1">
            <Eye className="w-3 h-3" /> Live preview
          </p>
          <WidgetPreview theme={theme} />
        </div>

        {/* Palette swatches */}
        <div className="flex-1 min-w-0 space-y-3">
          <p className="text-xs font-medium text-slate-500">
            Extracted palette
            {palette && (
              <span className="ml-1 text-slate-400">
                — {palette.palette.length} colors found
              </span>
            )}
          </p>
          {extracting && (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Scanning {siteUrl}…
            </div>
          )}
          {extractError && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {extractError}
            </div>
          )}
          {palette && !extracting && (
            <div className="flex flex-wrap gap-2">
              {palette.palette.map((entry) => (
                <Swatch
                  key={entry.hex}
                  entry={entry}
                  selected={theme[activeRole] === entry.hex}
                  onClick={() => setColor(activeRole, entry.hex)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Role selector + hex input */}
      <div className="bg-[#F9F9FA] rounded-xl p-4 space-y-3">
        <p className="text-xs font-medium text-slate-600">
          Select a color role, then click a swatch above or type a hex value
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ROLES.map((role) => (
            <button
              key={role.key}
              onClick={() => setActiveRole(role.key)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                activeRole === role.key
                  ? "bg-white shadow-sm border border-[#478EDB]/20"
                  : "hover:bg-white/60"
              }`}
            >
              {/* Swatch preview */}
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "6px",
                  background: theme[role.key],
                  border: "1px solid rgba(0,0,0,0.08)",
                  flexShrink: 0,
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#2E3538] truncate">{role.label}</p>
                <p className="text-[10px] text-slate-400 truncate">{role.description}</p>
              </div>
              {activeRole === role.key && (
                <div className="w-1.5 h-1.5 rounded-full bg-[#478EDB] flex-shrink-0" />
              )}
            </button>
          ))}
        </div>

        {/* Hex input for active role */}
        <div className="flex items-center gap-3 pt-1">
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: hexIsValid(theme[activeRole]) ? theme[activeRole] : "#e2e8f0",
              border: "1px solid rgba(0,0,0,0.1)",
              flexShrink: 0,
            }}
          />
          <div className="flex-1">
            <input
              type="text"
              value={theme[activeRole]}
              onChange={(e) => {
                const v = e.target.value;
                setTheme((prev) => ({ ...prev, [activeRole]: v }));
                if (hexIsValid(v)) {
                  if (activeRole === "primary") {
                    setTheme((prev) => ({ ...prev, primary: v, launcherBg: v }));
                  }
                  setSaved(false);
                }
              }}
              placeholder="#000000 or rgba(…)"
              className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 focus:border-[#478EDB] outline-none text-sm text-[#2E3538] font-mono"
            />
          </div>
          {/* Native color picker as secondary UI */}
          <label
            title="Open color picker"
            className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center cursor-pointer bg-white hover:border-[#478EDB] transition-colors overflow-hidden"
          >
            <input
              type="color"
              value={hexIsValid(theme[activeRole]) ? theme[activeRole] : "#2e3538"}
              onChange={(e) => setColor(activeRole, e.target.value)}
              className="opacity-0 absolute"
              style={{ width: 0, height: 0 }}
            />
            <div
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "4px",
                background: hexIsValid(theme[activeRole]) ? theme[activeRole] : "#e2e8f0",
              }}
            />
          </label>
        </div>
      </div>

      {/* Reset to extracted primary */}
      {palette && (
        <button
          onClick={() =>
            setTheme((prev) => ({
              ...prev,
              primary: palette.primary,
              launcherBg: palette.primary,
              headerTextColor: palette.primary,
            }))
          }
          className="text-xs text-[#478EDB] hover:underline"
        >
          ↺ Reset to auto-detected primary ({palette.primary})
        </button>
      )}

      {/* Save */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2E3538] text-white text-sm font-medium hover:bg-[#478EDB] transition-colors disabled:opacity-50"
        >
          {saving ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
          ) : saved ? (
            <><Check className="w-3.5 h-3.5 text-green-400" /> Saved!</>
          ) : (
            "Save theme"
          )}
        </button>
        {saveError && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {saveError}
          </p>
        )}
        {saved && !saveError && (
          <p className="text-xs text-green-600">Theme saved — update your integration snippet to include the theme config.</p>
        )}
      </div>
    </div>
  );
}
