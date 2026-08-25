import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import crypto from "crypto";
import { execFile } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { fetchRenderedHtml, detectFramework } from "./browser-render";
import { fetchRobotsRules, isUrlAllowedByRobots } from "./sitemap";

export interface CrawledPage {
  url: string;
  title: string;
  content: string;
  /** MD5 of full content — used for change detection in sync */
  hash: string;
  /** Heading hierarchy for each section — used for contextual chunking */
  sections?: Array<{ heading: string; content: string }>;
}

/** Normalize a URL for consistent comparison (strip trailing slash, fragment, sort params). */
export function normalizeUrl(u: string): string {
  try {
    const parsed = new URL(u);
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    return u;
  }
}

interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
}

const DEFAULT_OPTIONS: Required<CrawlOptions> = {
  maxPages: Infinity,
  maxDepth: Infinity,
};

const SKIP_PATH_PATTERNS: RegExp[] = [
  /\.(jpg|jpeg|png|gif|svg|webp|zip|css|js|ico|woff|woff2|ttf|eot)$/i,
  /\/(tag|category|author)\//,
  /\/page\/\d+/,
  /[?&](utm_|ref=|source=)/,
];

const PDF_PATTERN = /\.pdf$/i;

const SKIP_CONTENT_PATTERNS: RegExp[] = [
  /^(404|page not found|access denied|forbidden|unauthorized)/i,
  /this page (does not exist|has been removed|is no longer available)/i,
  /^(please (sign|log) in|login required|authentication required)/i,
  /^(coming soon|under construction|under maintenance)/i,
  /^(please enable javascript|this site requires javascript)/i,
  /^(verify you are human|captcha|please complete the security check)/i,
];


type BrowserCrawlMode = "off" | "auto" | "always";

/**
 * `NAVBOT_BROWSER_CRAWL`:
 * - `auto` (default): fetch HTML, then use Playwright only when extracted text is thin.
 * - `always`: every page through Chromium (slowest, best for heavy SPAs).
 * - `off` / `static`: legacy behavior — HTTP fetch only (fast, no JS).
 */
function parseBrowserCrawlMode(): BrowserCrawlMode {
  const raw = (process.env.NAVBOT_BROWSER_CRAWL || "auto").toLowerCase().trim();
  if (["off", "false", "0", "static", "none"].includes(raw)) return "off";
  if (["always", "true", "1", "browser", "force"].includes(raw)) return "always";
  return "auto";
}

let loggedBrowserCrawlMode = false;

function logBrowserCrawlModeOnce(mode: BrowserCrawlMode): void {
  if (loggedBrowserCrawlMode) return;
  loggedBrowserCrawlMode = true;
  console.log(
    `[crawler] NAVBOT_BROWSER_CRAWL=${mode} — ` +
      (mode === "off"
        ? "HTTP-only (no JS execution)."
        : mode === "always"
          ? "every page via headless Chromium."
          : "headless Chromium when static HTML has little extractable text (SPAs / React / Vue).")
  );
}

interface StaticFetchResult {
  html: string;
  headers: Record<string, string>;
}

async function fetchStaticHtml(url: string): Promise<StaticFetchResult | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "User-Agent": "NavBot/1.0 (site indexer; respectful crawler)",
        Accept: "text/html",
      },
    });

    if (!res.ok) {
      console.warn(`Skipping ${url} — HTTP ${res.status}`);
      return null;
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;

    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => { headers[key] = value; });

    return { html: await res.text(), headers };
  } catch (err) {
    console.error("Failed to fetch", url, err);
    return null;
  }
}

/**
 * Returns final HTML string to parse with Cheerio — either static, or browser-rendered when that yields richer content.
 * If the site is detected as a SPA (React, Vue, Angular, Next.js, etc.), always use Playwright/Jina directly.
 */
