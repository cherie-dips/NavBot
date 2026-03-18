import { Router, type Request, type Response } from "express";
import { crawlSite, crawlPages } from "../services/crawler";
import { upsertSitePages, deletePagesFromSite, deleteSiteCollection } from "../services/vectorstore";
import { upsertSite, getSitesByUser, deleteSite, upsertSiteTheme, getSiteTheme, getSiteThemePublic, DEFAULT_THEME, type WidgetTheme } from "../services/db";

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

/* ── Index a new site ──────────────────────────────────────────────────── */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { url, siteId: explicitSiteId, userId } = req.body as {
      url?: string;
      siteId?: string;
      userId?: string;
    };

    if (!url) {
      return res.status(400).json({ error: "url is required" });
    }

    const siteUrl = new URL(url);
    const siteId = explicitSiteId || siteUrl.hostname;
    const hostname = siteUrl.hostname;

    const pages = await crawlSite(siteUrl.toString());
    const { insertedCount, failedCount } = await upsertSitePages(siteId, pages);

    if (userId) {
      upsertSite({ siteId, userId, url, hostname, pagesIndexed: insertedCount });
    }

    res.json({ siteId, pageCount: pages.length, stored: insertedCount, failed: failedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed_to_index_site" });
  }
});

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
    res.json({ siteId, requestedUrls: urls.length, pagesFound: pages.length, stored: insertedCount, failed: failedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed_to_update_pages" });
  }
});

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
  const vectorDeleted = await deleteSiteCollection(siteId);
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

/* ── Get widget config (public — called by the widget itself) ──────────── */
router.get("/:siteId/widget-config", (req: Request, res: Response) => {
  const { siteId } = req.params;
  const theme = getSiteThemePublic(siteId) ?? DEFAULT_THEME;
  res.json({ siteId, theme });
});