import { Router, type Request, type Response } from "express";
import { crawlSite, crawlPages } from "../services/crawler";
import {
  upsertSitePages,
  deletePagesFromSite,
  deleteSiteCollection,
  pineconeSiteNamespaceRecordCount,
} from "../services/vectorstore";
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

function pineconeFailureResponse(
  err: unknown,
  msg: string
): { status: number; body: Record<string, string> } | null {
  const name =
    err && typeof err === "object" && "name" in err && typeof (err as Error).name === "string"
      ? (err as Error).name
      : "";

  const authLike =
    name === "PineconeAuthorizationError" ||
    name === "PineconeForbiddenError" ||
    /API key you provided was rejected/i.test(msg) ||
    (/pinecone/i.test(msg) && /401|403|rejected|unauthorized|forbidden|not authorized/i.test(msg));

  if (authLike) {
    return {
      status: 502,
      body: {
        error: "pinecone_auth_failed",
        message:
          "Pinecone rejected your API key. In https://app.pinecone.io copy a current API key for the project that owns index \"" +
          (process.env.PINECONE_INDEX?.trim() || "your-index") +
          "\", set it as PINECONE_API_KEY on Render (navbot-api → Environment), save, and redeploy. Keys are often wrong if pasted with a typo, extra space, or from a different Pinecone project.",
      },
    };
  }

  if (
    msg.includes("PINECONE_API_KEY is required") ||
    msg.includes("PINECONE_INDEX is required")
  ) {
    return {
      status: 503,
      body: {
        error: "pinecone_not_configured",
        message:
          "The API is not configured for search indexing. Set PINECONE_API_KEY and PINECONE_INDEX on the API service (Render → navbot-api → Environment).",
      },
    };
  }

  if (/pinecone/i.test(msg) && /not found|does not exist|404/i.test(msg)) {
    return {
      status: 502,
      body: {
        error: "pinecone_index_not_found",
        message:
          "Pinecone index \"" +
          (process.env.PINECONE_INDEX?.trim() || "") +
          "\" was not found for this API key. Create that index in the Pinecone console or set PINECONE_INDEX to an existing index name.",
      },
    };
  }

  return null;
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

  const pc = pineconeFailureResponse(err, msg);
  if (pc) return pc;

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
});

