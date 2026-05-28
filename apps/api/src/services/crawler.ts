import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import crypto from "crypto";
import { fetchRenderedHtml, detectFramework } from "./browser-render";

export interface CrawledPage {
  url: string;
  title: string;
  content: string;
  /** MD5 of first 600 chars of content — used for change detection in sync */
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
  maxPages: 500,
  maxDepth: 10,
};

const SKIP_PATH_PATTERNS: RegExp[] = [
  /\.(jpg|jpeg|png|gif|svg|webp|zip|css|js|ico|woff|woff2|ttf|eot)$/i,
  /\/(tag|category|author)\//,
  /\/page\/\d+/,
  /[?&](utm_|ref=|source=)/,
];

const PDF_PATTERN = /\.pdf$/i;

const SKIP_CONTENT_PATTERNS: RegExp[] = [
  /^(404|page not found|access denied)/i,
  /this page (does not exist|has been removed)/i,
];


export type BrowserCrawlMode = "off" | "auto" | "always";

/**
 * `NAVBOT_BROWSER_CRAWL`:
 * - `auto` (default): fetch HTML, then use Playwright only when extracted text is thin.
 * - `always`: every page through Chromium (slowest, best for heavy SPAs).
 * - `off` / `static`: legacy behavior — HTTP fetch only (fast, no JS).
 */
export function parseBrowserCrawlMode(): BrowserCrawlMode {
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

  $(
    "script, style, noscript, .cookie-banner, " +
      ".popup, .modal, .advertisement, [aria-hidden='true']"
  ).remove();

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


  contentRoot.find("h1, h2, h3, h4, h5, h6, p, li, table, blockquote, img, figure, figcaption, span, div").each((_, el) => {
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

    if (tag === "figure") return;

    if (tag === "span" || tag === "div") {
      const node = $(el);
      if (node.children().filter((_i, c) => {
        const ct = (c as Element).tagName?.toLowerCase();
        return ct !== undefined && ct !== "br" && ct !== "strong" && ct !== "em" && ct !== "b" && ct !== "i" && ct !== "a";
      }).length > 0) return;
      const text = node.text().replace(/\s+/g, " ").trim();
      if (text.length >= 4 && text.length <= 200) {
        parts.push(text);
        currentSectionParts.push(text);
      }
      return;
    }

    if (tag === "p" || tag === "li" || tag === "blockquote") {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length > 10) {
        parts.push(text);
        currentSectionParts.push(text);
      }
    }
  });

  flushSection();

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


export function contentFingerprint(text: string): string {
  return crypto.createHash("md5").update(text.slice(0, 600)).digest("hex");
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
): CrawledPage | null {
  const $ = cheerio.load(html);
  const title = $("title").first().text().replace(/\s+/g, " ").trim() || rawUrl;
  const { text: content, sections } = extractStructuredContent($, rawUrl, title);

  if (content.length === 0) return null;
  if (SKIP_CONTENT_PATTERNS.some((p) => p.test(content))) return null;

  const hash = contentFingerprint(content);
  return { url: rawUrl, title, content, hash, sections };
}

export async function crawlPages(urls: string[]): Promise<CrawledPage[]> {
  const pages: CrawledPage[] = [];
  const mode = parseBrowserCrawlMode();
  logBrowserCrawlModeOnce(mode);

  for (const rawUrl of urls) {
    try {
      // H: Handle PDFs
      if (PDF_PATTERN.test(rawUrl)) {
        const pdf = await fetchPdfText(rawUrl);
        if (pdf) {
          const hash = contentFingerprint(pdf.content);
          pages.push({ url: rawUrl, title: pdf.title, content: pdf.content, hash });
        }
        continue;
      }

      const html = await resolvePageHtml(rawUrl, rawUrl, mode);
      if (!html) continue;

      const page = processHtmlPage(rawUrl, html);
      if (page) pages.push(page);
    } catch (err) {
      console.error("Failed to crawl page", rawUrl, err);
    }
  }

  console.log(`Selective crawl complete: ${pages.length} of ${urls.length} pages fetched`);
  return pages;
}

export { shutdownBrowser } from "./browser-render";

// ---------------------------------------------------------------------------
// Full BFS crawl — used for initial indexing and sync
// ---------------------------------------------------------------------------
export async function crawlSite(
  rootUrl: string,
  options: CrawlOptions = {}
): Promise<CrawledPage[]> {
  const { maxPages, maxDepth } = { ...DEFAULT_OPTIONS, ...options };
  const origin = new URL(rootUrl).origin;

  const visited = new Set<string>();
  const contentSeen = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [
    { url: normalizeUrl(rootUrl), depth: 0 },
  ];
  const pages: CrawledPage[] = [];
  const mode = parseBrowserCrawlMode();
  logBrowserCrawlModeOnce(mode);

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth } = queue.shift()!;
    const normalized = normalizeUrl(url);

    if (visited.has(normalized)) continue;
    if (depth > maxDepth) continue;
    if (SKIP_PATH_PATTERNS.some((p) => p.test(normalized))) continue;

    visited.add(normalized);

    try {
      // H: Handle PDFs in BFS crawl
      if (PDF_PATTERN.test(normalized)) {
        const pdf = await fetchPdfText(url);
        if (pdf) {
          const fp = contentFingerprint(pdf.content);
          if (!contentSeen.has(fp)) {
            contentSeen.add(fp);
            pages.push({ url: normalized, title: pdf.title, content: pdf.content, hash: fp });
          }
        }
        continue;
      }

      const html = await resolvePageHtml(url, normalized, mode);
      if (!html) continue;

      const page = processHtmlPage(normalized, html);
      if (!page) continue;

      const $ = cheerio.load(html);

      // Dedup by content fingerprint (catches near-duplicate pages)
      if (contentSeen.has(page.hash)) {
        console.log(`Skipping duplicate content page: ${normalized}`);
        continue;
      }
      contentSeen.add(page.hash);
      pages.push(page);

      // Enqueue same-origin links (including PDFs now)
      if (depth < maxDepth) {
        const links = new Set<string>();
        $("a[href]").each((_, el) => {
          const href = $(el).attr("href");
          if (!href) return;
          try {
            const absolute = new URL(href, url).toString();
            if (!absolute.startsWith(origin)) return;
            const norm = normalizeUrl(absolute);
            if (visited.has(norm)) return;
            if (SKIP_PATH_PATTERNS.some((p) => p.test(norm))) return;
            links.add(norm);
          } catch { /* ignore invalid URLs */ }
        });

        for (const next of links) {
          if (queue.length + pages.length >= maxPages) break;
          queue.push({ url: next, depth: depth + 1 });
        }
      }
    } catch (err) {
      console.error("Failed to crawl", url, err);
    }
  }

  console.log(
    `Crawl complete: ${pages.length} unique pages from ${visited.size} visited URLs`
  );
  return pages;
}