async function resolvePageHtml(
  fetchUrl: string,
  normalizedUrl: string,
  mode: BrowserCrawlMode
): Promise<string | null> {
  if (mode === "always") {
    const rendered = await fetchRenderedHtml(fetchUrl);
    if (rendered) return rendered;
    console.warn(`[crawler] Headless render failed for ${fetchUrl}, falling back to static fetch`);
    const result = await fetchStaticHtml(fetchUrl);
    return result?.html ?? null;
  }

  const result = await fetchStaticHtml(fetchUrl);
  if (!result) return null;

  const detection = detectFramework(result.html, result.headers);

  if (detection.isSPA) {
    console.log(
      `[crawler] SPA detected (${detection.framework}, confidence=${detection.confidence}) for ${normalizedUrl} — using browser rendering directly`
    );
    const rendered = await fetchRenderedHtml(fetchUrl);
    if (rendered) return rendered;
    console.warn(`[crawler] Browser render failed for SPA ${normalizedUrl}, using static HTML`);
    return result.html;
  }

  const roughText = result.html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (roughText.length < 200) {
    console.log(`[crawler] Thin static content (${roughText.length} chars) for ${normalizedUrl} — trying browser render`);
    const rendered = await fetchRenderedHtml(fetchUrl);
    if (rendered) return rendered;
  }

  return result.html;
}

function tableToMarkdown($: cheerio.CheerioAPI, table: AnyNode): string {
  const rows: string[][] = [];

  $(table)
    .find("tr")
    .each((_, tr) => {
      const cells = $(tr)
        .find("th, td")
        .map((_, td) => $(td).text().replace(/\s+/g, " ").trim())
        .get();
      if (cells.length > 0) rows.push(cells);
    });

  if (rows.length === 0) return "";

  const colCount = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => {
    while (r.length < colCount) r.push("");
    return r;
  });

  const header = padded[0]!;
  const separator = header.map(() => "---");
  const body = padded.slice(1);
  const toRow = (cells: string[]) => "| " + cells.join(" | ") + " |";
  return [toRow(header), toRow(separator), ...body.map(toRow)].join("\n");
}


function extractMetadata($: cheerio.CheerioAPI): string[] {
  const meta: string[] = [];
  const desc = $('meta[name="description"]').attr("content")?.trim();
  if (desc && desc.length > 10) meta.push(`Description: ${desc}`);
  const ogDesc = $('meta[property="og:description"]').attr("content")?.trim();
  if (ogDesc && ogDesc.length > 10 && ogDesc !== desc) meta.push(`Summary: ${ogDesc}`);

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).text().trim();
      if (!raw) return;
      const ld = JSON.parse(raw) as Record<string, unknown>;
      const pick = (key: string) => {
        const v = ld[key];
        return typeof v === "string" && v.trim().length > 5 ? v.trim() : null;
      };
      const ldDesc = pick("description");
      if (ldDesc && ldDesc !== desc && ldDesc !== ogDesc) meta.push(`Structured: ${ldDesc}`);
      const ldName = pick("name");
      if (ldName) meta.push(`Entity: ${ldName}`);
    } catch { /* ignore bad JSON-LD */ }
  });
  return meta;
}

interface ExtractedSection {
  heading: string;
  content: string;
}

