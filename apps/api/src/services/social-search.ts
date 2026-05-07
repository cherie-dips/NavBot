import { getSocialHandles, type SocialHandles } from "./db";

function getSerperApiKey(): string {
  return process.env.SERPER_API_KEY?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SocialSearchResult {
  platform: string;
  title: string;
  url: string;
  snippet: string;
}

// ---------------------------------------------------------------------------
// In-memory cache — key: "siteId:query_normalized", TTL 4 hours
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const cache = new Map<string, { results: SocialSearchResult[]; ts: number }>();

function getCached(key: string): SocialSearchResult[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.results;
}

function setCache(key: string, results: SocialSearchResult[]) {
  cache.set(key, { results, ts: Date.now() });
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.ts > CACHE_TTL_MS) cache.delete(k);
    }
  }
}

// ---------------------------------------------------------------------------
// Intent detection — should we search social media for this query?
// ---------------------------------------------------------------------------
const SOCIAL_INTENT_PATTERN =
  /\b(event|fest|festival|workshop|seminar|webinar|placement|recruit|hackathon|announcement|update|news|latest|upcoming|recent|happening|drive|talk|guest\s*lecture|conference|cultural|sports|competition|club|society|activity|activities|post|social\s*media)\b/i;

export function hasSocialIntent(query: string): boolean {
  return SOCIAL_INTENT_PATTERN.test(query);
}

// ---------------------------------------------------------------------------
// Build search queries scoped to each platform
// ---------------------------------------------------------------------------
const PLATFORM_SITES: Record<string, string> = {
  instagram: "site:instagram.com",
  twitter: "site:twitter.com OR site:x.com",
  linkedin: "site:linkedin.com",
  facebook: "site:facebook.com",
};

function buildSearchQueries(
  query: string,
  handles: SocialHandles
): Array<{ platform: string; searchQuery: string }> {
  const queries: Array<{ platform: string; searchQuery: string }> = [];

  for (const [platform, username] of Object.entries(handles)) {
    if (!username?.trim()) continue;
    const siteFilter = PLATFORM_SITES[platform];
    if (!siteFilter) continue;

    let handle = username.replace(/^@/, "").trim();
    // Extract slug from full URLs (e.g. "https://linkedin.com/school/plakshauniversity/...")
    try {
      const parsed = new URL(handle);
      const segments = parsed.pathname.split("/").filter(Boolean);
      const slug = segments.find((s) => s !== "in" && s !== "company" && s !== "school" && s !== "posts");
      if (slug) handle = slug;
    } catch { /* not a URL, use as-is */ }

    queries.push({
      platform,
      searchQuery: `${siteFilter} "${handle}" ${query}`,
    });
  }

  return queries;
}

// ---------------------------------------------------------------------------
// Serper.dev Google Search API
// ---------------------------------------------------------------------------
async function serperSearch(
  query: string
): Promise<Array<{ title: string; link: string; snippet: string }>> {
  if (!getSerperApiKey()) return [];

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": getSerperApiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 5 }),
    });

    if (!res.ok) {
      console.error(
        `[social-search] Serper returned ${res.status}: ${await res.text()}`
      );
      return [];
    }

    const data = (await res.json()) as {
      organic?: Array<{ title?: string; link?: string; snippet?: string }>;
    };
    return (data.organic ?? []).map((r) => ({
      title: r.title ?? "",
      link: r.link ?? "",
      snippet: r.snippet ?? "",
    }));
  } catch (err) {
    console.error("[social-search] Serper request failed:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main entry point — search social media for a site's configured handles
// ---------------------------------------------------------------------------
export async function searchSocialMedia(
  siteId: string,
  userQuery: string
): Promise<SocialSearchResult[]> {
  const serperKey = getSerperApiKey();
  if (!serperKey) {
    console.warn("[social-search] SERPER_API_KEY not set, skipping social search");
    return [];
  }

  const handles = await getSocialHandles(siteId);
  const configuredPlatforms = Object.entries(handles).filter(([, v]) => v?.trim());
  if (configuredPlatforms.length === 0) {
    console.warn(`[social-search] No social handles configured for site "${siteId}"`);
    return [];
  }

  // Check cache
  const cacheKey = `${siteId}:${userQuery.toLowerCase().trim()}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[social-search] Cache hit for "${cacheKey}" (${cached.length} results)`);
    return cached;
  }

  const searchQueries = buildSearchQueries(userQuery, handles);
  console.log(`[social-search] Searching ${searchQueries.length} platform(s) for "${userQuery}"`);

  // Run all platform searches in parallel
  const allResults = await Promise.all(
    searchQueries.map(async ({ platform, searchQuery }) => {
      const raw = await serperSearch(searchQuery);
      return raw.map((r) => ({
        platform,
        title: r.title,
        url: r.link,
        snippet: r.snippet,
      }));
    })
  );

  const results = allResults.flat();
  setCache(cacheKey, results);
  console.log(`[social-search] Found ${results.length} total results across platforms`);

  return results;
}

// ---------------------------------------------------------------------------
// Format social results into a context block for the RAG LLM
// ---------------------------------------------------------------------------
export function buildSocialContextString(results: SocialSearchResult[]): string {
  if (results.length === 0) return "";

  return results
    .map(
      (r, idx) =>
        `[Social Media - ${r.platform} #${idx + 1}]\nTitle: ${r.title}\nURL: ${r.url}\n\n${r.snippet}`
    )
    .join("\n\n---\n\n");
}
