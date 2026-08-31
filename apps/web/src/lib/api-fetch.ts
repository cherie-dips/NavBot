import { getApiToken, clearApiToken } from "./auth-client";

/** Like fetch(), but attaches a verified bearer token for apps/api's dashboard routes. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await getApiToken()}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    clearApiToken();
    headers.set("Authorization", `Bearer ${await getApiToken()}`);
    return fetch(input, { ...init, headers });
  }
  return res;
}
