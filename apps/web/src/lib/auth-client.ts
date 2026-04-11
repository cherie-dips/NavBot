import { createAuthClient } from "better-auth/react";

/** Must match BETTER_AUTH_URL on the server (no trailing slash). */
function normalizeAuthServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

const AUTH_SERVER_URL = normalizeAuthServerUrl(
  (import.meta as any).env?.VITE_AUTH_URL ?? "http://localhost:3000"
);

export const authClient = createAuthClient({
  baseURL: AUTH_SERVER_URL,
});
