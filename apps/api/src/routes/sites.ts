import { Router, type Request, type Response } from "express";
import { crawlSite, crawlPages, shutdownBrowser, discoverUrls, normalizeUrl } from "../services/crawler";
import { compileSiteKnowledge } from "../services/knowledge-compiler";
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
  getSocialHandles,
  upsertSocialHandles,
  type SocialHandles,
  setIndexingActive,
  deleteKnowledgeForSite,
  hasKnowledgeTopics,
} from "../services/db";
import { getOrGenerateFaqs, refreshFaqs, saveFaqUserAnswer } from "../services/faq";

export const router: Router = Router();

/** Accepts "example.com" and "https://example.com" — bare hosts get https:// */
function parsePublicSiteUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new TypeError("URL is empty");
  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return new URL(withScheme);
}

function indexErrorResponse(err: unknown): { status: number; body: Record<string, string> } {
  const msg = err instanceof Error ? err.message : String(err);

  if (
    err instanceof TypeError ||
    /invalid url/i.test(msg) ||
    /^(Failed to parse URL|Invalid URL)/i.test(msg)
  ) {
    return {
      status: 400,
      body: {
        error: "invalid_url",
        message:
          "That does not look like a valid web address. Use a full URL with https, e.g. https://www.example.com",
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "failed_to_index_site",
      message:
        "Something went wrong while indexing. Check the API service logs on Render for details.",
    },
  };
}

/* ── List all sites for a user ─────────────────────────────────────────── */
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    if (!userId) {
      return res.status(400).json({ error: "userId query param is required" });
    }
    const sites = await getSitesByUser(userId);
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
  } catch (err) {
    console.error("[sites-list]", err);
    res.status(500).json({ error: "failed_to_load_sites" });
  }
});

/* ── Dashboard analytics (conversations, volume, top queries) ──────────── */
const statsCache = new Map<string, { data: unknown; ts: number }>();
const STATS_CACHE_TTL = 60_000;

