/**
 * Crawl all sitemap URLs for a site and dump content to a JSON file.
 * Usage: npx tsx apps/api/scripts/crawl-dump.ts <siteUrl> <outputPath>
 */
import "dotenv/config";
import fs from "fs";
import { getSitemapEntries } from "../src/services/sitemap";
import { crawlPages, shutdownBrowser } from "../src/services/crawler";

const BATCH_SIZE = 5;

async function main() {
  const siteUrl = process.argv[2] || "https://plaksha.edu.in";
  const outputPath = process.argv[3] || "crawl-dump.json";

  console.log(`[crawl-dump] Fetching sitemap for ${siteUrl}...`);
  const entries = await getSitemapEntries(siteUrl);
  console.log(`[crawl-dump] Found ${entries.length} URLs in sitemap`);

  const allPages: Array<{ url: string; title: string; content: string }> = [];
  const urls = entries.map((e) => e.url);

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(urls.length / BATCH_SIZE);
    console.log(`[crawl-dump] Batch ${batchNum}/${totalBatches} (${batch.length} URLs)`);

    try {
      const pages = await crawlPages(batch);
      for (const p of pages) {
        allPages.push({ url: p.url, title: p.title, content: p.content });
      }
    } catch (err) {
      console.error(`[crawl-dump] Batch ${batchNum} failed:`, err);
    }
    await shutdownBrowser();
  }

  fs.writeFileSync(outputPath, JSON.stringify(allPages, null, 2));
  console.log(`\n[crawl-dump] Done! ${allPages.length} pages saved to ${outputPath}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[crawl-dump] Fatal:", err);
  process.exit(1);
});
