/**
 * apps/api/src/services/auto-sync.ts
 *
 * Automatic sitemap-based re-crawl for all active sites.
 *
 * Runs on a cron schedule. For each site:
 *   1. Fetch the sitemap
 *   2. Diff against stored lastmod values — only pick new/changed URLs
 *   3. Crawl only those URLs
 *   4. Compare content hashes — only upsert pages whose content actually changed
 *   5. Remove pages that disappeared from the sitemap
 */

import cron from "node-cron";
import { getSitemapEntries, diffSitemapEntries } from "./sitemap";
import { crawlPages, shutdownBrowser } from "./crawler";
import { upsertSitePages, deletePagesFromSite } from "./vectorstore";
import {
  getAllActiveSites,
  getPageLastmods,
  getPageHashes,
  upsertPageHashes,
  upsertPageLastmods,
  upsertSite,
  deletePageHashesForUrls,
} from "./db";

const SYNC_CRON = process.env.AUTO_SYNC_CRON || "0 */6 * * *"; // default: every 6 hours

async function syncSite(site: {
  site_id: string;
  user_id: string;
  url: string;
  hostname: string;
}): Promise<void> {
  const { site_id: siteId, url } = site;
  const tag = `[auto-sync ${siteId}]`;

  try {
    // 1. Fetch sitemap
    const sitemapEntries = await getSitemapEntries(url);
    if (sitemapEntries.length === 0) {
      console.log(`${tag} No sitemap found for ${url} — skipping`);
      return;
    }
    console.log(`${tag} Sitemap has ${sitemapEntries.length} entries`);

    // 2. Diff against stored lastmod values
    const storedLastmods = await getPageLastmods(siteId);
    const changedEntries = diffSitemapEntries(sitemapEntries, storedLastmods);

    // 2b. Safety net: detect sitemap pages that have a stored lastmod but were
    // never actually crawled (no content hash). This catches pages that were
    // marked as "seen" by a previous bug but never indexed.
    const existingHashes = await getPageHashes(siteId);
    const neverIndexed = sitemapEntries.filter(
      (e) => storedLastmods[e.url] !== undefined && existingHashes[e.url] === undefined
    );
    if (neverIndexed.length > 0) {
      console.log(`${tag} Found ${neverIndexed.length} sitemap pages with lastmod but no content hash — adding to crawl list`);
      for (const entry of neverIndexed) {
        if (!changedEntries.some((c) => c.url === entry.url)) {
          changedEntries.push(entry);
        }
      }
    }

    // 3. Detect pages removed from sitemap
    const sitemapUrls = new Set(sitemapEntries.map((e) => e.url));
    const storedUrls = Object.keys(storedLastmods);
    const removedUrls = storedUrls.filter((u) => !sitemapUrls.has(u));

    if (changedEntries.length === 0 && removedUrls.length === 0) {
      console.log(`${tag} Everything up to date — no changes in sitemap`);
      return;
    }

    console.log(
      `${tag} ${changedEntries.length} new/changed URLs, ${removedUrls.length} removed`
    );

    // 4. Remove pages that are no longer in the sitemap
    if (removedUrls.length > 0) {
      console.log(`${tag} Removing ${removedUrls.length} pages no longer in sitemap`);
      await deletePagesFromSite(siteId, removedUrls);
      await deletePageHashesForUrls(siteId, removedUrls);
    }

    if (changedEntries.length === 0) {
      return;
    }

    // 5. Crawl in batches to avoid OOM on large sites
    const BATCH_SIZE = 10;
    const urlsToCrawl = changedEntries.map((e) => e.url);
    console.log(`${tag} Crawling ${urlsToCrawl.length} URLs in batches of ${BATCH_SIZE}`);

    const storedHashes = await getPageHashes(siteId);
    let totalCrawled = 0;
    let totalInserted = 0;
    let totalFailed = 0;

    for (let i = 0; i < urlsToCrawl.length; i += BATCH_SIZE) {
      const batchUrls = urlsToCrawl.slice(i, i + BATCH_SIZE);
      const batchPages = await crawlPages(batchUrls);
      totalCrawled += batchPages.length;

      const batchChanged = batchPages.filter((p) => storedHashes[p.url] !== p.hash);

      if (batchChanged.length > 0) {
        await deletePagesFromSite(siteId, batchChanged.map((p) => p.url));
        const { insertedCount, failedCount } = await upsertSitePages(siteId, batchChanged);
        totalInserted += insertedCount;
        totalFailed += failedCount;
      }

      await upsertPageHashes(siteId, batchPages.map((p) => ({ url: p.url, hash: p.hash })));
      const batchEntries = changedEntries.filter((e) => batchUrls.includes(e.url));
      await upsertPageLastmods(siteId, batchEntries.map((e) => ({ url: e.url, lastmod: e.lastmod })));

      await shutdownBrowser();
    }

    console.log(`${tag} ${totalCrawled} pages crawled, ${totalInserted} chunks upserted (${totalFailed} failed)`);

    // 8. Update site metadata
    const storedHashCount = Object.keys(storedHashes).length;
    const newTotal =
      storedHashCount + changedEntries.length - removedUrls.length;
    await upsertSite({
      siteId: site.site_id,
      userId: site.user_id,
      url: site.url,
      hostname: site.hostname,
      pagesIndexed: Math.max(newTotal, 0),
    });

    console.log(`${tag} Sync complete`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${tag} Error:`, msg);
  }
}

async function runAutoSync(): Promise<void> {
  console.log("[auto-sync] Starting scheduled sync for all active sites…");
  const sites = await getAllActiveSites();
  console.log(`[auto-sync] Found ${sites.length} active site(s)`);

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

  // Also expose for manual trigger via import
  console.log("[auto-sync] Auto-sync scheduler started");
}

/** Manual trigger (e.g., from a route or CLI) */
export { runAutoSync };

// ---------------------------------------------------------------------------
// Per-site on-demand sync (called from widget ping)
// ---------------------------------------------------------------------------
const activeSyncs = new Set<string>();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 min cooldown per site
const lastSyncTime = new Map<string, number>();

/**
 * Trigger a sitemap sync for a single site if one isn't already running
 * and the cooldown hasn't expired. Safe to call from a fire-and-forget context.
 */
export async function trySitemapSync(siteId: string): Promise<void> {
  // Skip if already running
  if (activeSyncs.has(siteId)) {
    console.log(`[ping-sync] Sync already in progress for ${siteId} — skipping`);
    return;
  }

  // Skip if recently synced
  const last = lastSyncTime.get(siteId);
  if (last && Date.now() - last < COOLDOWN_MS) {
    return; // silently skip — too recent
  }

  // Look up site info
  const sites = (await getAllActiveSites()).filter((s) => s.site_id === siteId);
  if (sites.length === 0) return;

  const site = sites[0];
  activeSyncs.add(siteId);

  try {
    await syncSite(site);
    lastSyncTime.set(siteId, Date.now());
  } finally {
    activeSyncs.delete(siteId);
  }
}
