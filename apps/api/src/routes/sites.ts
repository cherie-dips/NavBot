import { Router, type Request, type Response } from "express";
import { crawlSite, crawlPages } from "../services/crawler";
import { upsertSitePages, deletePagesFromSite } from "../services/vectorstore";

export const router: Router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const { url, siteId: explicitSiteId } = req.body as {
      url?: string;
      siteId?: string;
    };

    if (!url) {
      return res.status(400).json({ error: "url is required" });
    }

    const siteUrl = new URL(url);
    const siteId = explicitSiteId || siteUrl.hostname;

    const pages = await crawlSite(siteUrl.toString());

    const { insertedCount, failedCount } = await upsertSitePages(siteId, pages);

    res.json({
      siteId,
      pageCount: pages.length,
      stored: insertedCount,
      failed: failedCount,
    });
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

router.post("/:siteId/reindex", async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const { url } = req.body as { url?: string };

    if (!url) {
      return res.status(400).json({ error: "url is required" });
    }

    const pages = await crawlSite(url);
    const { insertedCount, failedCount } = await upsertSitePages(siteId, pages, { replaceExisting: true });

    res.json({
      siteId,
      pageCount: pages.length,
      stored: insertedCount,
      failed: failedCount,
      reindexed: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed_to_reindex_site" });
  }
});

