/**
 * Re-upsert pages from specific crawl batches that had Pinecone failures.
 * Crawls those pages again and upserts — Pinecone upsert is idempotent
 * so already-correct vectors just get overwritten.
 *
 * Usage: npx tsx apps/api/scripts/fix-failed-upserts.ts <siteId> <siteUrl>
 */
import "dotenv/config";
import { getSitemapEntries } from "../src/services/sitemap";
import { crawlPages, shutdownBrowser } from "../src/services/crawler";
import {
  upsertSitePages,
  pineconeSiteNamespaceRecordCount,
} from "../src/services/vectorstore";
import { initAppDatabase, getPageHashes } from "../src/services/db";

async function main() {
  const [siteId, siteUrl] = process.argv.slice(2);
  if (!siteId || !siteUrl) {
    console.error("Usage: npx tsx apps/api/scripts/fix-failed-upserts.ts <siteId> <siteUrl>");
    process.exit(1);
  }

  await initAppDatabase();

  const sitemapEntries = await getSitemapEntries(siteUrl);
  const hashes = await getPageHashes(siteId);
  const indexedUrls = Object.keys(hashes);

  // The resume crawl processed remaining URLs (those not in the initial 116).
  // Failures were in resume batches 9 and 12 (0-indexed batches 8 and 11).
  // Each batch is 10 URLs from the remaining list, sorted by sitemap order.
  const initialCount = 116;
  const remaining = sitemapEntries.filter((e) => {
    // Approximate: URLs that were in the "remaining" list during resume
    // Since we don't know the exact set, just re-process batches 9 and 12
    return true;
  });

  // Filter to only the URLs that were in the remaining set during resume
  const initialHashes = new Set<string>(); // We don't have this, so use sitemap order
  const remainingUrls = sitemapEntries
    .map((e) => e.url)
    .filter((u) => indexedUrls.includes(u));

  // Batches 9 and 12 from the remaining set (0-indexed: items 80-89 and 110-119)
  const batch9Start = (9 - 1) * 10; // 80
  const batch12Start = (12 - 1) * 10; // 110

  // We need to reconstruct the remaining URL list in the same order.
  // The resume script filtered: sitemapEntries not in the initial 116 hashes.
  // We can't perfectly reconstruct, so just grab all indexed URLs and
  // use a smarter approach: check Pinecone for each page's vectors.

  // Better approach: just check which pages have missing vectors
  console.log(`[fix] Checking all ${indexedUrls.length} pages for missing Pinecone vectors...`);

  const { Pinecone } = await import("@pinecone-database/pinecone");
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const idx = process.env.PINECONE_HOST
    ? pc.index(process.env.PINECONE_INDEX!, process.env.PINECONE_HOST)
    : pc.index(process.env.PINECONE_INDEX!);
  const ns = idx.namespace(`site_${siteId}`);

  const crypto = await import("crypto");
  function urlHash(url: string): string {
    return crypto.createHash("sha256").update(url).digest("hex").slice(0, 16);
  }

  const missingUrls: string[] = [];
  const CHECK_BATCH = 20;

  for (let i = 0; i < indexedUrls.length; i += CHECK_BATCH) {
    const batch = indexedUrls.slice(i, i + CHECK_BATCH);
    for (const url of batch) {
      const prefix = `${urlHash(url)}_`;
      try {
        const listed = await ns.listPaginated({ prefix, limit: 1 });
        const hasVectors = (listed.vectors?.length ?? 0) > 0;
        if (!hasVectors) {
          missingUrls.push(url);
        }
      } catch {
        missingUrls.push(url);
      }
    }
    if ((i + CHECK_BATCH) % 100 === 0) {
      console.log(`[fix] Checked ${Math.min(i + CHECK_BATCH, indexedUrls.length)}/${indexedUrls.length} pages, ${missingUrls.length} missing so far`);
    }
  }

  console.log(`[fix] Found ${missingUrls.length} pages with missing vectors`);

  if (missingUrls.length === 0) {
    console.log("[fix] All pages have vectors in Pinecone — nothing to fix!");
    process.exit(0);
  }

  console.log(`[fix] Re-crawling and re-upserting ${missingUrls.length} pages...`);
  for (const url of missingUrls) {
    console.log(`  - ${url}`);
  }

  const BATCH_SIZE = 10;
  let totalInserted = 0;
  let totalFailed = 0;

  for (let i = 0; i < missingUrls.length; i += BATCH_SIZE) {
    const batchUrls = missingUrls.slice(i, i + BATCH_SIZE);
    console.log(`[fix] Crawling ${batchUrls.length} URLs...`);

    const pages = await crawlPages(batchUrls);
    if (pages.length > 0) {
      const result = await upsertSitePages(siteId, pages);
      totalInserted += result.insertedCount;
      totalFailed += result.failedCount;
    }
    await shutdownBrowser();
  }

  const finalCount = await pineconeSiteNamespaceRecordCount(siteId);
  console.log(`\n[fix] Done!`);
  console.log(`  Re-upserted: ${totalInserted} chunks`);
  console.log(`  Still failed: ${totalFailed} chunks`);
  console.log(`  Pinecone total records: ${finalCount}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[fix] Fatal error:", err);
  process.exit(1);
});
