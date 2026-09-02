/**
 * Scheduling for the sitemap sync.
 *
 * This file decides *when* a site is re-crawled; site-sync.ts decides *what* happens
 * when one is. Two triggers share that implementation:
 *
 *   - a cron sweep over every active site (AUTO_SYNC_CRON, default every 6 hours)
 *   - an on-demand sync when a widget pings, rate-limited per site
 */
import cron from "node-cron";
import { shutdownBrowser } from "./crawl/crawler";
import { syncSiteFromSitemap } from "./site-sync";
import { getAllActiveSites, isIndexingActive } from "./platform/db";

const SYNC_CRON = process.env.AUTO_SYNC_CRON || "0 */6 * * *";

async function syncSite(site: {
  site_id: string;
  user_id: string;
  url: string;
  hostname: string;
}): Promise<void> {
  try {
    await syncSiteFromSitemap(site, { logTag: `[auto-sync ${site.site_id}]` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[auto-sync ${site.site_id}] Error:`, msg);
    // The browser is shared process-wide, so a failure mid-crawl would otherwise leave
    // Chromium resident until the next successful batch closed it.
    await shutdownBrowser();
  }
}

export async function runAutoSync(): Promise<void> {
  console.log("[auto-sync] Starting scheduled sync for all active sites…");
  const sites = await getAllActiveSites();
  console.log(`[auto-sync] Found ${sites.length} active site(s)`);

  // Sequential on purpose: concurrent crawls would multiply peak memory, and this runs
  // in the same process that is serving chat.
  for (const site of sites) {
    await syncSite(site);
  }

  console.log("[auto-sync] Scheduled sync complete");
}

export function startAutoSync(): void {
  console.log(`[auto-sync] Scheduling with cron: "${SYNC_CRON}"`);

  cron.schedule(SYNC_CRON, () => {
    runAutoSync().catch((err) => {
      console.error("[auto-sync] Unhandled error in scheduled sync:", err);
    });
  });

  console.log("[auto-sync] Auto-sync scheduler started");
}

// ---------------------------------------------------------------------------
// Per-site on-demand sync (called from the widget ping)
// ---------------------------------------------------------------------------
const activeSyncs = new Set<string>();
const COOLDOWN_MS = 5 * 60 * 1000;
const lastSyncTime = new Map<string, number>();

/**
 * Sync one site if nothing else is already crawling it and its cooldown has expired.
 * Safe to call fire-and-forget: every visitor loading the widget hits this.
 */
export async function trySitemapSync(siteId: string): Promise<void> {
  // A fresh site is mid-index on another request; a second crawl would fight it.
  if (isIndexingActive()) return;

  if (activeSyncs.has(siteId)) {
    console.log(`[ping-sync] Sync already in progress for ${siteId} — skipping`);
    return;
  }

  const last = lastSyncTime.get(siteId);
  if (last && Date.now() - last < COOLDOWN_MS) return;

  const site = (await getAllActiveSites()).find((s) => s.site_id === siteId);
  if (!site) return;

  activeSyncs.add(siteId);
  try {
    await syncSite(site);
    lastSyncTime.set(siteId, Date.now());
  } finally {
    activeSyncs.delete(siteId);
  }
}