/* ── Dashboard analytics (conversations, volume, top queries) ──────────── */
router.get("/dashboard-stats", async (req: Request, res: Response) => {
  const userId = req.query.userId as string | undefined;
  const siteIdRaw = req.query.siteId as string | undefined;
  if (!userId) {
    return res.status(400).json({ error: "userId query param is required" });
  }
  const filterSiteId = siteIdRaw?.trim() ? siteIdRaw.trim() : null;
  const data = await getDashboardAnalytics(userId, filterSiteId);
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

    // Skip crawl only if SQLite has hashes *and* Pinecone already has vectors for this site.
    const existingHashes = await getPageHashes(siteId);
    const alreadyCrawled = Object.keys(existingHashes).length > 0;

    if (alreadyCrawled) {
      const vecCount = await pineconeSiteNamespaceRecordCount(siteId);
      if (vecCount > 0) {
        const pageCount = Object.keys(existingHashes).length;
        console.log(
          `[index] Site "${siteId}" already indexed (${pageCount} page hashes, ${vecCount} Pinecone records). ` +
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
        `[index] Site "${siteId}" has DB page hashes but Pinecone namespace "site_${siteId}" is empty — re-crawling and re-upserting.`
      );
    }

    const pages = await crawlSite(siteUrl.toString());

    if (pages.length === 0) {
      return res.status(422).json({
        error: "no_pages_crawled",
        message:
          "No pages could be fetched or parsed from that URL. Check that the site is public, the URL is correct, and (on Render) NAVBOT_BROWSER_CRAWL is auto or always for JavaScript-heavy sites.",
      });
    }

    const { insertedCount, failedCount, totalChunks } = await upsertSitePages(
      siteId,
      pages
    );

    if (totalChunks > 0 && insertedCount === 0) {
      console.error(
        `[index] Pinecone accepted 0 / ${totalChunks} chunks for site "${siteId}". Check PINECONE_* env and server logs.`
      );
      return res.status(502).json({
        error: "pinecone_upsert_failed",
        message:
          "Crawl finished but no vectors were stored in Pinecone. Check the API server logs and PINECONE_API_KEY / PINECONE_INDEX.",
      });
    }

    if (userId) {
      await upsertSite({ siteId, userId, url, hostname, pagesIndexed: insertedCount });
    }

    // Persist content hashes so future syncs can detect changed pages
    await upsertPageHashes(siteId, pages.map((p) => ({ url: p.url, hash: p.hash })));

    // Pre-populate sitemap lastmod values so future syncs can diff correctly
    getSitemapEntries(siteUrl.toString())
      .then((entries) => {
        if (entries.length > 0) {
          void upsertPageLastmods(
            siteId,
            entries.map((e) => ({ url: e.url, lastmod: e.lastmod }))
          ).catch(() => {});
          console.log(`[index] Stored ${entries.length} sitemap lastmod values for "${siteId}"`);
        }
      })
      .catch(() => {}); // non-critical

    res.json({ siteId, pageCount: pages.length, stored: insertedCount, failed: failedCount });
  } catch (err) {
    console.error("[index]", err);
    const { status, body } = indexErrorResponse(err);
    res.status(status).json(body);
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
    const { insertedCount, failedCount, totalChunks } = await upsertSitePages(
      siteId,
      pages
    );

    if (totalChunks > 0 && insertedCount === 0) {
      return res.status(502).json({
        error: "pinecone_upsert_failed",
        message:
          "Pages were crawled but no vectors were stored in Pinecone. See API logs and PINECONE_* configuration.",
      });
    }

    // Update hashes for re-crawled pages
    await upsertPageHashes(siteId, pages.map((p) => ({ url: p.url, hash: p.hash })));

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
    const { insertedCount, failedCount, totalChunks } = await upsertSitePages(
      siteId,
      pages,
      { replaceExisting: true }
    );

    if (totalChunks > 0 && insertedCount === 0) {
      return res.status(502).json({
        error: "pinecone_upsert_failed",
        message:
          "Reindex crawl finished but Pinecone stored no vectors. See API logs and PINECONE_* configuration.",
      });
    }

    if (userId) {
      const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();
      await upsertSite({ siteId, userId, url, hostname, pagesIndexed: insertedCount });
    }

    // Full reindex — overwrite all stored hashes
    await upsertPageHashes(siteId, pages.map((p) => ({ url: p.url, hash: p.hash })));

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

  const dbDeleted = await deleteSite(siteId, userId);

  // Only delete Pinecone namespace + hashes if no other user references this site
  const remainingUsers = await getSiteCountBySiteId(siteId);
  let vectorDeleted = false;

  if (remainingUsers === 0) {
    vectorDeleted = await deleteSiteCollection(siteId);
    await deletePageHashes(siteId);
    await purgeSiteDerivedData(siteId);
  }

  res.json({ deleted: dbDeleted, vectorStoreCleared: vectorDeleted });
});

/* ── Save widget theme ─────────────────────────────────────────────────── */
router.put("/:siteId/theme", async (req: Request, res: Response) => {
  const { siteId } = req.params;
  const userId = req.query.userId as string | undefined;
  if (!userId) return res.status(400).json({ error: "userId query param is required" });

  const theme = req.body as WidgetTheme;
  if (!theme?.primary) return res.status(400).json({ error: "theme.primary is required" });

  const saved = await upsertSiteTheme(siteId, userId, theme);
  if (!saved) return res.status(404).json({ error: "site not found" });
  res.json({ ok: true, theme });
});

/* ── Get widget theme (dashboard) ──────────────────────────────────────── */
router.get("/:siteId/theme", async (req: Request, res: Response) => {
  const { siteId } = req.params;
  const userId = req.query.userId as string | undefined;
  if (!userId) return res.status(400).json({ error: "userId query param is required" });

  const theme = (await getSiteTheme(siteId, userId)) ?? DEFAULT_THEME;
  res.json(theme);
});

/* ── Get widget config (public — called by widget itself) ──────────────── */
router.get("/:siteId/widget-config", async (req: Request, res: Response) => {
  const { siteId } = req.params;
  const theme = (await getSiteThemePublic(siteId)) ?? DEFAULT_THEME;
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

/* ── Get social handles ───────────────────────────────────────────────── */
router.get("/:siteId/social", async (req: Request, res: Response) => {
  const { siteId } = req.params;
  const handles = await getSocialHandles(siteId);
  res.json(handles);
});

/* ── Save / update social handles ─────────────────────────────────────── */
router.patch("/:siteId/social", async (req: Request, res: Response) => {
  const { siteId } = req.params;
  const userId = req.query.userId as string | undefined;
  if (!userId) return res.status(400).json({ error: "userId query param is required" });

  const handles = req.body as SocialHandles;
  const saved = await upsertSocialHandles(siteId, userId, handles);
  if (!saved) return res.status(404).json({ error: "site not found" });
  res.json({ ok: true, handles });
});

/* ── Save user-edited FAQ answer (dashboard) ───────────────────────────── */
router.patch("/:siteId/faqs/:faqId", async (req: Request, res: Response) => {
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