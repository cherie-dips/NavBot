import { Router, type Request, type Response } from "express";
import { extractPaletteFromUrl } from "@repo/color-extractor";

export const router: Router = Router();

/**
 * GET /api/colors?url=https://example.com
 *
 * Fetches the page (+ up to 2 stylesheets) and returns a ranked color palette.
 * Used by the dashboard to let owners pick widget theme colors.
 */
router.get("/", async (req: Request, res: Response) => {
  const url = req.query.url as string | undefined;

  if (!url) {
    return res.status(400).json({ error: "url query param is required" });
  }

  // Basic URL validation
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: "Only http and https URLs are allowed" });
  }

  try {
    const palette = await extractPaletteFromUrl(parsedUrl.toString());
    res.json(palette);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[color-extractor]", msg);
    res.status(500).json({ error: "color_extraction_failed", detail: msg });
  }
});