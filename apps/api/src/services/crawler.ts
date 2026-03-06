import fetch from "node-fetch";
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import crypto from "crypto";

export interface CrawledPage {
  url: string;
  title: string;
  content: string;
}

interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
}

const DEFAULT_OPTIONS: Required<CrawlOptions> = {
  maxPages: 500,
  maxDepth: 10,
};

// ---------------------------------------------------------------------------
// Path patterns to skip entirely (assets, pagination, tags, etc.)
// ---------------------------------------------------------------------------
const SKIP_PATH_PATTERNS: RegExp[] = [
  /\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|css|js|ico|woff|woff2|ttf|eot)$/i,
  /\/(tag|category|author)\//, // blog taxonomy pages
  /\/page\/\d+/, // pagination
  /[?&](utm_|ref=|source=)/, // tracking params
];

// ---------------------------------------------------------------------------
// Body text patterns that indicate non-content pages
// ---------------------------------------------------------------------------
const SKIP_CONTENT_PATTERNS: RegExp[] = [
  /^(404|page not found|access denied)/i,
  /this page (does not exist|has been removed)/i,
];

// ---------------------------------------------------------------------------
// Convert a <table> element to GitHub-flavored Markdown.
// This is the critical fix for deadline/schedule pages.
// ---------------------------------------------------------------------------
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

  // Pad rows to same column count
  const padded = rows.map((r) => {
    while (r.length < colCount) r.push("");
    return r;
  });

  const header = padded[0];
  const separator = header.map(() => "---");
  const body = padded.slice(1);

  const toRow = (cells: string[]) => "| " + cells.join(" | ") + " |";
  return [toRow(header), toRow(separator), ...body.map(toRow)].join("\n");
}

// ---------------------------------------------------------------------------
// Extract semantically structured content from the page.
// Preserves heading hierarchy, tables (as markdown), and paragraphs.
// ---------------------------------------------------------------------------
function extractStructuredContent(
  $: cheerio.CheerioAPI,
  url: string,
  title: string
): string {
  // Remove noisy elements
  $(
    "script, style, noscript, nav, footer, header, .cookie-banner, " +
      ".popup, .modal, .advertisement, [aria-hidden='true']"
  ).remove();

  const parts: string[] = [];

  // Always prepend page identity — critical for chunk retrieval context
  parts.push(`Page Title: ${title}`);
  parts.push(`Page URL: ${url}`);
  parts.push("");

  // Walk the main content area in DOM order
  const contentRoot = $("main, article, [role='main'], .content, #content, body")
    .first();

  contentRoot.find("h1, h2, h3, h4, h5, h6, p, li, table, blockquote").each(
    (_, el) => {
      const tag = (el as Element).tagName?.toLowerCase();
      if (!tag) return;

      if (/^h[1-6]$/.test(tag)) {
        const level = parseInt(tag[1], 10);
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
    }
  );

  return parts.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

// ---------------------------------------------------------------------------
// Content fingerprint for deduplication
// ---------------------------------------------------------------------------
function contentFingerprint(text: string): string {
  return crypto
    .createHash("md5")
    .update(text.slice(0, 600))
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Main crawl function
// ---------------------------------------------------------------------------
export async function crawlSite(
  rootUrl: string,
  options: CrawlOptions = {}
): Promise<CrawledPage[]> {
  const { maxPages, maxDepth } = { ...DEFAULT_OPTIONS, ...options };
  const origin = new URL(rootUrl).origin;

  /** Normalize URL: remove hash, trailing slash, sort query params. */
  function normalizeUrl(u: string): string {
    try {
      const parsed = new URL(u);
      parsed.hash = "";
      parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
      // Sort query params for consistent dedup
      parsed.searchParams.sort();
      return parsed.toString();
    } catch {
      return u;
    }
  }

  const visited = new Set<string>();
  const contentSeen = new Set<string>(); // content-hash dedup
  const queue: Array<{ url: string; depth: number }> = [
    { url: normalizeUrl(rootUrl), depth: 0 },
  ];
  const pages: CrawledPage[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth } = queue.shift()!;
    const normalized = normalizeUrl(url);

    if (visited.has(normalized)) continue;
    if (depth > maxDepth) continue;

    // Skip paths matching noise patterns
    if (SKIP_PATH_PATTERNS.some((p) => p.test(normalized))) continue;

    visited.add(normalized);

    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          // Polite crawler headers
          "User-Agent": "NavBot/1.0 (site indexer; respectful crawler)",
          Accept: "text/html",
        },
      });

      if (!res.ok) {
        console.warn(`Skipping ${url} — HTTP ${res.status}`);
        continue;
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      const title = $("title").first().text().replace(/\s+/g, " ").trim() || url;

      // Extract structured content (tables preserved as markdown)
      const content = extractStructuredContent($, normalized, title);

      if (content.length === 0) continue;

      // Skip non-content pages (404, access denied, etc.)
      if (SKIP_CONTENT_PATTERNS.some((p) => p.test(content))) continue;

      // Content-level dedup — skip near-duplicate pages (e.g. shared nav/footer content)
      const fp = contentFingerprint(content);
      if (contentSeen.has(fp)) {
        console.log(`Skipping duplicate content page: ${normalized}`);
        continue;
      }
      contentSeen.add(fp);

      pages.push({ url: normalized, title, content });

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
          } catch {
            // ignore invalid URLs
          }
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