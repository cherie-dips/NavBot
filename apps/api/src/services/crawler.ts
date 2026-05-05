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
  /\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|css|js|ico|woff|woff2|ttf|eot)$/i,
  /\/(tag|category|author)\//,
  /\/page\/\d+/,
  /[?&](utm_|ref=|source=)/,
];

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
  if (mode === "off") return result.html;

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


function extractStructuredContent(
  $: cheerio.CheerioAPI,
  url: string,
  title: string
): string {
  $(
    "script, style, noscript, nav, footer, header, .cookie-banner, " +
      ".popup, .modal, .advertisement, [aria-hidden='true']"
  ).remove();

  const parts: string[] = [];
  parts.push(`Page Title: ${title}`);
  parts.push(`Page URL: ${url}`);
  parts.push("");

  const contentRoot = $("main, article, [role='main'], .content, #content, body").first();

  contentRoot.find("h1, h2, h3, h4, h5, h6, p, li, table, blockquote").each((_, el) => {
    const tag = (el as Element).tagName?.toLowerCase();
    if (!tag) return;

    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1]!, 10);
      const prefix = "#".repeat(level);
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text) parts.push(`\n${prefix} ${text}`);
      return;
    }

    if (tag === "table") {
      const md = tableToMarkdown($, el);
      if (md) parts.push(`\n${md}\n`);
      return;
    }

    if (tag === "p" || tag === "li" || tag === "blockquote") {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length > 30) parts.push(text);
    }
  });

  return parts.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}


export function contentFingerprint(text: string): string {
  return crypto.createHash("md5").update(text.slice(0, 600)).digest("hex");
}

export async function crawlPages(urls: string[]): Promise<CrawledPage[]> {
  const pages: CrawledPage[] = [];
  const mode = parseBrowserCrawlMode();
  logBrowserCrawlModeOnce(mode);

  for (const rawUrl of urls) {
    try {
      const html = await resolvePageHtml(rawUrl, rawUrl, mode);
      if (!html) continue;

      const $ = cheerio.load(html);
      const title = $("title").first().text().replace(/\s+/g, " ").trim() || rawUrl;
      const content = extractStructuredContent($, rawUrl, title);

      if (content.length === 0) continue;
      if (SKIP_CONTENT_PATTERNS.some((p) => p.test(content))) continue;

      const hash = contentFingerprint(content);
      pages.push({ url: rawUrl, title, content, hash });
    } catch (err) {
      console.error("Failed to crawl page", rawUrl, err);
    }
  }

  console.log(`Selective crawl complete: ${pages.length} of ${urls.length} pages fetched`);
  return pages;
}

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
      const html = await resolvePageHtml(url, normalized, mode);
      if (!html) continue;

      const $ = cheerio.load(html);
      const title = $("title").first().text().replace(/\s+/g, " ").trim() || url;
      const content = extractStructuredContent($, normalized, title);

      if (content.length === 0) continue;
      if (SKIP_CONTENT_PATTERNS.some((p) => p.test(content))) continue;

      // Dedup by content fingerprint (catches near-duplicate pages)
      const fp = contentFingerprint(content);
      if (contentSeen.has(fp)) {
        console.log(`Skipping duplicate content page: ${normalized}`);
        continue;
      }
      contentSeen.add(fp);

      // hash is the same fp — store it on the page so callers can persist it
      pages.push({ url: normalized, title, content, hash: fp });

      // Enqueue same-origin links
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