import { getSocialHandles, type SocialHandles } from "./db";
import { getSiteProfile } from "./site-profile";

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
  profileUrl?: string;
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
const SOCIAL_INTENT_STRONG =
  /\b(social\s*media|instagram|twitter|linkedin|facebook|posts?|reels?)\b/i;
const SOCIAL_INTENT_WEAK =
  /\b(events?|workshops?|happenings?|upcoming|latest|recent|news|announcements?|fests?|festivals?|hackathons?)\b/i;
const FACTUAL_OVERRIDE =
  /\b(admission|fee|tuition|eligib|program|course|curriculum|contact|email|phone|address|deadline|scholarship|placement|faculty|department|requirement|criteria)\b/i;

export function hasSocialIntent(query: string): boolean {
  if (SOCIAL_INTENT_STRONG.test(query)) return true;
  if (SOCIAL_INTENT_WEAK.test(query) && !FACTUAL_OVERRIDE.test(query)) return true;
  return false;
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

const PLATFORM_PROFILE_URL: Record<string, (handle: string) => string> = {
  instagram: (h) => `https://instagram.com/${encodeURIComponent(h)}`,
  twitter: (h) => `https://x.com/${encodeURIComponent(h)}`,
  linkedin: (h) => `https://linkedin.com/company/${encodeURIComponent(h)}`,
  facebook: (h) => `https://facebook.com/${encodeURIComponent(h)}`,
};

function buildSearchQueries(
  query: string,
  handles: SocialHandles
): Array<{ platform: string; searchQuery: string; profileUrl: string }> {
  const queries: Array<{ platform: string; searchQuery: string; profileUrl: string }> = [];

  for (const [platform, username] of Object.entries(handles)) {
    if (!username?.trim()) continue;
    const siteFilter = PLATFORM_SITES[platform];
    if (!siteFilter) continue;

    const raw = username.trim();
    let handle = raw.replace(/^@/, "");
    let profileUrl = "";

    try {
      const parsed = new URL(handle);
      parsed.search = "";
      parsed.hash = "";
      parsed.pathname = parsed.pathname.replace(/\/(posts|feed|about|videos|photos)\/?$/, "");
      profileUrl = parsed.toString().replace(/\/+$/, "");
      const segments = parsed.pathname.split("/").filter(Boolean);
      const slug = segments.find((s) => s !== "in" && s !== "company" && s !== "school" && s !== "posts");
      if (slug) handle = slug;
    } catch {
      const buildUrl = PLATFORM_PROFILE_URL[platform];
      profileUrl = buildUrl ? buildUrl(handle) : "";
    }

    queries.push({
      platform,
      searchQuery: `${siteFilter} "${handle}" ${query}`,
      profileUrl,
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
// Filter out results that are not real posts (profile pages, generic uploads)
// ---------------------------------------------------------------------------
function isUselessSocialResult(r: SocialSearchResult): boolean {
  const title = r.title.toLowerCase();
  if (/added a new (photo|video)\b/i.test(title)) return true;
  if (/\bmentions\b/i.test(title)) return true;
  // Title is just "OrgName | Location" — a profile page title, not a post
  if (/^[^|]+\|[^|]+$/.test(r.title.trim()) && !/event|workshop|seminar|talk|conference|hackathon/i.test(title)) return true;
  return false;
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

  // Dashboard-saved handles win; the site profile supplies a verified default so
  // social search is not silently dead on a site nobody has configured yet.
  const saved = await getSocialHandles(siteId);
  const hasSaved = Object.values(saved).some((v) => v?.trim());
  const handles: SocialHandles = hasSaved
    ? saved
    : ((getSiteProfile(siteId).socialHandles ?? {}) as SocialHandles);

  const configuredPlatforms = Object.entries(handles).filter(([, v]) => v?.trim());
  if (configuredPlatforms.length === 0) {
    console.warn(`[social-search] No social handles configured for site "${siteId}"`);
    return [];
  }
  if (!hasSaved) {
    console.log(`[social-search] using site-profile default handles for "${siteId}"`);
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
    searchQueries.map(async ({ platform, searchQuery, profileUrl }) => {
      const raw = await serperSearch(searchQuery);
      return raw.map((r) => ({
        platform,
        title: r.title,
        url: r.link,
        snippet: r.snippet,
        profileUrl,
      }));
    })
  );

  const raw = allResults.flat();
  const results = raw
    .filter((r) => {
      if (!r.profileUrl) return true;
      try {
        const postPath = new URL(r.url).pathname.replace(/\/+$/, "");
        const profilePath = new URL(r.profileUrl).pathname.replace(/\/+$/, "");
        if (postPath === profilePath) return false;
        const NON_POST_SUBPATHS = /\/(mentions|about|reviews|community|groups|likes|followers|following|reels_tab)\/?$/i;
        if (NON_POST_SUBPATHS.test(postPath)) return false;
        return true;
      } catch {
        return true;
      }
    })
    .filter((r) => !isUselessSocialResult(r));
  setCache(cacheKey, results);
  console.log(`[social-search] Found ${results.length} results (${raw.length - results.length} junk filtered)`);

  return results;
}

// ---------------------------------------------------------------------------
// Format social results into a context block for the RAG LLM
// ---------------------------------------------------------------------------
export function buildSocialContextString(results: SocialSearchResult[]): string {
  if (results.length === 0) return "";

  const byPlatform = new Map<string, { profileUrl: string; items: SocialSearchResult[] }>();
  for (const r of results) {
    const entry = byPlatform.get(r.platform) ?? { profileUrl: r.profileUrl ?? "", items: [] };
    entry.items.push(r);
    if (!entry.profileUrl && r.profileUrl) entry.profileUrl = r.profileUrl;
    byPlatform.set(r.platform, entry);
  }

  const blocks: string[] = [];
  for (const [platform, { profileUrl, items }] of byPlatform) {
    const header = profileUrl
      ? `[Social Media - ${platform}]\nProfile: ${profileUrl}`
      : `[Social Media - ${platform}]`;
    const posts = items
      .map((r, i) => `  ${i + 1}. ${r.title}\n     Post URL: ${r.url}\n     ${r.snippet}`)
      .join("\n");
    blocks.push(`${header}\n${posts}`);
  }

  return blocks.join("\n\n---\n\n");
}
