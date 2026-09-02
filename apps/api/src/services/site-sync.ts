/**
 * Sitemap-driven incremental sync — the one implementation.
 *
 * This algorithm used to exist three times: the cron job in auto-sync.ts, the manual
 * POST /:siteId/sync route, and the preview branch of the GET route. They drifted, and
 * the drift was user-visible: the cron crawled with OCR enabled, in batches of 5, and
 * invalidated the RAG cache afterwards, while the dashboard's "Sync now" button crawled
 * without OCR, in batches of 10, and left the cache holding pre-sync answers. A site
 * owner clicking Sync therefore indexed *less* than the cron would have, then kept being
 * served the stale answers they clicked Sync to fix.
 *
 * The shape of the work:
 *   1. read the sitemap
 *   2. diff `lastmod` against what we stored to get the new/changed URLs
 *   3. re-add pages that have a stored lastmod but no content hash — those were marked
 *      seen without ever being indexed, and nothing else would ever pick them up again
 *   4. drop pages that disappeared from the sitemap
 *   5. crawl the survivors in batches, and upsert only those whose content hash moved
 *   6. update the site row and invalidate cached answers
 */
import { crawlPages, shutdownBrowser } from "./crawl/crawler";
import { getSitemapEntries, diffSitemapEntries, type SitemapEntry } from "./crawl/sitemap";
import { upsertSitePages, deletePagesFromSite } from "./retrieval/vectorstore";
import {
  getPageHashes,
  getPageLastmods,
  upsertPageHashes,
  upsertPageLastmods,
  deletePageHashesForUrls,
  upsertSite,
  invalidateRagCache,
} from "./platform/db";

/** The subset of a site row this module needs. */
export interface SyncTarget {
  site_id: string;
  user_id: string;
  url: string;
  hostname: string;
}

export interface SyncPlan {
  entries: SitemapEntry[];
  /** New or modified since the last sync, including the never-indexed safety net. */
  changed: SitemapEntry[];
  /** Stored URLs the sitemap no longer lists. */
  removed: string[];
  /** Which of `changed` have never been seen before, as opposed to modified. */
  newUrls: Set<string>;
}

export interface SyncResult {
  method: "sitemap";
  checked: number;
  changed: number;
  unchanged: number;
  deleted: number;
  stored: number;
  failed: number;
}

/**
 * Pages crawled per batch. Deliberately small: each batch holds rendered HTML for
 * every page in it, and the API runs with --max-old-space-size=384.
 */
const BATCH_SIZE = 5;

/**
 * Work out what a sync would do, without changing anything.
 *
 * Shared by the preview endpoint and the sync itself so the numbers the dashboard shows
 * are the numbers the sync then acts on — previously these were two separate copies of
 * the diff and could disagree.
 */
export async function planSitemapSync(
  siteId: string,
  siteUrl: string
): Promise<SyncPlan | null> {
  const entries = await getSitemapEntries(siteUrl);
  if (entries.length === 0) return null;

  const storedLastmods = await getPageLastmods(siteId);
  const changed = diffSitemapEntries(entries, storedLastmods);

  // Safety net: a stored lastmod with no content hash means a previous run recorded the
  // page as seen but never actually indexed it. The lastmod diff will never select it
  // again, so without this it stays permanently missing from the index.
  const existingHashes = await getPageHashes(siteId);
  for (const entry of entries) {
    const seen = storedLastmods[entry.url] !== undefined;
    const indexed = existingHashes[entry.url] !== undefined;
    if (seen && !indexed && !changed.some((c) => c.url === entry.url)) {
      changed.push(entry);
    }
  }

  const sitemapUrls = new Set(entries.map((e) => e.url));
  const removed = Object.keys(storedLastmods).filter((u) => !sitemapUrls.has(u));

  const newUrls = new Set(
    changed.filter((e) => storedLastmods[e.url] === undefined).map((e) => e.url)
  );

  return { entries, changed, removed, newUrls };
}

/**
 * Run the sync for one site.
 *
 * Returns null when the site has no reachable sitemap, which is the caller's cue to fall
 * back to a full BFS crawl (the manual route does; the cron just skips the site).
 */
export async function syncSiteFromSitemap(
  site: SyncTarget,
  options: { logTag?: string } = {}
): Promise<SyncResult | null> {
  const siteId = site.site_id;
  const tag = options.logTag ?? `[sync ${siteId}]`;

  const plan = await planSitemapSync(siteId, site.url);
  if (!plan) {
    console.log(`${tag} no sitemap for ${site.url}`);
    return null;
  }

  const { entries, changed, removed } = plan;
  console.log(
    `${tag} sitemap has ${entries.length} entries — ${changed.length} new/changed, ${removed.length} removed`
  );

  if (removed.length > 0) {
    await deletePagesFromSite(siteId, removed);
    await deletePageHashesForUrls(siteId, removed);
  }

  const storedHashes = await getPageHashes(siteId);
  let crawled = 0;
  let contentChanged = 0;
  let stored = 0;
  let failed = 0;

  const urlsToCrawl = changed.map((e) => e.url);
  for (let i = 0; i < urlsToCrawl.length; i += BATCH_SIZE) {
    const batchUrls = urlsToCrawl.slice(i, i + BATCH_SIZE);
    console.log(
      `${tag} batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(urlsToCrawl.length / BATCH_SIZE)} — ${batchUrls.length} urls`
    );

    const batchPages = await crawlPages(batchUrls, { enableOcr: true });
    crawled += batchPages.length;

    // A page can be re-fetched and still be byte-identical; only pay for embedding
    // when the content hash actually moved.
    const batchChanged = batchPages.filter((p) => storedHashes[p.url] !== p.hash);
    contentChanged += batchChanged.length;

    if (batchChanged.length > 0) {
      await deletePagesFromSite(
        siteId,
        batchChanged.map((p) => p.url)
      );
      const result = await upsertSitePages(siteId, batchChanged);
      stored += result.insertedCount;
      failed += result.failedCount;
    }

    await upsertPageHashes(
      siteId,
      batchPages.map((p) => ({ url: p.url, hash: p.hash }))
    );
    const batchEntries = changed.filter((e) => batchUrls.includes(e.url));
    await upsertPageLastmods(
      siteId,
      batchEntries.map((e) => ({ url: e.url, lastmod: e.lastmod }))
    );

    // Release the shared Chromium between batches — it is the single largest consumer
    // of the process's memory budget.
    await shutdownBrowser();
  }

  if (stored > 0 || removed.length > 0) {
    await invalidateRagCache(siteId);
    console.log(`${tag} RAG cache invalidated`);
  }

  // Count from the hashes actually on record, not from the sitemap: a sitemap URL that
  // failed to crawl is not an indexed page.
  const updatedHashes = await getPageHashes(siteId);
  await upsertSite({
    siteId: site.site_id,
    userId: site.user_id,
    url: site.url,
    hostname: site.hostname,
    pagesIndexed: Object.keys(updatedHashes).length,
  });

  console.log(
    `${tag} done — ${crawled} crawled, ${contentChanged} with new content, ${stored} chunks stored (${failed} failed)`
  );

  return {
    method: "sitemap",
    checked: entries.length,
    changed: contentChanged,
    unchanged: entries.length - contentChanged,
    deleted: removed.length,
    stored,
    failed,
  };
}
