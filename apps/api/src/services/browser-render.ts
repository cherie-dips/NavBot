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
 */

let browserInstance: Browser | null = null;
let browserLaunching: Promise<Browser | null> | null = null;

function browserTimeoutMs(): number {
  const n = parseInt(process.env.NAVBOT_BROWSER_TIMEOUT_MS || "60000", 10);
  return Number.isFinite(n) && n >= 5000 ? n : 60000;
}

function browserSettleMs(): number {
  const n = parseInt(process.env.NAVBOT_BROWSER_SETTLE_MS || "2000", 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 15000) : 2000;
}

export async function getSharedBrowser(): Promise<Browser | null> {
  if (browserInstance) return browserInstance;
  if (browserLaunching) return browserLaunching;

  browserLaunching = (async () => {
    try {
      const { chromium } = await import("playwright");
      const b = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
      browserInstance = b;
      return b;
    } catch (e) {
      console.warn(
        "[browser-render] Playwright failed to start. Install browsers: pnpm exec playwright install chromium",
        e instanceof Error ? e.message : e
      );
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
 */
export async function fetchRenderedHtml(url: string): Promise<string | null> {
  const browser = await getSharedBrowser();
  if (!browser) return null;

  const timeout = browserTimeoutMs();
  const settle = browserSettleMs();
  const page = await browser.newPage();

  try {
    await page.setExtraHTTPHeaders({
      "User-Agent": "NavBot/1.0 (site indexer; respectful crawler)",
      Accept: "text/html,application/xhtml+xml",
    });
    await page.goto(url, { waitUntil: "load", timeout });
    // Optional: short network idle wait (ignore failure on long-polling sites)
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    if (settle > 0) await sleep(settle);
    return await page.content();
  } catch (err) {
    console.warn(`[browser-render] Navigation failed for ${url}:`, err instanceof Error ? err.message : err);
    return null;
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
