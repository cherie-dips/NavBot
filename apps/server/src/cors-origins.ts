/**
 * Origins allowed for credentialed auth requests (CORS + better-auth trustedOrigins).
 *
 * `CORS_ORIGIN` — optional comma-separated list (e.g. production URL).
 * Local Vite defaults (5173 and 5174) are always included so port changes don’t break auth.
 */
const LOCAL_VITE_ORIGINS = ["http://localhost:5173", "http://localhost:5174"];

export function getTrustedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  const extras = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  if (process.env.NODE_ENV === "production" && extras.length > 0) {
    return extras;
  }
  return Array.from(new Set([...LOCAL_VITE_ORIGINS, ...extras]));
}
