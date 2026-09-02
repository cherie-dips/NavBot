/**
 * Where the dashboard talks to the NavBot API.
 *
 * `API_BASE` is resolved once here rather than recomputed per module — it was being
 * derived independently in main.tsx, GetStartedPage and DashboardPage.
 */
/** Vite env base URL for the NavBot API — no trailing slash (avoids //api/...). */
export function normalizeApiBase(raw: string | undefined): string {
  return String(raw ?? "").trim().replace(/\/+$/, "") || "http://localhost:3001";
}

/** Hostname for display after indexing (matches API normalization: adds https if missing). */
export function siteHostnameFromInput(raw: string): string {
  const trimmed = raw.trim();
  try {
    return new URL(trimmed).hostname;
  } catch {
    try {
      const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
      return new URL(withScheme).hostname;
    } catch {
      return trimmed;
    }
  }
}

/** Base URL of the NavBot API service, without a trailing slash. */
export const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL);