function extractStructuredContent(
  $: cheerio.CheerioAPI,
  url: string,
  title: string
): { text: string; sections: ExtractedSection[] } {
  const metaLines = extractMetadata($);

  $("script, style, noscript, .cookie-banner, .advertisement, .gdpr-banner, .cookie-consent").remove();

  const parts: string[] = [];
  parts.push(`Page Title: ${title}`);
  parts.push(`Page URL: ${url}`);
  if (metaLines.length > 0) parts.push(metaLines.join("\n"));
  parts.push("");

  const contentRoot = $("main, article, [role='main'], .content, #content, body").first();

  // B: Track heading hierarchy for breadcrumbs
  const headingStack: string[] = [];
  const sections: ExtractedSection[] = [];
  let currentSectionParts: string[] = [];

  function flushSection() {
    if (currentSectionParts.length > 0) {
      sections.push({
        heading: headingStack.join(" > "),
        content: currentSectionParts.join("\n"),
      });
      currentSectionParts = [];
    }
  }


  contentRoot.find("h1, h2, h3, h4, h5, h6, p, li, table, blockquote, img, figure, figcaption, span, div, dl, dt, dd, details, summary, address, time, mark").each((_, el) => {
    const tag = (el as Element).tagName?.toLowerCase();
    if (!tag) return;

    if (/^h[1-6]$/.test(tag)) {
      flushSection();
      const level = parseInt(tag[1]!, 10);
      const prefix = "#".repeat(level);
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text) {
        while (headingStack.length >= level) headingStack.pop();
        headingStack.push(text);
        parts.push(`\n${prefix} ${text}`);
      }
      return;
    }

    if (tag === "table") {
      const md = tableToMarkdown($, el);
      if (md) {
        parts.push(`\n${md}\n`);
        currentSectionParts.push(md);
      }
      return;
    }

    if (tag === "img") {
      const alt = $(el).attr("alt")?.trim();
      if (alt && alt.length > 5) {
        parts.push(`[Image: ${alt}]`);
        currentSectionParts.push(`[Image: ${alt}]`);
      }
      return;
    }

    if (tag === "figcaption") {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length > 5) {
        parts.push(`[Caption: ${text}]`);
        currentSectionParts.push(`[Caption: ${text}]`);
      }
      return;
    }

    if (tag === "figure") {
      const figText = $(el).find("figcaption").text().replace(/\s+/g, " ").trim();
      if (!figText) {
        const alt = $(el).find("img").attr("alt")?.trim();
        if (alt && alt.length > 5) {
          parts.push(`[Image: ${alt}]`);
          currentSectionParts.push(`[Image: ${alt}]`);
        }
      }
      return;
    }

    if (tag === "span" || tag === "div") {
      const node = $(el);
      if (node.parents("p, li, blockquote, dt, dd, figcaption, address, td, th").length > 0) return;
      if (node.children().filter((_i, c) => {
        const ct = (c as Element).tagName?.toLowerCase();
        return ct !== undefined && ct !== "br" && ct !== "strong" && ct !== "em" && ct !== "b" && ct !== "i" && ct !== "a" && ct !== "span";
      }).length > 0) return;
      const parent = node.parent();
      const parentTag = (parent[0] as Element | undefined)?.tagName?.toLowerCase();
      if (parentTag === "nav" || parentTag === "button") return;
      const cls = (node.attr("class") || "") + " " + (parent.attr("class") || "");
      if (/\b(nav-|menu|breadcrumb|toolbar|dropdown|sidebar)\b/i.test(cls)) return;
      const text = node.text().replace(/\s+/g, " ").trim();
      if (text.length >= 5 && text.length <= 800) {
        parts.push(text);
        currentSectionParts.push(text);
      }
      return;
    }

    if (tag === "dt") {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length > 2) {
        parts.push(`${text}:`);
        currentSectionParts.push(`${text}:`);
      }
      return;
    }

    if (tag === "dd") {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length > 2) {
        parts.push(`  ${text}`);
        currentSectionParts.push(text);
      }
      return;
    }

    if (tag === "summary") {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length > 3) {
        parts.push(`\n**${text}**`);
        currentSectionParts.push(text);
      }
      return;
    }

    if (tag === "address") {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length > 5) {
        parts.push(`Address: ${text}`);
        currentSectionParts.push(text);
      }
      return;
    }

    if (tag === "time") {
      const datetime = $(el).attr("datetime") || "";
      const text = $(el).text().replace(/\s+/g, " ").trim();
      const value = text || datetime;
      if (value.length > 3) {
        parts.push(value);
        currentSectionParts.push(value);
      }
      return;
    }

    if (tag === "mark") {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length > 3) {
        parts.push(text);
        currentSectionParts.push(text);
      }
      return;
    }

    if (tag === "details") {
      const clone = $(el).clone();
      clone.find("summary").remove();
      const text = clone.text().replace(/\s+/g, " ").trim();
      if (text.length > 5) {
        parts.push(text);
        currentSectionParts.push(text);
      }
      return;
    }

    if (tag === "p" || tag === "li" || tag === "blockquote") {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length > 5) {
        parts.push(text);
        currentSectionParts.push(text);
      }
    }
  });

  flushSection();

  // Extract title/aria-label attributes that contain substantial text
  contentRoot.find("[title], [aria-label]").each((_, el) => {
    const titleAttr = $(el).attr("title")?.trim();
    const ariaLabel = $(el).attr("aria-label")?.trim();
    for (const attr of [titleAttr, ariaLabel]) {
      if (attr && attr.length >= 10 && attr.length <= 300) {
        const existing = parts.join(" ");
        if (!existing.includes(attr)) {
          parts.push(attr);
        }
      }
    }
  });

  // Also extract contact-like content from nav/footer before they're gone
  const contactParts: string[] = [];
  $("footer, nav, header").find("a[href^='mailto:'], a[href^='tel:']").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const href = $(el).attr("href") || "";
    if (text.length > 3) contactParts.push(`${text} (${href})`);
  });
  const addr = $("footer address, .contact-info, .footer-contact").text().replace(/\s+/g, " ").trim();
  if (addr.length > 10) contactParts.push(addr);
  if (contactParts.length > 0) {
    parts.push("\n## Contact Information");
    parts.push(...contactParts);
  }

  const text = parts.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
  return { text, sections };
}


