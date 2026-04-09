import { Router, type Request, type Response } from "express";
import { crawlSite, crawlPages } from "../services/crawler";
import { upsertSitePages, deletePagesFromSite, deleteSiteCollection } from "../services/vectorstore";
import { getSitemapEntries } from "../services/sitemap";
import { trySitemapSync } from "../services/auto-sync";
import {
  upsertSite,
  getSitesByUser,
  deleteSite,
  getSiteCountBySiteId,
  upsertSiteTheme,
  getSiteTheme,
  getSiteThemePublic,
  DEFAULT_THEME,
  type WidgetTheme,
  getPageHashes,
  upsertPageHashes,
  upsertPageLastmods,
  deletePageHashes,
  getDashboardAnalytics,
  purgeSiteDerivedData,
} from "../services/db";
import { getOrGenerateFaqs, refreshFaqs } from "../services/faq";

export const router: Router = Router();

/* ── List all sites for a user ─────────────────────────────────────────── */
router.get("/", (req: Request, res: Response) => {
  const userId = req.query.userId as string | undefined;
  if (!userId) {
    return res.status(400).json({ error: "userId query param is required" });
  }
  const sites = getSitesByUser(userId);
  res.json(
    sites.map((s) => ({
      id: s.site_id,
      url: s.url,
      hostname: s.hostname,
      status: s.status,
      pagesIndexed: s.pages_indexed,
      lastCrawled: s.last_crawled,
      addedAt: s.added_at,
      widgetTheme: s.widget_theme ? JSON.parse(s.widget_theme) : null,
    }))
  );
});

/* ── Dashboard analytics (conversations, volume, top queries) ──────────── */
router.get("/dashboard-stats", (req: Request, res: Response) => {
  const userId = req.query.userId as string | undefined;
  const siteIdRaw = req.query.siteId as string | undefined;
  if (!userId) {
    return res.status(400).json({ error: "userId query param is required" });
  }
  const filterSiteId = siteIdRaw?.trim() ? siteIdRaw.trim() : null;
  const data = getDashboardAnalytics(userId, filterSiteId);
  if (!data) {
    return res.status(403).json({ error: "site not found or access denied" });
  }
  res.json(data);
});

/* ── Index a new site ──────────────────────────────────────────────────── */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { url, siteId: explicitSiteId, userId } = req.body as {
      url?: string;
      siteId?: string;
      userId?: string;
    };

    if (!url) return res.status(400).json({ error: "url is required" });

    const siteUrl = new URL(url);
    const siteId = explicitSiteId || siteUrl.hostname;
    const hostname = siteUrl.hostname;

    // Check if this site has already been crawled (by any user)
    const existingHashes = getPageHashes(siteId);
    const alreadyCrawled = Object.keys(existingHashes).length > 0;

    if (alreadyCrawled) {
      // Site data already exists in ChromaDB — just register this user
      const pageCount = Object.keys(existingHashes).length;
      console.log(
        `[index] Site "${siteId}" already crawled (${pageCount} pages). ` +
          `Linking to user ${userId} without re-crawling.`
      );

      if (userId) {
        upsertSite({ siteId, userId, url, hostname, pagesIndexed: pageCount });
      }

      return res.json({
        siteId,
        pageCount,
        stored: pageCount,
        failed: 0,
        reused: true,
      });
    }

    // First time crawling this site
    const pages = await crawlSite(siteUrl.toString());
    const { insertedCount, failedCount } = await upsertSitePages(siteId, pages);

    if (userId) {
      upsertSite({ siteId, userId, url, hostname, pagesIndexed: insertedCount });
    }

    // Persist content hashes so future syncs can detect changed pages
    upsertPageHashes(siteId, pages.map((p) => ({ url: p.url, hash: p.hash })));

    // Pre-populate sitemap lastmod values so future syncs can diff correctly
    getSitemapEntries(siteUrl.toString())
      .then((entries) => {
        if (entries.length > 0) {
          upsertPageLastmods(siteId, entries.map((e) => ({ url: e.url, lastmod: e.lastmod })));
          console.log(`[index] Stored ${entries.length} sitemap lastmod values for "${siteId}"`);
        }
      })
      .catch(() => {}); // non-critical

    res.json({ siteId, pageCount: pages.length, stored: insertedCount, failed: failedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed_to_index_site" });
  }
});

