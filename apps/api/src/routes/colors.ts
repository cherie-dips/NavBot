import { Router, type Request, type Response } from "express";
import dns from "dns";
import net from "net";
import { extractPaletteFromUrl } from "@repo/color-extractor";

export const router: Router = Router();

/** True for loopback/private/link-local/reserved ranges — the SSRF targets that matter here. */
function isPrivateOrReservedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts as [number, number, number, number];
    return (
      a === 127 || // loopback
      a === 10 || // private
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 169 && b === 254) || // link-local (incl. cloud metadata, e.g. 169.254.169.254)
      a === 0
    );
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
  }
  return true; // couldn't parse — refuse rather than guess
}

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

  // ponytail: resolves once up front, not pinned for the actual fetch — a DNS-rebinding
  // attacker could still slip past this check. Good enough against the common case
  // (localhost/metadata-IP URLs); revisit with a resolver-pinned fetch if this endpoint
  // ever needs to be hardened against a determined attacker rather than accidents.
  try {
    const { address } = await dns.promises.lookup(parsedUrl.hostname);
    if (isPrivateOrReservedIp(address)) {
      return res.status(400).json({ error: "url_not_allowed", message: "That address can't be fetched." });
    }
  } catch {
    return res.status(400).json({ error: "invalid_host", message: "Could not resolve that host." });
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