function contentFingerprint(text: string): string {
  return crypto.createHash("md5").update(text).digest("hex");
}

// ---------------------------------------------------------------------------
// Image OCR via system tesseract binary
// ---------------------------------------------------------------------------
const SKIP_IMAGE_PATTERNS = /logo|icon|favicon|sprite|arrow|chevron|spinner|loading|placeholder|spacer|pixel|tracking|badge/i;
const MIN_IMAGE_DIMENSION = 80;

function shouldOcrImage(src: string, alt: string, width?: number, height?: number): boolean {
  if (!src || src.startsWith("data:")) return false;
  if (/\.(svg|gif|ico)(\?|$)/i.test(src)) return false;
  if (SKIP_IMAGE_PATTERNS.test(src) || SKIP_IMAGE_PATTERNS.test(alt)) return false;
  if (width && width < MIN_IMAGE_DIMENSION) return false;
  if (height && height < MIN_IMAGE_DIMENSION) return false;
  return true;
}

async function ocrImageUrl(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl, {
    redirect: "follow",
    headers: { "User-Agent": "NavBot/1.0 (site indexer)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return "";
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return "";

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2000 || buf.length > 10 * 1024 * 1024) return "";

  const tmpPath = join(tmpdir(), `navbot-ocr-${crypto.randomUUID()}.img`);
  try {
    await writeFile(tmpPath, buf);
    const text = await new Promise<string>((resolve) => {
      execFile("tesseract", [tmpPath, "stdout", "--psm", "6", "-l", "eng"], { timeout: 20_000 }, (err, stdout) => {
        if (err) { resolve(""); return; }
        resolve(stdout.trim());
      });
    });
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 2)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } finally {
    unlink(tmpPath).catch(() => {});
  }
}

async function ocrImagesOnPage(
  html: string,
  pageUrl: string,
  maxImages = 5,
): Promise<string[]> {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const candidates: string[] = [];
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src") || "";
    const alt = $(el).attr("alt") || "";
    const w = parseInt($(el).attr("width") || "0", 10) || undefined;
    const h = parseInt($(el).attr("height") || "0", 10) || undefined;
    if (!shouldOcrImage(src, alt, w, h)) return;
    try {
      const absolute = new URL(src, pageUrl).toString();
      if (!candidates.includes(absolute)) candidates.push(absolute);
    } catch {}
  });

  // CSS background images (common in cards, hero sections, profile overlays)
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const bgMatch = style.match(/background(?:-image)?\s*:\s*url\(['"]?([^'")\s]+)['"]?\)/i);
    if (!bgMatch?.[1]) return;
    const src = bgMatch[1];
    if (!shouldOcrImage(src, "", undefined, undefined)) return;
    try {
      const absolute = new URL(src, pageUrl).toString();
      if (!candidates.includes(absolute)) candidates.push(absolute);
    } catch {}
  });

  const results: string[] = [];
  for (const url of candidates.slice(0, maxImages)) {
    try {
      const text = await ocrImageUrl(url);
      if (text.length >= 5) results.push(`[Image text: ${text}]`);
    } catch {}
  }
  return results;
}

