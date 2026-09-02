/**
 * Sync endpoints for an indexed site.
 *
 *   GET  /api/sites/:siteId/sync               → stats only (fast, no crawl)
 *   GET  /api/sites/:siteId/sync?preview=true  → what a sync would change
 *   POST /api/sites/:siteId/sync               → run it (?full=true forces a BFS re-crawl)
 *
 * The actual sync lives in services/site-sync.ts and is shared with the cron job, so a
 * manual sync and an automatic one do exactly the same work.
 */

import { Router, type Request, type Response } from "express";
import { crawlSite, shutdownBrowser } from "../services/crawl/crawler";
import { upsertSitePages, deletePagesFromSite } from "../services/retrieval/vectorstore";
import { planSitemapSync, syncSiteFromSitemap } from "../services/site-sync";
import {
  getSitesByUser,
  upsertSite,
  getPageHashes,
  upsertPageHashes,
  deletePageHashesForUrls,
  getSyncStats,
  invalidateRagCache,
} from "../services/platform/db";
import { requireSiteOwner, restrictToDashboardOrigin } from "../middleware/require-site-owner";

export const router: Router = Router();

/** The caller's site, or null if they don't own one with this id. */
async function findOwnedSite(userId: string, siteId: string) {
  const sites = await getSitesByUser(userId);
  return sites.find((s) => s.site_id === siteId) ?? null;
}

router.get(
  "/:siteId/sync",
  restrictToDashboardOrigin,
  requireSiteOwner,
  async (req: Request, res: Response) => {
    const { siteId } = req.params;
    const preview = req.query.preview === "true";

    const site = await findOwnedSite(req.userId!, siteId);
    if (!site) return res.status(404).json({ error: "site not found" });

    const stats = await getSyncStats(siteId);
    if (!preview) return res.json({ siteId, ...stats });

    try {
      const plan = await planSitemapSync(siteId, site.url);

      if (plan) {
        return res.json({
          siteId,
          ...stats,
          preview: {
            crawledPages: plan.entries.length,
            changedPages: plan.changed.length,
            unchangedPages: plan.entries.length - plan.changed.length,
            newPages: plan.newUrls.size,
            deletedPages: plan.removed.length,
            changedUrls: plan.changed.slice(0, 20).map((e) => ({
              url: e.url,
              status: plan.newUrls.has(e.url) ? ("new" as const) : ("changed" as const),
            })),
          },
        });
      }

      // No sitemap — the only way to see what changed is to crawl.
      console.log(`[sync preview] No sitemap — BFS crawl preview for ${site.url}`);
      const allPages = await crawlSite(site.url);
      const storedHashes = await getPageHashes(siteId);
      const changedPages = allPages.filter((p) => storedHashes[p.url] !== p.hash);
      const crawledUrls = new Set(allPages.map((p) => p.url));
      const deletedUrls = Object.keys(storedHashes).filter((url) => !crawledUrls.has(url));

      res.json({
        siteId,
        ...stats,
        preview: {
          crawledPages: allPages.length,
          changedPages: changedPages.length,
          unchangedPages: allPages.length - changedPages.length,
          newPages: changedPages.filter((p) => storedHashes[p.url] === undefined).length,
          deletedPages: deletedUrls.length,
          changedUrls: changedPages.slice(0, 20).map((p) => ({
            url: p.url,
            status: storedHashes[p.url] === undefined ? ("new" as const) : ("changed" as const),
          })),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[sync preview] Error:", msg);
      res.status(500).json({ error: "sync_preview_failed", detail: msg });
    }
  }
);

router.post(
  "/:siteId/sync",
  restrictToDashboardOrigin,
  requireSiteOwner,
  async (req: Request, res: Response) => {
    const { siteId } = req.params;
    const forceFull = req.query.full === "true";

    const site = await findOwnedSite(req.userId!, siteId);
    if (!site) return res.status(404).json({ error: "site not found" });

    try {
      if (!forceFull) {
        const result = await syncSiteFromSitemap(site, { logTag: `[sync ${siteId}]` });
        if (result) {
          return res.json({
            siteId,
            ...result,
            ...(result.changed === 0 && result.deleted === 0
              ? { message: "All pages are up to date (sitemap unchanged)." }
              : {}),
          });
        }
      }

      // ── Fallback: full BFS crawl (no sitemap, or ?full=true) ──
      console.log(`[sync] Full BFS crawl for ${site.url}`);
      const allPages = await crawlSite(site.url);

      const storedHashes = await getPageHashes(siteId);
      const changedPages = allPages.filter((p) => storedHashes[p.url] !== p.hash);
      const unchangedCount = allPages.length - changedPages.length;

      const crawledUrls = new Set(allPages.map((p) => p.url));
      const deletedUrls = Object.keys(storedHashes).filter((url) => !crawledUrls.has(url));
      if (deletedUrls.length > 0) {
        console.log(`[sync] Removing ${deletedUrls.length} deleted pages from index`);
        await deletePagesFromSite(siteId, deletedUrls);
        await deletePageHashesForUrls(siteId, deletedUrls);
      }

      if (changedPages.length === 0) {
        await upsertPageHashes(
          siteId,
          allPages.map((p) => ({ url: p.url, hash: p.hash }))
        );
        if (deletedUrls.length > 0) await invalidateRagCache(siteId);
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

      await deletePagesFromSite(
        siteId,
        changedPages.map((p) => p.url)
      );
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

      await upsertPageHashes(
        siteId,
        allPages.map((p) => ({ url: p.url, hash: p.hash }))
      );
      await upsertSite({
        siteId: site.site_id,
        userId: site.user_id,
        url: site.url,
        hostname: site.hostname,
        pagesIndexed: allPages.length,
      });
      // Matches the sitemap path: answers cached from the old index are now wrong.
      await invalidateRagCache(siteId);

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
    } finally {
      await shutdownBrowser();
    }
  }
);