router.get("/dashboard-stats", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const siteIdRaw = req.query.siteId as string | undefined;
    if (!userId) {
      return res.status(400).json({ error: "userId query param is required" });
    }
    const filterSiteId = siteIdRaw?.trim() ? siteIdRaw.trim() : null;
    const cacheKey = `${userId}:${filterSiteId ?? "all"}`;
    const cached = statsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < STATS_CACHE_TTL) {
      return res.json(cached.data);
    }
    const data = await getDashboardAnalytics(userId, filterSiteId);
    if (!data) {
      return res.status(403).json({ error: "site not found or access denied" });
    }
    statsCache.set(cacheKey, { data, ts: Date.now() });
    res.json(data);
  } catch (err) {
    console.error("[dashboard-stats]", err);
    res.status(500).json({ error: "failed_to_load_stats" });
  }
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

    let siteUrl: URL;
    try {
      siteUrl = parsePublicSiteUrl(url);
    } catch {
      return res.status(400).json({
        error: "invalid_url",
        message:
          "Enter a valid site URL (you can use example.com — https:// will be added automatically).",
      });
    }
    const siteId = explicitSiteId || siteUrl.hostname;
    const hostname = siteUrl.hostname;

    setIndexingActive(true);

    const existingHashes = await getPageHashes(siteId);
    const alreadyCrawled = Object.keys(existingHashes).length > 0;

    if (alreadyCrawled) {
      const hasTopics = await hasKnowledgeTopics(siteId);
      if (hasTopics) {
        const pageCount = Object.keys(existingHashes).length;
        console.log(
          `[index] Site "${siteId}" already indexed (${pageCount} page hashes, knowledge topics exist). ` +
            `Linking to user ${userId ?? "(no userId)"} without re-crawling.`
        );

        if (userId) {
          await upsertSite({ siteId, userId, url, hostname, pagesIndexed: pageCount });
        }

        return res.json({
          siteId,
          pageCount,
          stored: pageCount,
          failed: 0,
          reused: true,
        });
      }

      console.warn(
        `[index] Site "${siteId}" has DB page hashes but no knowledge topics — re-crawling and compiling.`
      );
    }

    // Combine sitemap + BFS discovery for maximum coverage
    let sitemapEntries: Awaited<ReturnType<typeof getSitemapEntries>> = [];

    try {
      sitemapEntries = await getSitemapEntries(siteUrl.toString());
    } catch { /* ignore — fall through to BFS */ }

    const BATCH_SIZE = 10;
    let allCrawledPages: Awaited<ReturnType<typeof crawlSite>> = [];
    const crawledUrls = new Set<string>();

    if (sitemapEntries.length > 0) {
      const sitemapUrls = sitemapEntries.map((e) => e.url);
      const sitemapSet = new Set(sitemapUrls.map((u) => normalizeUrl(u)));

      console.log(`[index] Sitemap has ${sitemapUrls.length} URLs — running BFS discovery for additional pages...`);
      let bfsUrls: string[] = [];
      try {
        const discovered = await discoverUrls(siteUrl.toString(), sitemapSet);
        bfsUrls = discovered.filter((u: string) => !sitemapSet.has(normalizeUrl(u)));
        if (bfsUrls.length > 0) {
          console.log(`[index] BFS discovered ${bfsUrls.length} extra URLs not in sitemap`);
        }
      } catch (err) {
        console.warn(`[index] BFS discovery failed, continuing with sitemap only:`, err);
      }

      const allUrls = [...sitemapUrls, ...bfsUrls];
      console.log(`[index] Total URLs to crawl: ${allUrls.length} (${sitemapUrls.length} sitemap + ${bfsUrls.length} BFS)`);

      for (let i = 0; i < allUrls.length; i += BATCH_SIZE) {
        const batchUrls = allUrls.slice(i, i + BATCH_SIZE);
        console.log(`[index] Batch ${Math.floor(i / BATCH_SIZE) + 1}: crawling ${batchUrls.length} URLs`);
        const batchPages = await crawlPages(batchUrls);
        allCrawledPages.push(...batchPages);
        for (const p of batchPages) crawledUrls.add(p.url);
        await shutdownBrowser();
      }

      const crawledEntries = sitemapEntries.filter((e) => crawledUrls.has(e.url));
      if (crawledEntries.length > 0) {
        await upsertPageLastmods(siteId, crawledEntries.map((e) => ({ url: e.url, lastmod: e.lastmod })));
      }
    } else {
      console.log(`[index] No sitemap — falling back to BFS crawl`);
      allCrawledPages = await crawlSite(siteUrl.toString());
    }

    if (allCrawledPages.length === 0) {
      return res.status(422).json({
        error: "no_pages_crawled",
        message:
          "No pages could be fetched or parsed from that URL. Check that the site is public, the URL is correct, and (on Render) NAVBOT_BROWSER_CRAWL is auto or always for JavaScript-heavy sites.",
      });
    }

    await upsertPageHashes(siteId, allCrawledPages.map((p) => ({ url: p.url, hash: p.hash })));

    const { topicCount } = await compileSiteKnowledge(siteId, allCrawledPages, url);

    if (userId) {
      await upsertSite({ siteId, userId, url, hostname, pagesIndexed: allCrawledPages.length });
    }

    res.json({
      siteId,
      pageCount: allCrawledPages.length,
      stored: allCrawledPages.length,
      topicCount,
      failed: 0,
    });
  } catch (err) {
    console.error("[index]", err);
    const { status, body } = indexErrorResponse(err);
    res.status(status).json(body);
  } finally {
    setIndexingActive(false);
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
    await upsertPageHashes(siteId, pages.map((p) => ({ url: p.url, hash: p.hash })));

    const siteUrl = `https://${siteId}`;
    const { topicCount } = await compileSiteKnowledge(siteId, pages, siteUrl);

    res.json({
      siteId,
      requestedUrls: urls.length,
      pagesFound: pages.length,
      stored: pages.length,
      topicCount,
      failed: 0,
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

    if (pages.length === 0) {
      return res.status(422).json({
        error: "no_pages_crawled",
        message: "No pages could be fetched from that URL.",
      });
    }

    await upsertPageHashes(siteId, pages.map((p) => ({ url: p.url, hash: p.hash })));
    const { topicCount } = await compileSiteKnowledge(siteId, pages, url);

    if (userId) {
      const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();
      await upsertSite({ siteId, userId, url, hostname, pagesIndexed: pages.length });
    }

    res.json({ siteId, pageCount: pages.length, stored: pages.length, topicCount, failed: 0, reindexed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed_to_reindex_site" });
  }
});

/* ── Delete a site ─────────────────────────────────────────────────────── */
router.delete("/:siteId", async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const userId = req.query.userId as string | undefined;
    if (!userId) return res.status(400).json({ error: "userId query param is required" });

    const dbDeleted = await deleteSite(siteId, userId);

    const remainingUsers = await getSiteCountBySiteId(siteId);

    if (remainingUsers === 0) {
      await deleteKnowledgeForSite(siteId);
      await deletePageHashes(siteId);
      await purgeSiteDerivedData(siteId);
    }

    res.json({ deleted: dbDeleted, knowledgeCleared: remainingUsers === 0 });
  } catch (err) {
    console.error("[delete site] error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/* ── Save widget theme ─────────────────────────────────────────────────── */
router.put("/:siteId/theme", async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const userId = req.query.userId as string | undefined;
    if (!userId) return res.status(400).json({ error: "userId query param is required" });

    const theme = req.body as WidgetTheme;
    if (!theme?.primary) return res.status(400).json({ error: "theme.primary is required" });

    const saved = await upsertSiteTheme(siteId, userId, theme);
    if (!saved) return res.status(404).json({ error: "site not found" });
    res.json({ ok: true, theme });
  } catch (err) {
    console.error("[put theme] error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/* ── Get widget theme (dashboard) ──────────────────────────────────────── */
router.get("/:siteId/theme", async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const userId = req.query.userId as string | undefined;
    if (!userId) return res.status(400).json({ error: "userId query param is required" });

    const theme = (await getSiteTheme(siteId, userId)) ?? DEFAULT_THEME;
    res.json(theme);
  } catch (err) {
    console.error("[get theme] error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/* ── Get widget config (public — called by widget itself) ──────────────── */
const widgetConfigCache = new Map<string, { data: unknown; ts: number }>();
const WIDGET_CACHE_TTL = 120_000;

router.get("/:siteId/widget-config", async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const cached = widgetConfigCache.get(siteId);
    if (cached && Date.now() - cached.ts < WIDGET_CACHE_TTL) {
      return res.json(cached.data);
    }
    const theme = (await getSiteThemePublic(siteId)) ?? DEFAULT_THEME;
    const data = { siteId, theme };
    widgetConfigCache.set(siteId, { data, ts: Date.now() });
    res.json(data);
  } catch (err) {
    console.error("[widget-config] error:", err);
    res.json({ siteId: req.params.siteId, theme: DEFAULT_THEME });
  }
});

/* ── Get FAQs for a site (public — called by the widget) ───────────────── */
const faqCache = new Map<string, { data: unknown; ts: number }>();
const FAQ_CACHE_TTL = 120_000;

router.get("/:siteId/faqs", async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const includeAnswers =
      req.query.includeAnswers === "1" || req.query.includeAnswers === "true";
    const cacheKey = `${siteId}:${includeAnswers}`;
    const cached = faqCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < FAQ_CACHE_TTL) {
      return res.json(cached.data);
    }
    const faqs = await getOrGenerateFaqs(siteId, { includeAnswers });
    const data = { siteId, faqs };
    faqCache.set(cacheKey, { data, ts: Date.now() });
    res.json(data);
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

/* ── Get social handles ───────────────────────────────────────────────── */
router.get("/:siteId/social", async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const handles = await getSocialHandles(siteId);
    res.json(handles);
  } catch (err) {
    console.error("[get social] error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/* ── Save / update social handles ─────────────────────────────────────── */
router.patch("/:siteId/social", async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const userId = req.query.userId as string | undefined;
    if (!userId) return res.status(400).json({ error: "userId query param is required" });

    const handles = req.body as SocialHandles;
    const saved = await upsertSocialHandles(siteId, userId, handles);
    if (!saved) return res.status(404).json({ error: "site not found" });
    res.json({ ok: true, handles });
  } catch (err) {
    console.error("[patch social] error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/* ── Save user-edited FAQ answer (dashboard) ───────────────────────────── */
router.patch("/:siteId/faqs/:faqId", async (req: Request, res: Response) => {
  try {
    const { siteId, faqId } = req.params;
    const { answer } = req.body as { answer?: string };
    if (!answer?.trim()) {
      return res.status(400).json({ error: "answer is required" });
    }
    const id = Number(faqId);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "invalid faqId" });
    }
    const ok = await saveFaqUserAnswer(siteId, id, answer);
    if (!ok) return res.status(404).json({ error: "faq not found" });
    res.json({ ok: true, siteId, faqId: id });
  } catch (err) {
    console.error("[patch faq] error:", err);
    res.status(500).json({ error: "internal_error" });
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