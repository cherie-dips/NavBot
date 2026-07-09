import type { Browser } from "playwright";

/**
 * Headless Chromium rendering for SPAs (React, Vue, Next client-nav, etc.).
 * Static `fetch` + Cheerio only sees pre-hydration HTML; this runs the page like a real browser.
 *
 * One shared browser is reused across crawl requests (API process lifetime).
 *
 * Setup: `pnpm exec playwright install chromium` from `apps/api` (or repo root with filter).
 *
 * Env:
 * - `NAVBOT_BROWSER_CRAWL` — `auto` (default) | `always` | `off`
 * - `NAVBOT_BROWSER_TIMEOUT_MS` — navigation timeout (default 60000)
 * - `NAVBOT_BROWSER_SETTLE_MS` — extra wait after load for hydration (default 2000)
 * - `JINA_API_KEY` — optional; enables Jina Reader as fallback when Playwright is unavailable
 */

// ---------------------------------------------------------------------------
// SPA Framework Detection
// ---------------------------------------------------------------------------
export interface FrameworkDetection {
  framework: "react" | "vue" | "angular" | "svelte" | "nextjs" | "nuxt" | "unknown";
  isSPA: boolean;
  confidence: "high" | "medium" | "low";
}

export function detectFramework(html: string, headers?: Record<string, string>): FrameworkDetection {
  const poweredBy = headers?.["x-powered-by"]?.toLowerCase() || "";

  if (poweredBy.includes("next.js") || /id="__next"|_next\/static|__NEXT_DATA__/i.test(html)) {
    return { framework: "nextjs", isSPA: true, confidence: "high" };
  }

  if (/<div\s+id=["']root["']\s*>\s*<\/div>/i.test(html) ||
      /data-reactroot|_reactRootContainer|react\.production|react-dom/i.test(html)) {
    return { framework: "react", isSPA: true, confidence: "high" };
  }

  if (/<div\s+id=["']app["']\s*>\s*<\/div>/i.test(html) ||
      /data-v-[a-f0-9]|__vue__|vue\.runtime|vue\.global/i.test(html)) {
    const isNuxt = /__nuxt|nuxt\.js|_nuxt\//i.test(html);
    if (isNuxt) return { framework: "nuxt", isSPA: true, confidence: "high" };
    return { framework: "vue", isSPA: true, confidence: "high" };
  }

  if (/<app-root|ng-version|_nghost-|_ngcontent-|angular\.js|angular\.min/i.test(html)) {
    return { framework: "angular", isSPA: true, confidence: "high" };
  }

  if (/__sveltekit|svelte-[\w]+|\.svelte-/i.test(html)) {
    return { framework: "svelte", isSPA: true, confidence: "medium" };
  }

  if (/gatsby-/i.test(html) && /___gatsby/i.test(html)) {
    return { framework: "unknown", isSPA: true, confidence: "high" };
  }

  if (/__remix|data-remix|remix\.run/i.test(html)) {
    return { framework: "unknown", isSPA: true, confidence: "high" };
  }

  if (/astro-[a-z]/i.test(html) && /<astro-island/i.test(html)) {
    return { framework: "unknown", isSPA: true, confidence: "medium" };
  }

  if (/webflow/i.test(html) && /Webflow\.push/i.test(html)) {
    return { framework: "unknown", isSPA: true, confidence: "medium" };
  }

  if (/<div\s+id=["'](root|app|main-app)["']\s*>\s*<\/div>/i.test(html) &&
      /<script[^>]*src=["'][^"']*\b(chunk|bundle|main)\b[^"']*["']/i.test(html)) {
    return { framework: "unknown", isSPA: true, confidence: "medium" };
  }

  return { framework: "unknown", isSPA: false, confidence: "low" };
}

// ---------------------------------------------------------------------------
// Jina Reader Fallback
// ---------------------------------------------------------------------------
async function fetchViaJinaReader(url: string): Promise<string | null> {
  const apiKey = process.env.JINA_API_KEY?.trim();
  const jinaUrl = `https://r.jina.ai/${url}`;

  const headers: Record<string, string> = {
    Accept: "text/html",
    "X-Return-Format": "html",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(jinaUrl, { headers, redirect: "follow" });
    if (!res.ok) {
      console.warn(`[jina-reader] Failed for ${url} — HTTP ${res.status}`);
      return null;
    }
    const text = await res.text();
    if (text.length < 100) return null;
    console.log(`[jina-reader] Rendered ${url} (${text.length} chars)`);
    return text;
  } catch (err) {
    console.warn("[jina-reader] Error:", err instanceof Error ? err.message : err);
    return null;
  }
}

let browserInstance: Browser | null = null;
let browserLaunching: Promise<Browser | null> | null = null;
let playwrightUnavailable = false;

function browserTimeoutMs(): number {
  const n = parseInt(process.env.NAVBOT_BROWSER_TIMEOUT_MS || "60000", 10);
  return Number.isFinite(n) && n >= 5000 ? n : 60000;
}

function browserSettleMs(): number {
  const n = parseInt(process.env.NAVBOT_BROWSER_SETTLE_MS || "2000", 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 15000) : 2000;
}

export async function getSharedBrowser(): Promise<Browser | null> {
  if (playwrightUnavailable) return null;
  if (browserInstance) return browserInstance;
  if (browserLaunching) return browserLaunching;

  browserLaunching = (async () => {
    try {
      const { chromium } = await import("playwright");
      const b = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-default-apps",
          "--disable-sync",
          "--disable-translate",
          "--metrics-recording-only",
          "--no-first-run",
        ],
      });
      browserInstance = b;
      return b;
    } catch (e) {
      console.warn(
        "[browser-render] Playwright failed to start. Install browsers: pnpm exec playwright install chromium",
        e instanceof Error ? e.message : e
      );
      playwrightUnavailable = true;
      return null;
    } finally {
      browserLaunching = null;
    }
  })();

  return browserLaunching;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Load URL in headless Chromium and return serialized DOM HTML (post-JS).
 * Falls back to Jina Reader when Playwright is unavailable.
 */
export async function fetchRenderedHtml(url: string): Promise<string | null> {
  const browser = await getSharedBrowser();
  if (!browser) {
    return fetchViaJinaReader(url);
  }

  const timeout = browserTimeoutMs();
  const settle = browserSettleMs();

  let page;
  try {
    page = await browser.newPage();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/closed|crashed|disposed/i.test(msg)) {
      console.warn("[browser-render] Browser crashed, resetting instance");
      browserInstance = null;
    }
    return fetchViaJinaReader(url);
  }

  try {
    await page.setExtraHTTPHeaders({
      "User-Agent": "NavBot/1.0 (site indexer; respectful crawler)",
      Accept: "text/html,application/xhtml+xml",
    });
    await page.goto(url, { waitUntil: "load", timeout });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

    if (settle > 0) await sleep(settle);
    return await page.content();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[browser-render] Navigation failed for ${url}:`, msg);
    if (/closed|crashed|disposed/i.test(msg)) {
      browserInstance = null;
    }
    return fetchViaJinaReader(url);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function shutdownBrowser(): Promise<void> {
  if (!browserInstance) return;
  try {
    await browserInstance.close();
  } catch {
    /* ignore */
  } finally {
    browserInstance = null;
  }
}
