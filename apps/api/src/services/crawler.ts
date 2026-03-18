import fetch from "node-fetch";
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import crypto from "crypto";

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

  for (const rawUrl of urls) {
    try {
      const res = await fetch(rawUrl, {
        redirect: "follow",
        headers: {
          "User-Agent": "NavBot/1.0 (site indexer; respectful crawler)",
          Accept: "text/html",
        },
      });

      if (!res.ok) {
        console.warn(`Skipping ${rawUrl} — HTTP ${res.status}`);
        continue;
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) continue;

      const html = await res.text();
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

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth } = queue.shift()!;
    const normalized = normalizeUrl(url);

    if (visited.has(normalized)) continue;
    if (depth > maxDepth) continue;
    if (SKIP_PATH_PATTERNS.some((p) => p.test(normalized))) continue;

    visited.add(normalized);

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
        continue;
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) continue;

      const html = await res.text();
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