// ---------------------------------------------------------------------------
// H: PDF extraction — pdfjs-dist for text PDFs, Gemini OCR for scanned PDFs
// ---------------------------------------------------------------------------
const MAX_PDF_SIZE = 10 * 1024 * 1024;

async function pdfTextViaPdfjs(buf: Buffer): Promise<{ text: string; title: string }> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const textParts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const pageText = tc.items
      .filter((item) => "str" in item && typeof (item as Record<string, unknown>).str === "string")
      .map((item) => (item as Record<string, unknown>).str as string)
      .join(" ");
    if (pageText.trim()) textParts.push(pageText.trim());
  }
  const meta = await doc.getMetadata().catch(() => null);
  const pdfTitle = (meta?.info as Record<string, unknown> | undefined)?.Title;
  doc.destroy();
  return {
    text: textParts.join("\n\n").trim(),
    title: typeof pdfTitle === "string" && pdfTitle.trim() ? pdfTitle.trim() : "",
  };
}

async function fetchPdfText(url: string): Promise<{ title: string; content: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      headers: { "User-Agent": "NavBot/1.0 (site indexer; respectful crawler)" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_PDF_SIZE) {
      console.log(`[crawler] PDF too large (${(buf.length / 1024 / 1024).toFixed(1)}MB), skipping: ${url}`);
      return null;
    }

    let text = "";
    let pdfTitle = "";
    try {
      const result = await pdfTextViaPdfjs(buf);
      text = result.text;
      pdfTitle = result.title;
    } catch (err) {
      console.warn(`[crawler] pdfjs failed for ${url}:`, err instanceof Error ? err.message : err);
    }

    if (text.length < 20) return null;
    const title = pdfTitle || url.split("/").pop()?.replace(/\.pdf$/i, "") || url;
    return { title, content: `Page Title: ${title}\nPage URL: ${url}\nType: PDF Document\n\n${text}` };
  } catch (err) {
    console.warn(`[crawler] PDF extraction failed for ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function processHtmlPage(
  rawUrl: string,
  html: string,
  ocrTexts?: string[],
): CrawledPage | null {
  const $ = cheerio.load(html);
  const title = $("title").first().text().replace(/\s+/g, " ").trim() || rawUrl;
  let { text: content, sections } = extractStructuredContent($, rawUrl, title);

  if (ocrTexts && ocrTexts.length > 0) {
    content += "\n\n" + ocrTexts.join("\n");
  }

  if (content.length === 0) return null;
  if (SKIP_CONTENT_PATTERNS.some((p) => p.test(content))) return null;

  const hash = contentFingerprint(content);
  return { url: rawUrl, title, content, hash, sections };
}

const CRAWL_CONCURRENCY = parseInt(process.env.NAVBOT_CRAWL_CONCURRENCY || "3", 10);
const CRAWL_DELAY_MS = parseInt(process.env.NAVBOT_CRAWL_DELAY_MS || "150", 10);

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]!);
      if (CRAWL_DELAY_MS > 0) await new Promise((r) => setTimeout(r, CRAWL_DELAY_MS));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function crawlSingleUrl(rawUrl: string, mode: BrowserCrawlMode, ocr: boolean): Promise<CrawledPage | null> {
  if (PDF_PATTERN.test(rawUrl)) {
    const pdf = await fetchPdfText(rawUrl);
    if (pdf) {
      const hash = contentFingerprint(pdf.content);
      return { url: rawUrl, title: pdf.title, content: pdf.content, hash };
    }
    return null;
  }

  const html = await resolvePageHtml(rawUrl, rawUrl, mode);
  if (!html) return null;

  let ocrTexts: string[] | undefined;
  if (ocr) {
    ocrTexts = await ocrImagesOnPage(html, rawUrl).catch((e) => {
      console.warn(`[crawler] OCR failed for ${rawUrl}:`, e);
      return [];
    });
  }

  return processHtmlPage(rawUrl, html, ocrTexts);
}

export async function crawlPages(urls: string[], options?: { enableOcr?: boolean }): Promise<CrawledPage[]> {
  const mode = parseBrowserCrawlMode();
  const ocr = options?.enableOcr ?? false;
  logBrowserCrawlModeOnce(mode);

  const originRules = new Map<string, Awaited<ReturnType<typeof fetchRobotsRules>>>();
  for (const url of urls) {
    try {
      const origin = new URL(url).origin;
      if (!originRules.has(origin)) {
        originRules.set(origin, await fetchRobotsRules(origin));
      }
    } catch {}
  }

  const results = await mapConcurrent(urls, CRAWL_CONCURRENCY, async (rawUrl) => {
    try {
      try {
        const origin = new URL(rawUrl).origin;
        const rules = originRules.get(origin);
        if (rules && !isUrlAllowedByRobots(rawUrl, rules)) {
          console.log(`[crawler] Skipping ${rawUrl} — disallowed by robots.txt`);
          return null;
        }
      } catch {}
      return await crawlSingleUrl(rawUrl, mode, ocr);
    } catch (err) {
      console.error("Failed to crawl page", rawUrl, err);
      return null;
    }
  });

  const pages = results.filter((p): p is CrawledPage => p !== null);
  console.log(`Selective crawl complete: ${pages.length} of ${urls.length} pages fetched`);
  return pages;
}

export { shutdownBrowser } from "./browser-render";

// ---------------------------------------------------------------------------
// Full BFS crawl — used for initial indexing and sync
// ---------------------------------------------------------------------------
export async function crawlSite(
  rootUrl: string,
  options: CrawlOptions & { enableOcr?: boolean } = {}
): Promise<CrawledPage[]> {
  const { maxPages, maxDepth } = { ...DEFAULT_OPTIONS, ...options };
  const origin = new URL(rootUrl).origin;
  const robotsRules = await fetchRobotsRules(origin);

  const visited = new Set<string>();
  const contentSeen = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [
    { url: normalizeUrl(rootUrl), depth: 0 },
  ];
  const pages: CrawledPage[] = [];
  const mode = parseBrowserCrawlMode();
  logBrowserCrawlModeOnce(mode);

  while (queue.length > 0 && pages.length < maxPages) {
    const batchSize = Math.min(CRAWL_CONCURRENCY, queue.length, maxPages - pages.length);
    const batch: Array<{ url: string; depth: number }> = [];
    while (batch.length < batchSize && queue.length > 0) {
      const item = queue.shift()!;
      const normalized = normalizeUrl(item.url);
      if (visited.has(normalized)) continue;
      if (item.depth > maxDepth) continue;
      if (SKIP_PATH_PATTERNS.some((p) => p.test(normalized))) continue;
      if (!isUrlAllowedByRobots(normalized, robotsRules)) continue;
      visited.add(normalized);
      batch.push({ url: normalized, depth: item.depth });
    }

    if (batch.length === 0) continue;

    const batchResults = await Promise.all(
      batch.map(async ({ url: normalized, depth }) => {
        try {
          if (PDF_PATTERN.test(normalized)) {
            const pdf = await fetchPdfText(normalized);
            if (pdf) {
              const fp = contentFingerprint(pdf.content);
              return { page: { url: normalized, title: pdf.title, content: pdf.content, hash: fp } as CrawledPage, html: null as string | null, depth };
            }
            return null;
          }

          const html = await resolvePageHtml(normalized, normalized, mode);
          if (!html) return null;

          let ocrTexts: string[] | undefined;
          if (options.enableOcr) {
            ocrTexts = await ocrImagesOnPage(html, normalized).catch((e) => {
              console.warn(`[crawler] OCR failed for ${normalized}:`, e);
              return [];
            });
          }

          const page = processHtmlPage(normalized, html, ocrTexts);
          if (!page) return null;
          return { page, html, depth };
        } catch (err) {
          console.error("Failed to crawl", normalized, err);
          return null;
        }
      })
    );

    for (const result of batchResults) {
      if (!result) continue;
      const { page, html, depth } = result;

      if (contentSeen.has(page.hash)) {
        console.log(`Skipping duplicate content page: ${page.url}`);
        continue;
      }
      contentSeen.add(page.hash);
      pages.push(page);

      if (html && depth < maxDepth) {
        const $ = cheerio.load(html);
        $("a[href]").each((_, el) => {
          const href = $(el).attr("href");
          if (!href) return;
          try {
            const absolute = new URL(href, page.url).toString();
            if (!absolute.startsWith(origin)) return;
            const norm = normalizeUrl(absolute);
            if (visited.has(norm)) return;
            if (SKIP_PATH_PATTERNS.some((p) => p.test(norm))) return;
            if (queue.length + pages.length < maxPages) {
              queue.push({ url: norm, depth: depth + 1 });
            }
          } catch { /* ignore invalid URLs */ }
        });
      }
    }

    if (CRAWL_DELAY_MS > 0) await new Promise((r) => setTimeout(r, CRAWL_DELAY_MS));
  }

  console.log(
    `Crawl complete: ${pages.length} unique pages from ${visited.size} visited URLs`
  );
  return pages;
}

// ---------------------------------------------------------------------------
// Lightweight BFS URL discovery — returns URLs only (no content processing)
// ---------------------------------------------------------------------------
const DISCOVER_MAX_PAGES = 600;
const DISCOVER_MAX_DEPTH = 4;
const DISCOVER_CONCURRENCY = 4;

export async function discoverUrls(
  rootUrl: string,
  knownUrls?: Set<string>
): Promise<string[]> {
  const origin = new URL(rootUrl).origin;
  const visited = new Set<string>(knownUrls ?? []);
  const discovered: string[] = [];
  const queue: Array<{ url: string; depth: number }> = [
    { url: normalizeUrl(rootUrl), depth: 0 },
  ];

  while (queue.length > 0 && discovered.length + visited.size < DISCOVER_MAX_PAGES) {
    const batchSize = Math.min(DISCOVER_CONCURRENCY, queue.length);
    const batch: Array<{ url: string; depth: number }> = [];
    while (batch.length < batchSize && queue.length > 0) {
      const item = queue.shift()!;
      const norm = normalizeUrl(item.url);
      if (visited.has(norm)) continue;
      if (item.depth > DISCOVER_MAX_DEPTH) continue;
      if (SKIP_PATH_PATTERNS.some((p) => p.test(norm))) continue;
      visited.add(norm);
      batch.push({ url: norm, depth: item.depth });
    }

    if (batch.length === 0) continue;

    await Promise.all(
      batch.map(async ({ url, depth }) => {
        try {
          const resp = await fetch(url, {
            headers: { "User-Agent": "NavBot/1.0" },
            redirect: "follow",
            signal: AbortSignal.timeout(10_000),
          });
          if (!resp.ok) return;
          const ct = resp.headers.get("content-type") ?? "";
          if (!ct.includes("text/html")) return;
          const html = await resp.text();

          discovered.push(url);

          if (depth < DISCOVER_MAX_DEPTH) {
            const $ = cheerio.load(html);
            $("a[href]").each((_, el) => {
              const href = $(el).attr("href");
              if (!href) return;
              try {
                const abs = new URL(href, url).toString();
                if (!abs.startsWith(origin)) return;
                const norm = normalizeUrl(abs);
                if (visited.has(norm)) return;
                if (SKIP_PATH_PATTERNS.some((p) => p.test(norm))) return;
                queue.push({ url: norm, depth: depth + 1 });
              } catch {}
            });
          }
        } catch {}
      })
    );
  }

  console.log(`[discover] BFS found ${discovered.length} URLs (${visited.size} total visited)`);
  return discovered;
}