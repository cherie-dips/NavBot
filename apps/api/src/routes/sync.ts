/**
 * apps/api/src/routes/sync.ts
 *
 * Content-hash-based smart sync for indexed sites.
 *
 * GET  /api/sites/:siteId/sync?userId=...              → stats only
 * GET  /api/sites/:siteId/sync?userId=...&preview=true → diff without re-indexing
 * POST /api/sites/:siteId/sync?userId=...              → run the sync
 */

import { Router, type Request, type Response } from "express";
import { crawlSite, crawlPages, shutdownBrowser } from "../services/crawler";
import { upsertSitePages, deletePagesFromSite } from "../services/vectorstore";
import { getSitemapEntries, diffSitemapEntries } from "../services/sitemap";
import {
  getSitesByUser,
  upsertSite,
  getPageHashes,
  upsertPageHashes,
  upsertPageLastmods,
  getPageLastmods,
  deletePageHashesForUrls,
  getSyncStats,
} from "../services/db";

export const router: Router = Router();

router.get("/:siteId/sync", async (req: Request, res: Response) => {
  const { siteId } = req.params;
  const userId = req.query.userId as string | undefined;
  const preview = req.query.preview === "true";

  if (!userId) return res.status(400).json({ error: "userId query param is required" });

  const sites = await getSitesByUser(userId);
  const site = sites.find((s) => s.site_id === siteId);
  if (!site) return res.status(404).json({ error: "site not found" });

  const stats = await getSyncStats(siteId);

  // Stats only — fast, no crawl
  if (!preview) {
    return res.json({ siteId, ...stats });
  }

  // Preview mode — use sitemap diff (fast) or fall back to BFS crawl
  try {
    const sitemapEntries = await getSitemapEntries(site.url);

    if (sitemapEntries.length > 0) {
      console.log(`[sync preview] Sitemap-based preview for ${site.url} (${sitemapEntries.length} entries)`);
      const storedLastmods = await getPageLastmods(siteId);
      const changedEntries = diffSitemapEntries(sitemapEntries, storedLastmods);

      // Safety net: pages with stored lastmod but never actually indexed (no content hash)
      const existingHashes = await getPageHashes(siteId);
      const neverIndexed = sitemapEntries.filter(
        (e) => storedLastmods[e.url] !== undefined && existingHashes[e.url] === undefined
      );
      for (const entry of neverIndexed) {
        if (!changedEntries.some((c) => c.url === entry.url)) {
          changedEntries.push(entry);
        }
      }

      const sitemapUrls = new Set(sitemapEntries.map((e) => e.url));
      const deletedUrls = Object.keys(storedLastmods).filter((u) => !sitemapUrls.has(u));

      const changedUrlsForDisplay = changedEntries.slice(0, 20).map((e) => ({
        url: e.url,
        status: storedLastmods[e.url] === undefined ? ("new" as const) : ("changed" as const),
      }));

      return res.json({
        siteId,
        ...stats,
        preview: {
          crawledPages: sitemapEntries.length,
          changedPages: changedEntries.length,
          unchangedPages: sitemapEntries.length - changedEntries.length,
          newPages: changedEntries.filter((e) => storedLastmods[e.url] === undefined).length,
          deletedPages: deletedUrls.length,
          changedUrls: changedUrlsForDisplay,
        },
      });
    }

    // Fallback: full BFS crawl preview
    console.log(`[sync preview] No sitemap — BFS crawl preview for ${site.url}`);
    const allPages = await crawlSite(site.url);
    const storedHashes = await getPageHashes(siteId);

    const changedPages = allPages.filter((p) => storedHashes[p.url] !== p.hash);

    const crawledUrls = new Set(allPages.map((p) => p.url));
    const deletedUrls = Object.keys(storedHashes).filter((url) => !crawledUrls.has(url));

    const changedUrlsForDisplay = changedPages.slice(0, 20).map((p) => ({
      url: p.url,
      status: storedHashes[p.url] === undefined ? ("new" as const) : ("changed" as const),
    }));

    res.json({
      siteId,
      ...stats,
      preview: {
        crawledPages: allPages.length,
        changedPages: changedPages.length,
        unchangedPages: allPages.length - changedPages.length,
        newPages: changedPages.filter((p) => storedHashes[p.url] === undefined).length,
        deletedPages: deletedUrls.length,
        changedUrls: changedUrlsForDisplay,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync preview] Error:", msg);
    res.status(500).json({ error: "sync_preview_failed", detail: msg });
  }
});


router.post("/:siteId/sync", async (req: Request, res: Response) => {
  const { siteId } = req.params;
  const userId = req.query.userId as string | undefined;
  const forceFull = req.query.full === "true";

  if (!userId) return res.status(400).json({ error: "userId query param is required" });

  const sites = await getSitesByUser(userId);
  const site = sites.find((s) => s.site_id === siteId);
  if (!site) return res.status(404).json({ error: "site not found" });

  try {
    // ── Try sitemap-first strategy (faster, only crawls what changed) ──
    const sitemapEntries = !forceFull ? await getSitemapEntries(site.url) : [];

    if (sitemapEntries.length > 0) {
      console.log(`[sync] Sitemap-based sync for ${site.url} (${sitemapEntries.length} entries)`);

      // 1. Diff sitemap lastmod against stored values
      const storedLastmods = await getPageLastmods(siteId);
      const changedEntries = diffSitemapEntries(sitemapEntries, storedLastmods);

      // 1b. Safety net: pages with stored lastmod but never actually indexed (no content hash)
      const existingHashes = await getPageHashes(siteId);
      const neverIndexed = sitemapEntries.filter(
        (e) => storedLastmods[e.url] !== undefined && existingHashes[e.url] === undefined
      );
      if (neverIndexed.length > 0) {
        console.log(`[sync] Found ${neverIndexed.length} pages with lastmod but no content hash — adding to crawl list`);
        for (const entry of neverIndexed) {
          if (!changedEntries.some((c) => c.url === entry.url)) {
            changedEntries.push(entry);
          }
        }
      }

      // 2. Detect removed pages
      const sitemapUrls = new Set(sitemapEntries.map((e) => e.url));
      const deletedUrls = Object.keys(storedLastmods).filter((u) => !sitemapUrls.has(u));

      if (deletedUrls.length > 0) {
        console.log(`[sync] Removing ${deletedUrls.length} pages no longer in sitemap`);
        await deletePagesFromSite(siteId, deletedUrls);
        await deletePageHashesForUrls(siteId, deletedUrls);
      }

      if (changedEntries.length === 0) {
        return res.json({
          siteId,
          message: "All pages are up to date (sitemap unchanged).",
          method: "sitemap",
          checked: sitemapEntries.length,
          changed: 0,
          unchanged: sitemapEntries.length,
          deleted: deletedUrls.length,
          stored: 0,
          failed: 0,
        });
      }

      // 3. Crawl in batches to avoid OOM on large sites
      const BATCH_SIZE = 10;
      const urlsToCrawl = changedEntries.map((e) => e.url);
      console.log(`[sync] Crawling ${urlsToCrawl.length} changed/new URLs in batches of ${BATCH_SIZE}`);

      const storedHashes = await getPageHashes(siteId);
      let totalCrawled = 0;
      let totalChanged = 0;
      let insertedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < urlsToCrawl.length; i += BATCH_SIZE) {
        const batchUrls = urlsToCrawl.slice(i, i + BATCH_SIZE);
        console.log(`[sync] Batch ${Math.floor(i / BATCH_SIZE) + 1}: crawling ${batchUrls.length} URLs`);
        const batchPages = await crawlPages(batchUrls);
        totalCrawled += batchPages.length;

        const batchChanged = batchPages.filter((p) => storedHashes[p.url] !== p.hash);
        totalChanged += batchChanged.length;

        if (batchChanged.length > 0) {
          await deletePagesFromSite(siteId, batchChanged.map((p) => p.url));
          const result = await upsertSitePages(siteId, batchChanged);
          insertedCount += result.insertedCount;
          failedCount += result.failedCount;
        }

        await upsertPageHashes(siteId, batchPages.map((p) => ({ url: p.url, hash: p.hash })));
        const batchEntries = changedEntries.filter((e) => batchUrls.includes(e.url));
        await upsertPageLastmods(siteId, batchEntries.map((e) => ({ url: e.url, lastmod: e.lastmod })));

        await shutdownBrowser();
      }

      const unchangedCount = totalCrawled - totalChanged;
      console.log(
        `[sync] ${totalCrawled} crawled, ${totalChanged} have new content, ${unchangedCount} unchanged`
      );

      // 6. Update site metadata
      const totalPages = sitemapEntries.length - deletedUrls.length;
      await upsertSite({
        siteId: site.site_id,
        userId: site.user_id,
        url: site.url,
        hostname: site.hostname,
        pagesIndexed: Math.max(totalPages, 0),
      });

      return res.json({
        siteId,
        method: "sitemap",
        checked: sitemapEntries.length,
        changed: totalChanged,
        unchanged: sitemapEntries.length - changedEntries.length + unchangedCount,
        deleted: deletedUrls.length,
        stored: insertedCount,
        failed: failedCount,
      });
    }

    // ── Fallback: full BFS crawl (no sitemap available or force-full) ──
    console.log(`[sync] Full BFS crawl for ${site.url}`);
    const allPages = await crawlSite(site.url);

    const storedHashes = await getPageHashes(siteId);
    const changedPages = allPages.filter((p) => storedHashes[p.url] !== p.hash);
    const unchangedCount = allPages.length - changedPages.length;

    console.log(
      `[sync] ${allPages.length} pages crawled — ` +
        `${changedPages.length} changed, ${unchangedCount} unchanged`
    );

    // Handle deleted pages
    const crawledUrls = new Set(allPages.map((p) => p.url));
    const deletedUrls = Object.keys(storedHashes).filter((url) => !crawledUrls.has(url));

    if (deletedUrls.length > 0) {
      console.log(`[sync] Removing ${deletedUrls.length} deleted pages from index`);
      await deletePagesFromSite(siteId, deletedUrls);
      await deletePageHashesForUrls(siteId, deletedUrls);
    }

    if (changedPages.length === 0) {
      await upsertPageHashes(siteId, allPages.map((p) => ({ url: p.url, hash: p.hash })));

      return res.json({
        siteId,
        method: "bfs",
        message: "All pages are up to date.",
        checked: allPages.length,
        changed: 0,
        unchanged: unchangedCount,
        deleted: deletedUrls.length,
        stored: 0,
        failed: 0,
      });
    }

    await deletePagesFromSite(siteId, changedPages.map((p) => p.url));
    const { insertedCount, failedCount, totalChunks } = await upsertSitePages(
      siteId,
      changedPages
    );

    if (totalChunks > 0 && insertedCount === 0) {
      return res.status(502).json({
        error: "pinecone_upsert_failed",
        message:
          "Full sync crawled changed pages but Pinecone stored no vectors. See API logs and PINECONE_* configuration.",
      });
    }

    await upsertPageHashes(siteId, allPages.map((p) => ({ url: p.url, hash: p.hash })));

    await upsertSite({
      siteId: site.site_id,
      userId: site.user_id,
      url: site.url,
      hostname: site.hostname,
      pagesIndexed: allPages.length,
    });

    res.json({
      siteId,
      method: "bfs",
      checked: allPages.length,
      changed: changedPages.length,
      unchanged: unchangedCount,
      deleted: deletedUrls.length,
      stored: insertedCount,
      failed: failedCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync] Error:", msg);
    res.status(500).json({ error: "sync_failed", detail: msg });
  }
});