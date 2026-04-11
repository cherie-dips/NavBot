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
