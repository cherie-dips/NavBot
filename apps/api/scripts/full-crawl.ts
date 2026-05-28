import { crawlPages, shutdownBrowser } from "../src/services/crawler";
import {
  upsertSitePages,
  deleteSiteCollection,
} from "../src/services/vectorstore";
import { upsertPageHashes } from "../src/services/db";
import { getSitemapEntries } from "../src/services/sitemap";

const SITE_ID = "plaksha.edu.in";
const SITE_URL = "https://plaksha.edu.in/";
const BATCH_SIZE = 10;
const ENABLE_OCR = true;

const RESUME = process.argv.includes("--resume");

async function getIndexedUrls(): Promise<Set<string>> {
  const { pool } = await import("../src/services/db");
  const result = await pool.query(
    "SELECT url FROM page_lastmod WHERE site_id = $1",
    [SITE_ID]
  );
  return new Set(result.rows.map((r: { url: string }) => r.url));
}

async function main() {
  console.log("=== Full Plaksha Crawl ===");
  console.log(`Site: ${SITE_URL}`);
  console.log(`OCR: ${ENABLE_OCR ? "enabled" : "disabled"}`);
  console.log(`Resume: ${RESUME}`);
  console.log("");

  console.log("[1/4] Fetching sitemap...");
  const entries = await getSitemapEntries(SITE_URL);
  let urls = entries.map((e) => e.url);
  console.log(`Found ${urls.length} URLs in sitemap`);

  if (urls.length === 0) {
    console.error("No URLs found! Aborting.");
    process.exit(1);
  }

  if (RESUME) {
    const already = await getIndexedUrls();
    const before = urls.length;
    urls = urls.filter((u) => !already.has(u));
    console.log(`Resume mode: skipping ${before - urls.length} already-indexed URLs, ${urls.length} remaining`);
  } else {
    console.log("\n[2/4] Clearing existing vectors...");
    try {
      await deleteSiteCollection(SITE_ID);
      console.log("Namespace cleared.");
    } catch {
      console.log("Namespace didn't exist, continuing.");
    }
  }

  console.log(`\n[3/4] Crawling ${urls.length} pages in batches of ${BATCH_SIZE}...`);
  let totalPages = 0;
  let ocrHits = 0;
  const allHashes: Array<{ url: string; hash: string }> = [];
  const startTime = Date.now();

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(urls.length / BATCH_SIZE);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

    console.log(
      `\n--- Batch ${batchNum}/${totalBatches} (${i + 1}-${Math.min(i + BATCH_SIZE, urls.length)} of ${urls.length}) [${elapsed}s elapsed] ---`
    );

    try {
      const pages = await crawlPages(batch, { enableOcr: ENABLE_OCR });

      if (pages.length > 0) {
        for (const p of pages) {
          if (p.content.includes("[Image text:")) ocrHits++;
        }

        await upsertSitePages(SITE_ID, pages);
        allHashes.push(...pages.map((p) => ({ url: p.url, hash: p.hash })));
        totalPages += pages.length;
        console.log(
          `  Crawled ${pages.length} pages, total so far: ${totalPages}`
        );

        // Save hashes after each batch so resume works on crash
        await upsertPageHashes(
          SITE_ID,
          pages.map((p) => ({ url: p.url, hash: p.hash }))
        );
      }
    } catch (err) {
      console.error(`  Batch ${batchNum} failed:`, err);
    }
  }

  // Update pages_indexed count
  const { pool } = await import("../src/services/db");
  const countResult = await pool.query(
    "SELECT COUNT(*) as cnt FROM page_lastmod WHERE site_id = $1",
    [SITE_ID]
  );
  const totalIndexed = parseInt(countResult.rows[0].cnt, 10);
  await pool.query("UPDATE site SET pages_indexed = $1 WHERE site_id = $2", [
    totalIndexed,
    SITE_ID,
  ]);

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log("\n=== Crawl Complete ===");
  console.log(`Pages crawled this run: ${totalPages}`);
  console.log(`Total pages indexed: ${totalIndexed}`);
  console.log(`Pages with OCR text: ${ocrHits}`);
  console.log(`Time: ${totalTime} minutes`);

  await shutdownBrowser();
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
