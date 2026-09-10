/**
 * HTTP Basic Auth for crawling protected sites.
 *
 * Staging and pre-launch sites are routinely put behind nginx Basic Auth, which makes
 * every crawler request return 401 and the site index silently empty. Credentials are
 * supplied per host through the environment and attached to matching requests only.
 *
 * Configure with NAVBOT_CRAWL_AUTH, a JSON object keyed by hostname:
 *
 *   NAVBOT_CRAWL_AUTH={"dev.example.com":{"username":"user","password":"pass"}}
 *
 * Credentials belong in the environment, never in the database or a committed file:
 * they are an operator secret for a site the operator already has access to, not
 * per-tenant data, and nothing in the product surfaces them.
 */

interface Credentials {
  username: string;
  password: string;
}

let cached: Record<string, Credentials> | null = null;
let warned = false;

function credentialMap(): Record<string, Credentials> {
  if (cached) return cached;

  const raw = process.env.NAVBOT_CRAWL_AUTH?.trim();
  if (!raw) return (cached = {});

  try {
    const parsed = JSON.parse(raw) as Record<string, Credentials>;
    const out: Record<string, Credentials> = {};
    for (const [host, cred] of Object.entries(parsed)) {
      if (typeof cred?.username === "string" && typeof cred?.password === "string") {
        // Hosts are compared lowercased; a stray scheme or path is tolerated because
        // the value is hand-written into a dashboard env field.
        out[host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")] = cred;
      }
    }
    cached = out;
    if (Object.keys(out).length > 0) {
      console.log(`[crawl-auth] Basic auth configured for: ${Object.keys(out).join(", ")}`);
    }
    return cached;
  } catch {
    // Logged once, without the value — it contains a password.
    if (!warned) {
      warned = true;
      console.warn(
        '[crawl-auth] NAVBOT_CRAWL_AUTH is not valid JSON and was ignored. Expected {"host":{"username":"...","password":"..."}}'
      );
    }
    return (cached = {});
  }
}

/** Credentials for this URL's host, or null. Exact host match — never a parent domain. */
export function credentialsFor(url: string): Credentials | null {
  const map = credentialMap();
  if (Object.keys(map).length === 0) return null;
  try {
    return map[new URL(url).hostname.toLowerCase()] ?? null;
  } catch {
    return null;
  }
}

/**
 * Request headers for a crawl, with an Authorization header when the host needs one.
 *
 * Every outbound crawl request goes through this so a protected host cannot be reached
 * by one code path and 401 on another — which is how a crawl ends up with the sitemap
 * but none of the pages.
 */
export function crawlHeaders(url: string, extra: Record<string, string> = {}): Record<string, string> {
  const cred = credentialsFor(url);
  if (!cred) return extra;
  const encoded = Buffer.from(`${cred.username}:${cred.password}`, "utf8").toString("base64");
  return { ...extra, Authorization: `Basic ${encoded}` };
}

/**
 * Playwright's own credential form. Given to the browser context rather than as a
 * header so the browser answers the 401 challenge properly, including for the
 * sub-resources a rendered page loads.
 */
export function httpCredentialsFor(url: string): Credentials | undefined {
  return credentialsFor(url) ?? undefined;
}
