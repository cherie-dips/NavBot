import { useState, useEffect, useCallback } from "react";
import { Palette, RefreshCw, Check, Loader2, AlertCircle, Eye } from "lucide-react";
import { apiFetch } from "../lib/api-fetch";
export interface WidgetTheme {
  primary: string;
  launcherBg: string;
  botBubbleBg: string;
  userBubbleBg: string;
  headerTextColor: string;
  timestampColor: string;
  iconColor: string;
  sendBtnBg: string;
  sendBtnColor: string;
  fontFamily: string;
  widgetOpacity: number;
  /** Shown as a small disclosure link in the widget when set — not required. */
  privacyPolicyUrl?: string;
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
  onThemeChange?: (theme: WidgetTheme) => void;
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
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  widgetOpacity: 0.45,
};

function isLight(hex: string): boolean {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
  } catch {
    return false;
  }
}

function hexIsValid(hex: unknown): hex is string {
  return typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex);
}

function sourceLabel(source: string): string {
  if (source === "css-var-primary") return "Primary";
  if (source === "css-var") return "CSS var";
  if (source === "background") return "Bg";
  if (source === "text") return "Text";
  return source;
}

function WidgetPreview({ theme }: { theme: WidgetTheme }) {
  const textOnLauncher = hexIsValid(theme.launcherBg) && !isLight(theme.launcherBg) ? "#fff" : "#1e293b";
  const opacity = Math.min(1, Math.max(0.2, theme.widgetOpacity || 0.45));
  const panelBg = `rgba(255,255,255,${opacity.toFixed(2)})`;

  return (
    <div
      style={{
        position: "relative",
        width: "320px",
        height: "460px",
        background: "linear-gradient(160deg, #f1f5f9 0%, #e2e8f0 50%, #cbd5e1 100%)",
        borderRadius: "20px",
        overflow: "hidden",
        border: "1px solid #e2e8f0",
        flexShrink: 0,
        fontFamily: theme.fontFamily,
      }}
    >
      {/* Fake page background content */}
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ height: "10px", background: "#cbd5e1", borderRadius: "5px", width: "70%" }} />
        <div style={{ height: "8px", background: "#e2e8f0", borderRadius: "4px", width: "55%" }} />
        <div style={{ height: "8px", background: "#e2e8f0", borderRadius: "4px", width: "45%" }} />
      </div>

      {/* Chat panel */}
      <div
        style={{
          position: "absolute",
          bottom: "52px",
          right: "10px",
          width: "260px",
          height: "360px",
          background: panelBg,
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: "18px",
          boxShadow: "0 20px 40px -8px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: "1px solid rgba(0,0,0,0.04)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: "11px",
              fontStyle: "italic",
              color: theme.headerTextColor,
              fontFamily: "inherit",
            }}
          >
            navbot
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            {/* Refresh icon */}
            <div
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={theme.iconColor} strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
                <path strokeLinecap="round" d="M20.49 9A9 9 0 005.64 5.64L4 9m16 6l-1.64 3.36A9 9 0 013.51 15" />
              </svg>
            </div>
            {/* Close icon */}
            <div
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={theme.iconColor} strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div
          style={{
            flex: 1,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            overflowY: "auto",
          }}
        >
          {/* Bot message */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <div
              style={{
                maxWidth: "80%",
                padding: "7px 10px",
                fontSize: "9px",
                lineHeight: "1.5",
                borderRadius: "2px 10px 10px 10px",
                background: theme.botBubbleBg,
                border: "1px solid rgba(255,255,255,0.25)",
                color: "#334155",
              }}
            >
              Hi there! How can I help you today?
            </div>
            <span style={{ fontSize: "7px", color: theme.timestampColor, marginTop: "3px", opacity: 0.7 }}>
              10:30 AM
            </span>
          </div>

          {/* User message */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div
              style={{
                maxWidth: "80%",
                padding: "7px 10px",
                fontSize: "9px",
                lineHeight: "1.5",
                borderRadius: "10px 2px 10px 10px",
                background: theme.userBubbleBg,
                border: "1px solid rgba(0,0,0,0.06)",
                color: "#1e293b",
                fontWeight: 500,
              }}
            >
              Tell me about the programs
            </div>
            <span style={{ fontSize: "7px", color: theme.timestampColor, marginTop: "3px", opacity: 0.7 }}>
              10:31 AM
            </span>
          </div>

          {/* Bot reply with listen button */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <div
              style={{
                maxWidth: "80%",
                padding: "7px 10px",
                fontSize: "9px",
                lineHeight: "1.5",
                borderRadius: "2px 10px 10px 10px",
                background: theme.botBubbleBg,
                border: "1px solid rgba(255,255,255,0.25)",
                color: "#334155",
              }}
            >
              We offer several programs including…
            </div>
            {/* Listen button preview */}
            <div
              style={{
                marginTop: "3px",
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                padding: "2px 6px",
                borderRadius: "6px",
                background: "rgba(0,0,0,0.04)",
                border: "1px solid rgba(0,0,0,0.06)",
                fontSize: "7px",
                fontWeight: 500,
                color: theme.iconColor,
              }}
            >
              <svg width="8" height="8" fill={theme.iconColor} viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5z" />
              </svg>
              Listen
            </div>
            <span style={{ fontSize: "7px", color: theme.timestampColor, marginTop: "3px", opacity: 0.7 }}>
              10:31 AM
            </span>
          </div>
        </div>

        {/* Input area */}
        <div style={{ padding: "8px 10px 10px", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "rgba(255,255,255,0.2)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "10px",
              padding: "3px 3px 3px 10px",
            }}
          >
            <div
              style={{
                flex: 1,
                fontSize: "8px",
                color: "#94a3b8",
                padding: "4px 0",
              }}
            >
              Type a message…
            </div>
            {/* Voice button */}
            <div
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke={theme.iconColor} strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            {/* Send button */}
            <div
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "6px",
                background: theme.sendBtnBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke={theme.sendBtnColor} strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "10px",
          right: "10px",
          width: "32px",
          height: "32px",
          background: theme.launcherBg,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 6px 16px -3px ${theme.launcherBg}60`,
          border: "1px solid rgba(255,255,255,0.3)",
        }}
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={textOnLauncher} strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span style={{ position: "absolute", top: "-1px", right: "-1px", width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", border: "1.5px solid white" }} />
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
        width: "32px",
        height: "32px",
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
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.transform = "scale(1.08)"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.transform = "scale(1)"; }}
    >
      {selected && (
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Check size={12} color={isLight(entry.hex) ? "#1e293b" : "#fff"} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

const ROLES: { key: keyof WidgetTheme; label: string; description: string; group: string }[] = [
  { key: "primary", label: "Primary / Accent", description: "Main brand color", group: "Brand" },
  { key: "launcherBg", label: "Launcher button", description: "Floating chat icon bg", group: "Brand" },
  { key: "headerTextColor", label: "Header text", description: "Panel title color", group: "Brand" },
  { key: "botBubbleBg", label: "Bot bubble", description: "Bot message background", group: "Messages" },
  { key: "userBubbleBg", label: "User bubble", description: "User message background", group: "Messages" },
  { key: "timestampColor", label: "Timestamp", description: "Message time text", group: "Messages" },
  { key: "iconColor", label: "Icons", description: "Refresh, close, mic, listen", group: "Controls" },
  { key: "sendBtnBg", label: "Send button bg", description: "Send button background", group: "Controls" },
  { key: "sendBtnColor", label: "Send button icon", description: "Send button arrow color", group: "Controls" },
];

type ColorRole = typeof ROLES[number]["key"];

const FONT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "System Sans", value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  { label: "Inter", value: 'Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' },
  { label: "Poppins", value: 'Poppins, "Segoe UI", Roboto, Arial, sans-serif' },
  { label: "Roboto", value: 'Roboto, "Segoe UI", Arial, sans-serif' },
  { label: "Open Sans", value: '"Open Sans", "Segoe UI", Roboto, Arial, sans-serif' },
  { label: "Lato", value: 'Lato, "Segoe UI", Roboto, Arial, sans-serif' },
  { label: "Montserrat", value: 'Montserrat, "Segoe UI", Roboto, Arial, sans-serif' },
  { label: "Merriweather", value: 'Merriweather, Georgia, serif' },
];

export function ColorThemePicker({
  siteId,
  siteUrl,
  userId,
  apiBase,
  initialTheme,
  onSave,
  onThemeChange,
}: ColorThemePickerProps) {
  // Build palette swatches from saved theme so user always sees their colors
  const themeToPalette = (t: WidgetTheme): SitePalette => {
    const seen = new Set<string>();
    const entries: ColorEntry[] = [];
    for (const role of ROLES) {
      const val = t[role.key];
      const hex = hexIsValid(val) ? val : null;
      if (hex && !seen.has(hex)) {
        seen.add(hex);
        entries.push({ hex, source: "saved", frequency: 1, luminance: 0 });
      }
    }
    return { primary: t.primary, palette: entries, cssVars: {} };
  };

  const [palette, setPalette] = useState<SitePalette | null>(
    initialTheme ? themeToPalette({ ...DEFAULT_THEME, ...initialTheme }) : null
  );
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [theme, setTheme] = useState<WidgetTheme>(initialTheme ? { ...DEFAULT_THEME, ...initialTheme } : DEFAULT_THEME);
  useEffect(() => {
    onThemeChange?.(theme);
  }, [theme, onThemeChange]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<ColorRole>("primary");

  const extractFromSite = useCallback(async () => {
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch(`${apiBase}/api/colors?url=${encodeURIComponent(siteUrl)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Color extraction failed");
      setPalette(data as SitePalette);
    } catch (err: any) {
      setExtractError(err?.message || "Could not extract colors");
    } finally {
      setExtracting(false);
    }
  }, [apiBase, siteUrl]);

  // Only auto-extract on first-ever visit (no saved theme yet)
  useEffect(() => {
    if (!initialTheme) {
      (async () => {
        setExtracting(true);
        try {
          const res = await fetch(`${apiBase}/api/colors?url=${encodeURIComponent(siteUrl)}`);
          const data = await res.json();
          if (res.ok) {
            setPalette(data as SitePalette);
            setTheme((prev) => ({
              ...prev,
              primary: data.primary,
              launcherBg: data.primary,
              headerTextColor: data.primary,
              sendBtnBg: data.primary,
            }));
          }
        } catch { /* ignore */ }
        finally { setExtracting(false); }
      })();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setColor = (role: ColorRole, hex: string) => {
    setTheme((prev) => {
      const next = { ...prev, [role]: hex };
      if (role === "primary") {
        next.launcherBg = hex;
        next.sendBtnBg = hex;
      }
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch(
        `${apiBase}/api/sites/${encodeURIComponent(siteId)}/theme?userId=${encodeURIComponent(userId)}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(theme) }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Save failed");
      setSaved(true);
      setPalette(themeToPalette(theme));
      onSave?.(theme);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setSaveError(err?.message || "Could not save theme");
    } finally {
      setSaving(false);
    }
  };

  const groups = ["Brand", "Messages", "Controls"] as const;

  return (
    <div className="space-y-6">
      {/* Section title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#478EDB]/10 flex items-center justify-center">
            <Palette className="w-4 h-4 text-[#478EDB]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#2E3538]">Widget Theme</h3>
            <p className="text-xs text-slate-400">Customize every element to match your brand</p>
          </div>
        </div>
        <button
          onClick={extractFromSite}
          disabled={extracting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-[#478EDB] hover:bg-[#478EDB]/5 transition-colors disabled:opacity-50"
          title="Re-extract colors from the website"
        >
          <RefreshCw className={`w-3 h-3 ${extracting ? "animate-spin" : ""}`} />
          Re-extract from site
        </button>
      </div>

      {/* Main layout: preview left, controls right */}
      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Live Preview */}
        <div className="space-y-2 flex-shrink-0">
          <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Live Preview
          </p>
          <WidgetPreview theme={theme} />
        </div>

        {/* Controls column */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Color palette */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">
              {palette?.palette.some((e) => e.source === "saved") ? "Saved Colors" : "Site Palette"}
              {palette && <span className="ml-1 text-slate-400">— {palette.palette.length} colors</span>}
            </p>
            {extracting && (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Scanning {siteUrl}…
              </div>
            )}
            {extractError && (
              <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle className="w-3 h-3 flex-shrink-0" /> {extractError}
              </div>
            )}
            {palette && !extracting && (
              <div className="flex flex-wrap gap-1.5">
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

          {/* Role selector grouped */}
          <div className="bg-[#F9F9FA] rounded-xl p-4 space-y-4">
            <p className="text-xs font-medium text-slate-600">
              Select a role, then pick a color from the palette or type a hex value
            </p>

            {groups.map((group) => (
              <div key={group} className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {ROLES.filter((r) => r.group === group).map((role) => (
                    <button
                      key={role.key}
                      onClick={() => setActiveRole(role.key)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all ${
                        activeRole === role.key
                          ? "bg-white shadow-sm border border-[#478EDB]/20 ring-1 ring-[#478EDB]/10"
                          : "hover:bg-white/60 border border-transparent"
                      }`}
                    >
                      <div
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "5px",
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
              </div>
            ))}

            {/* Hex input for active role */}
            <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
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
                        setTheme((prev) => ({ ...prev, primary: v, launcherBg: v, sendBtnBg: v }));
                      }
                      setSaved(false);
                    }
                  }}
                  placeholder="#000000 or rgba(…)"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 focus:border-[#478EDB] outline-none text-sm text-[#2E3538] font-mono"
                />
              </div>
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

            <div className="grid grid-cols-1 gap-3 pt-2 border-t border-slate-100 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Text font
                </label>
                <select
                  value={theme.fontFamily}
                  onChange={(e) => {
                    setTheme((prev) => ({ ...prev, fontFamily: e.target.value }));
                    setSaved(false);
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#2E3538] outline-none focus:border-[#478EDB]"
                >
                  {FONT_OPTIONS.map((font) => (
                    <option key={font.label} value={font.value}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Transparency ({Math.round((1 - theme.widgetOpacity) * 100)}%)
                </label>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-medium text-slate-500">
                    <span>0%</span>
                    <span>80%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    step={1}
                    value={Math.round((1 - theme.widgetOpacity) * 100)}
                    onChange={(e) => {
                      const transparencyPct = Number(e.target.value);
                      const clampedPct = Math.max(0, Math.min(80, Number.isFinite(transparencyPct) ? transparencyPct : 0));
                      const opacity = 1 - clampedPct / 100;
                      setTheme((prev) => ({
                        ...prev,
                        widgetOpacity: Number(opacity.toFixed(2)),
                      }));
                      setSaved(false);
                    }}
                    className="w-full accent-[#478EDB]"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Privacy policy URL (optional)
              </label>
              <input
                type="url"
                placeholder="https://yoursite.com/privacy"
                value={theme.privacyPolicyUrl ?? ""}
                onChange={(e) => {
                  setTheme((prev) => ({ ...prev, privacyPolicyUrl: e.target.value || undefined }));
                  setSaved(false);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#2E3538] outline-none focus:border-[#478EDB]"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                When set, the widget shows a small link to it so visitors know their messages are processed by AI.
              </p>
            </div>
          </div>

          {/* Reset + Save row */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div>
              {palette && (
                <button
                  onClick={() =>
                    setTheme((prev) => ({
                      ...prev,
                      primary: palette.primary,
                      launcherBg: palette.primary,
                      headerTextColor: palette.primary,
                      sendBtnBg: palette.primary,
                    }))
                  }
                  className="text-xs text-[#478EDB] hover:underline"
                >
                  ↺ Reset to auto-detected ({palette.primary})
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {saveError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {saveError}
                </p>
              )}
              {saved && !saveError && (
                <p className="text-xs text-green-600">Saved!</p>
              )}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
