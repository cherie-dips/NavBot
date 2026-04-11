/**
 * Origins allowed for credentialed auth requests (CORS + better-auth trustedOrigins).
 *
 * `CORS_ORIGIN` — optional comma-separated list (e.g. production URL).
 * Put your **static web** origin first if you use multiple values; it is used to redirect
 * OAuth errors from the auth service back to the app (unless `WEB_APP_ORIGIN` is set).
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
