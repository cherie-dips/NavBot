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

async function main() {
  console.log("=== Full Plaksha Crawl ===");
  console.log(`Site: ${SITE_URL}`);
  console.log(`OCR: ${ENABLE_OCR ? "enabled" : "disabled"}`);
  console.log("");

  // Step 1: Get all URLs from sitemap
  console.log("[1/4] Fetching sitemap...");
  const entries = await getSitemapEntries(SITE_URL);
  const urls = entries.map((e) => e.url);
  console.log(`Found ${urls.length} URLs in sitemap`);

  if (urls.length === 0) {
    console.error("No URLs found! Aborting.");
    process.exit(1);
  }

  // Step 2: Clear existing Pinecone namespace
  console.log("\n[2/4] Clearing existing vectors...");
  await deleteSiteCollection(SITE_ID);
  console.log("Namespace cleared.");

  // Step 3: Crawl in batches and upsert
  console.log(`\n[3/4] Crawling ${urls.length} pages in batches of ${BATCH_SIZE}...`);
  let totalPages = 0;
  let totalChunks = 0;
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
        // Count OCR content
        for (const p of pages) {
          if (p.content.includes("[Image text:")) ocrHits++;
        }

        await upsertSitePages(SITE_ID, pages);
        allHashes.push(...pages.map((p) => ({ url: p.url, hash: p.hash })));
        totalPages += pages.length;
        console.log(
          `  Crawled ${pages.length} pages, total so far: ${totalPages}`
        );
      }
    } catch (err) {
      console.error(`  Batch ${batchNum} failed:`, err);
    }
  }

  // Step 4: Update page hashes in DB
  console.log(`\n[4/4] Updating ${allHashes.length} page hashes in DB...`);
  for (let i = 0; i < allHashes.length; i += 50) {
    await upsertPageHashes(SITE_ID, allHashes.slice(i, i + 50));
  }

  // Update pages_indexed count
  const { pool } = await import("../src/services/db");
  await pool.query("UPDATE site SET pages_indexed = $1 WHERE site_id = $2", [
    totalPages,
    SITE_ID,
  ]);

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log("\n=== Crawl Complete ===");
  console.log(`Pages crawled: ${totalPages} / ${urls.length}`);
  console.log(`Pages with OCR text: ${ocrHits}`);
  console.log(`Time: ${totalTime} minutes`);

  await shutdownBrowser();
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
