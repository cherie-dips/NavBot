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
import { crawlSite, crawlPages } from "../services/crawler";
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

      // 3. Crawl only changed/new URLs
      const urlsToCrawl = changedEntries.map((e) => e.url);
      console.log(`[sync] Crawling ${urlsToCrawl.length} changed/new URLs`);
      const crawledPages = await crawlPages(urlsToCrawl);

      // 4. Compare content hashes — skip pages with identical content
      const storedHashes = await getPageHashes(siteId);
      const actuallyChanged = crawledPages.filter((p) => storedHashes[p.url] !== p.hash);
      const unchangedCount = crawledPages.length - actuallyChanged.length;

      console.log(
        `[sync] ${crawledPages.length} crawled, ${actuallyChanged.length} have new content, ${unchangedCount} unchanged`
      );

      let insertedCount = 0;
      let failedCount = 0;

      if (actuallyChanged.length > 0) {
        await deletePagesFromSite(siteId, actuallyChanged.map((p) => p.url));
        const result = await upsertSitePages(siteId, actuallyChanged);
        insertedCount = result.insertedCount;
        failedCount = result.failedCount;
        if (result.totalChunks > 0 && result.insertedCount === 0) {
          return res.status(502).json({
            error: "pinecone_upsert_failed",
            message:
              "Sync crawled changed pages but Pinecone stored no vectors. See API logs and PINECONE_* configuration.",
          });
        }
      }

      // 5. Persist hashes and lastmod
      await upsertPageHashes(siteId, crawledPages.map((p) => ({ url: p.url, hash: p.hash })));
      await upsertPageLastmods(
        siteId,
        changedEntries.map((e) => ({ url: e.url, lastmod: e.lastmod }))
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
        changed: actuallyChanged.length,
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