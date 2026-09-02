/**
 * Reading the host page's NAVBOT_CONFIG and resolving it into a usable theme.
 */
import { DEFAULT_THEME } from "@repo/widget-theme";
import type { ResolvedWidgetTheme, WidgetTheme } from "./types";

export const GOOGLE_FONT_MAP: Record<string, { family: string; stack: string }> = {
  inter:        { family: "Inter",        stack: 'Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' },
  poppins:      { family: "Poppins",      stack: 'Poppins, "Segoe UI", Roboto, Arial, sans-serif' },
  roboto:       { family: "Roboto",       stack: 'Roboto, "Segoe UI", Arial, sans-serif' },
  "open sans":  { family: "Open Sans",    stack: '"Open Sans", "Segoe UI", Roboto, Arial, sans-serif' },
  lato:         { family: "Lato",         stack: 'Lato, "Segoe UI", Roboto, Arial, sans-serif' },
  montserrat:   { family: "Montserrat",   stack: 'Montserrat, "Segoe UI", Roboto, Arial, sans-serif' },
  merriweather: { family: "Merriweather", stack: "Merriweather, Georgia, serif" },
};

export function normalizeFontFamily(raw?: string): string {
  const v = (raw || "").trim();
  if (!v) return DEFAULT_THEME.fontFamily;
  const key = v.toLowerCase();
  if (key === "system" || key === "system sans" || key === "default") {
    return DEFAULT_THEME.fontFamily;
  }
  if (GOOGLE_FONT_MAP[key]) return GOOGLE_FONT_MAP[key].stack;
  const keys = Object.keys(GOOGLE_FONT_MAP);
  for (let i = 0; i < keys.length; i++) {
    const entry = GOOGLE_FONT_MAP[keys[i]];
    if (v.indexOf(entry.family) === 0) return entry.stack;
  }
  return v;
}

export const _loadedFonts: Record<string, boolean> = {};
export function ensureGoogleFont(fontStack: string): void {
  if (typeof document === "undefined") return;
  const keys = Object.keys(GOOGLE_FONT_MAP);
  for (let i = 0; i < keys.length; i++) {
    const entry = GOOGLE_FONT_MAP[keys[i]];
    if (fontStack.indexOf(entry.family) !== -1 && !_loadedFonts[entry.family]) {
      _loadedFonts[entry.family] = true;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(entry.family) + ":wght@300;400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
  }
}

export const getConfig = (): { apiBase: string; siteId: string; theme: ResolvedWidgetTheme } => {
  const globalConfig =
    typeof window !== "undefined" ? window.NAVBOT_CONFIG || {} : {};
  const apiBase =
    globalConfig.apiBase ??
    (typeof window !== "undefined"
      ? window.location.protocol === "https:"
        ? window.location.origin
        : `${window.location.protocol}//${window.location.hostname}:3001`
      : "http://localhost:3001");
  const siteId =
    globalConfig.siteId ??
    (typeof window !== "undefined"
      ? window.location.hostname || "unknown-site"
      : "unknown-site");
  const incoming = (globalConfig.theme ?? {}) as WidgetTheme;
  const resolvedFont = normalizeFontFamily(incoming.fontFamily ?? incoming.font);
  ensureGoogleFont(resolvedFont);
  const theme: ResolvedWidgetTheme = { ...DEFAULT_THEME, ...incoming, fontFamily: resolvedFont };
  return { apiBase, siteId, theme };
};

// Determine readable text color on top of a background hex
export function textOnBg(hex: string): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return "#ffffff";
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.55 ? "#1e293b" : "#ffffff";
  } catch {
    return "#ffffff";
  }
}

