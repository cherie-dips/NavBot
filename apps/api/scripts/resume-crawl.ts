/**
 * Resume an interrupted crawl for a site.
 * Checks which sitemap URLs already have page hashes in the DB,
 * then crawls and upserts only the missing ones.
 *
 * Usage: npx tsx apps/api/scripts/resume-crawl.ts <siteId> <siteUrl> [userId]
 */
import "dotenv/config";
import { getSitemapEntries } from "../src/services/sitemap";
import { crawlPages, shutdownBrowser } from "../src/services/crawler";
import { upsertSitePages } from "../src/services/vectorstore";
import {
  initAppDatabase,
  getPageHashes,
  upsertPageHashes,
  upsertPageLastmods,
  upsertSite,
} from "../src/services/db";

const BATCH_SIZE = 10;

async function main() {
  const [siteId, siteUrl, userId] = process.argv.slice(2);
  if (!siteId || !siteUrl) {
    console.error("Usage: npx tsx apps/api/scripts/resume-crawl.ts <siteId> <siteUrl> [userId]");
    process.exit(1);
  }

  await initAppDatabase();

  console.log(`[resume] Fetching sitemap for ${siteUrl}...`);
  const sitemapEntries = await getSitemapEntries(siteUrl);
  if (sitemapEntries.length === 0) {
    console.error("[resume] No sitemap found — nothing to resume");
    process.exit(1);
  }
  console.log(`[resume] Sitemap has ${sitemapEntries.length} URLs`);

  const existingHashes = await getPageHashes(siteId);
  const alreadyDone = new Set(Object.keys(existingHashes));
  console.log(`[resume] ${alreadyDone.size} URLs already have page hashes in DB`);

  const remaining = sitemapEntries.filter((e) => !alreadyDone.has(e.url));
  console.log(`[resume] ${remaining.length} URLs still need crawling`);

  if (remaining.length === 0) {
    console.log("[resume] Nothing to do — all sitemap URLs are already indexed");

    // Store lastmods if missing
    await upsertPageLastmods(siteId, sitemapEntries.map((e) => ({ url: e.url, lastmod: e.lastmod })));
    console.log("[resume] Stored lastmods for all sitemap entries");
    process.exit(0);
  }

  const remainingUrls = remaining.map((e) => e.url);
  let totalCrawled = 0;
  let totalInserted = 0;
  let totalFailed = 0;

  for (let i = 0; i < remainingUrls.length; i += BATCH_SIZE) {
    const batchUrls = remainingUrls.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(remainingUrls.length / BATCH_SIZE);
    console.log(`[resume] Batch ${batchNum}/${totalBatches}: crawling ${batchUrls.length} URLs`);

    const batchPages = await crawlPages(batchUrls);
    totalCrawled += batchPages.length;

    if (batchPages.length > 0) {
      const result = await upsertSitePages(siteId, batchPages);
      totalInserted += result.insertedCount;
      totalFailed += result.failedCount;
      await upsertPageHashes(siteId, batchPages.map((p) => ({ url: p.url, hash: p.hash })));
    }

    await shutdownBrowser();
  }

  // Store lastmods for ALL sitemap entries (including previously crawled)
  await upsertPageLastmods(siteId, sitemapEntries.map((e) => ({ url: e.url, lastmod: e.lastmod })));

  // Update site record
  if (userId) {
    const finalHashes = await getPageHashes(siteId);
    const hostname = new URL(siteUrl).hostname;
    await upsertSite({
      siteId,
      userId,
      url: siteUrl,
      hostname,
      pagesIndexed: Object.keys(finalHashes).length,
    });
  }

  console.log(`\n[resume] Done!`);
  console.log(`  Crawled: ${totalCrawled} pages`);
  console.log(`  Upserted: ${totalInserted} chunks`);
  console.log(`  Failed: ${totalFailed} chunks`);
  console.log(`  Total indexed: ${alreadyDone.size + totalCrawled} pages`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[resume] Fatal error:", err);
  process.exit(1);
});
