import * as cheerio from "cheerio";
import { normalizeUrl } from "./crawler";

export interface SitemapEntry {
  url: string;
  lastmod: string | null; // ISO date string or null
}

async function parseSitemapXml(url: string): Promise<SitemapEntry[]> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "NavBot/1.0 (sitemap reader)",
      Accept: "application/xml, text/xml, */*",
    },
  });

  if (!res.ok) throw new Error(`Failed to fetch sitemap ${url}: HTTP ${res.status}`);

  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const entries: SitemapEntry[] = [];

  $("url").each((_, el) => {
    const loc = $("loc", el).first().text().trim();
    const lastmod = $("lastmod", el).first().text().trim() || null;
    if (loc) entries.push({ url: normalizeUrl(loc), lastmod });
  });

  return entries;
}

async function parseSitemapIndex(url: string): Promise<string[]> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "NavBot/1.0 (sitemap reader)",
      Accept: "application/xml, text/xml, */*",
    },
  });

  if (!res.ok) return [];

  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const urls: string[] = [];
  $("sitemap loc").each((_, el) => {
    const loc = $(el).text().trim();
    if (loc) urls.push(loc);
  });

  return urls;
}

async function discoverSitemapUrl(siteUrl: string): Promise<string | null> {
  const base = new URL(siteUrl).origin;

  const candidates = [
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/sitemap-index.xml`,
    `${base}/sitemaps/sitemap.xml`,
  ];

  // Also check robots.txt for Sitemap: directive
  try {
    const robotsRes = await fetch(`${base}/robots.txt`, {
      headers: { "User-Agent": "NavBot/1.0 (sitemap reader)" },
    });
    if (robotsRes.ok) {
      const robots = await robotsRes.text();
      const sitemapLines = robots
        .split("\n")
        .filter((l) => /^sitemap:/i.test(l.trim()));
      for (const line of sitemapLines) {
        const sitemapUrl = line.replace(/^sitemap:\s*/i, "").trim();
        if (sitemapUrl) candidates.unshift(sitemapUrl); // robots.txt wins
      }
    }
  } catch {
    // ignore robots.txt failures
  }

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        method: "HEAD",
        headers: { "User-Agent": "NavBot/1.0 (sitemap reader)" },
      });
      if (res.ok) return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

function rewriteOriginIfNeeded(entries: SitemapEntry[], siteUrl: string): SitemapEntry[] {
  if (entries.length === 0) return entries;
  const siteOrigin = new URL(siteUrl).origin;
  const first = entries[0]!;
  let entryOrigin: string;
  try { entryOrigin = new URL(first.url).origin; } catch { return entries; }
  if (entryOrigin === siteOrigin) return entries;

  console.log(`[sitemap] Rewriting sitemap URLs from ${entryOrigin} → ${siteOrigin}`);
  return entries.map((e) => {
    try {
      const u = new URL(e.url);
      const corrected = new URL(u.pathname + u.search + u.hash, siteOrigin);
      return { url: normalizeUrl(corrected.toString()), lastmod: e.lastmod };
    } catch { return e; }
  });
}

export async function getSitemapEntries(siteUrl: string): Promise<SitemapEntry[]> {
  const sitemapUrl = await discoverSitemapUrl(siteUrl);
  if (!sitemapUrl) {
    console.log(`[sitemap] No sitemap found for ${siteUrl}`);
    return [];
  }

  console.log(`[sitemap] Found sitemap at ${sitemapUrl}`);

  // Try as index first
  const childUrls = await parseSitemapIndex(sitemapUrl);

  if (childUrls.length > 0) {
    const all: SitemapEntry[] = [];
    for (const childUrl of childUrls.slice(0, 10)) {
      try {
        const entries = await parseSitemapXml(childUrl);
        all.push(...entries);
      } catch (err) {
        console.warn(`[sitemap] Failed to parse child sitemap ${childUrl}:`, err);
      }
    }
    console.log(`[sitemap] Index sitemap: ${all.length} entries across ${childUrls.length} child sitemaps`);
    return rewriteOriginIfNeeded(all, siteUrl);
  }

  const entries = await parseSitemapXml(sitemapUrl);
  console.log(`[sitemap] Regular sitemap: ${entries.length} entries`);
  return rewriteOriginIfNeeded(entries, siteUrl);
}


export function diffSitemapEntries(
  entries: SitemapEntry[],
  storedLastmods: Record<string, string | null>
): SitemapEntry[] {
  return entries.filter((entry) => {
    const stored = storedLastmods[entry.url];

    // URL never seen before → include
    if (stored === undefined) return true;

    // Both have no lastmod — we can't tell, skip to avoid re-scraping everything
    if (!entry.lastmod && !stored) return false;

    // Entry has no lastmod but was previously seen → skip
    if (!entry.lastmod) return false;

    // Stored has no lastmod but entry now has one → include (new info)
    if (!stored) return true;

    // Compare dates — include if entry is newer
    return new Date(entry.lastmod) > new Date(stored);
  });
}