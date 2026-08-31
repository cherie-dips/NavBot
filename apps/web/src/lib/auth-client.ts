import { createAuthClient } from "better-auth/react";

/** Must match BETTER_AUTH_URL on the server (no trailing slash). */
function normalizeAuthServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export const AUTH_SERVER_URL = normalizeAuthServerUrl(
  (import.meta as any).env?.VITE_AUTH_URL ?? "http://localhost:3000"
);

export const authClient = createAuthClient({
  baseURL: AUTH_SERVER_URL,
});

/**
 * Short-lived bearer token apps/api verifies to know which real, currently-logged-in
 * user a dashboard request is from — see apps/server/src/api-token.ts. Cached until
 * shortly before it expires; apiFetch() clears and refetches once on a 401.
 */
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getApiToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 15_000) {
    return cachedToken.token;
  }
  const res = await fetch(`${AUTH_SERVER_URL}/api/session-token`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("not_authenticated");
  cachedToken = await res.json();
  return cachedToken!.token;
}

export function clearApiToken(): void {
  cachedToken = null;
}