/* ── Update specific pages ─────────────────────────────────────────────── */
router.patch("/:siteId/pages", async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const { urls } = req.body as { urls?: string[] };

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: "urls array is required" });
    }

    const pages = await crawlPages(urls);
    await deletePagesFromSite(siteId, urls);
    const { insertedCount, failedCount } = await upsertSitePages(siteId, pages);

    // Update hashes for re-crawled pages
    upsertPageHashes(siteId, pages.map((p) => ({ url: p.url, hash: p.hash })));

    res.json({
      siteId,
      requestedUrls: urls.length,
      pagesFound: pages.length,
      stored: insertedCount,
      failed: failedCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed_to_update_pages" });
  }
});

/* ── Reindex entire site ───────────────────────────────────────────────── */
router.post("/:siteId/reindex", async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const { url, userId } = req.body as { url?: string; userId?: string };

    if (!url) return res.status(400).json({ error: "url is required" });

    const pages = await crawlSite(url);
    const { insertedCount, failedCount } = await upsertSitePages(siteId, pages, { replaceExisting: true });

    if (userId) {
      const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();
      upsertSite({ siteId, userId, url, hostname, pagesIndexed: insertedCount });
    }

    // Full reindex — overwrite all stored hashes
    upsertPageHashes(siteId, pages.map((p) => ({ url: p.url, hash: p.hash })));

    res.json({ siteId, pageCount: pages.length, stored: insertedCount, failed: failedCount, reindexed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed_to_reindex_site" });
  }
});

/* ── Delete a site ─────────────────────────────────────────────────────── */
router.delete("/:siteId", async (req: Request, res: Response) => {
  const { siteId } = req.params;
  const userId = req.query.userId as string | undefined;
  if (!userId) return res.status(400).json({ error: "userId query param is required" });

  const dbDeleted = deleteSite(siteId, userId);

  // Only delete ChromaDB collection + hashes if no other user references this site
  const remainingUsers = getSiteCountBySiteId(siteId);
  let vectorDeleted = false;

  if (remainingUsers === 0) {
    vectorDeleted = await deleteSiteCollection(siteId);
    deletePageHashes(siteId);
    purgeSiteDerivedData(siteId);
  }

  res.json({ deleted: dbDeleted, vectorStoreCleared: vectorDeleted });
});

/* ── Save widget theme ─────────────────────────────────────────────────── */
router.put("/:siteId/theme", (req: Request, res: Response) => {
  const { siteId } = req.params;
  const userId = req.query.userId as string | undefined;
  if (!userId) return res.status(400).json({ error: "userId query param is required" });

  const theme = req.body as WidgetTheme;
  if (!theme?.primary) return res.status(400).json({ error: "theme.primary is required" });

  const saved = upsertSiteTheme(siteId, userId, theme);
  if (!saved) return res.status(404).json({ error: "site not found" });
  res.json({ ok: true, theme });
});

/* ── Get widget theme (dashboard) ──────────────────────────────────────── */
router.get("/:siteId/theme", (req: Request, res: Response) => {
  const { siteId } = req.params;
  const userId = req.query.userId as string | undefined;
  if (!userId) return res.status(400).json({ error: "userId query param is required" });

  const theme = getSiteTheme(siteId, userId) ?? DEFAULT_THEME;
  res.json(theme);
});

/* ── Get widget config (public — called by widget itself) ──────────────── */
router.get("/:siteId/widget-config", (req: Request, res: Response) => {
  const { siteId } = req.params;
  const theme = getSiteThemePublic(siteId) ?? DEFAULT_THEME;
  res.json({ siteId, theme });
});

/* ── Get FAQs for a site (public — called by the widget) ───────────────── */
router.get("/:siteId/faqs", async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const includeAnswers =
      req.query.includeAnswers === "1" || req.query.includeAnswers === "true";
    const faqs = await getOrGenerateFaqs(siteId, { includeAnswers });
    res.json({ siteId, faqs });
  } catch (err) {
    console.error("FAQ fetch error:", err);
    res.status(500).json({ error: "failed_to_get_faqs" });
  }
});

/* ── Force-refresh FAQs (incorporates popular user queries) ────────────── */
router.post("/:siteId/faqs/refresh", async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const faqs = await refreshFaqs(siteId);
    res.json({ siteId, faqs, refreshed: true });
  } catch (err) {
    console.error("FAQ refresh error:", err);
    res.status(500).json({ error: "failed_to_refresh_faqs" });
  }
});

/* ── Ping — widget calls this on load to trigger a background sync ───── */
router.get("/:siteId/ping", (req: Request, res: Response) => {
  const { siteId } = req.params;

  // Fire-and-forget background sync — don't block the widget
  trySitemapSync(siteId).catch((err) => {
    console.error(`[ping] Background sync failed for ${siteId}:`, err);
  });

  res.json({ ok: true });
});