import { getSocialHandles, type SocialHandles } from "../platform/db";
import { getSiteProfile, DEFAULT_SOCIAL_PLATFORMS } from "../platform/site-profile";
import { TtlCache } from "../ttl-cache";
import { serperSearch, hasSerperApiKey } from "./serper";

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
// Cache — the same question from many visitors should cost one search
// ---------------------------------------------------------------------------
const cache = new TtlCache<SocialSearchResult[]>(4 * 60 * 60 * 1000);

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

/**
 * Dashboard handle fields are free text, so they arrive as "@handle", a full profile
 * URL, or a display name like "Plaksha University". A display name cannot go into a
 * URL path — encoding it produced facebook.com/Plaksha%20University, a dead link — so
 * anything not already URL-safe is collapsed to a slug.
 *
 * Handles that are already valid are left exactly as typed, because case can matter
 * (x.com/PlakshaUniv).
 */
function handleToSlug(handle: string): string {
  if (/^[A-Za-z0-9._-]+$/.test(handle)) return handle;
  return handle.toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

function buildSearchQueries(
  query: string,
  handles: SocialHandles
): Array<{ platform: string; searchQuery: string; profileUrl: string; handle: string }> {
  const queries: Array<{ platform: string; searchQuery: string; profileUrl: string; handle: string }> = [];

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
      profileUrl = buildUrl ? buildUrl(handleToSlug(handle)) : "";
    }

    queries.push({
      platform,
      // The raw value stays in the search phrase — a display name is a perfectly good
      // search term, even though it cannot be part of a profile URL.
      searchQuery: `${siteFilter} "${handle}" ${query}`,
      profileUrl,
      handle: handleToSlug(handle),
    });
  }

  return queries;
}

// ---------------------------------------------------------------------------
// Filter out results that are not real posts (profile pages, generic uploads)
// ---------------------------------------------------------------------------
/**
 * Serper's `site:` filter plus a quoted handle is a text match, not an account match,
 * so a post from someone who merely mentioned the university comes back looking
 * official — a live search returned x.com/EconChopra for a Plaksha query.
 *
 * Where the URL identifies its author, it must be the configured account. Where it
 * does not (instagram.com/reel/<id> carries no username), the post is kept, because
 * the alternative is discarding most legitimate reels.
 */
function belongsToAccount(url: string, platform: string, handle: string): boolean {
  const slug = handle.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!slug) return true;

  let segments: string[];
  try {
    segments = new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return true;
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const first = norm(segments[0] ?? "");
  if (!first) return true;

  switch (platform) {
    case "twitter":
      // x.com/<user>/status/<id> — the author is unambiguous.
      return first === slug;
    case "facebook":
      // facebook.com/<page>/posts/<id>, or an opaque permalink we cannot attribute.
      return segments.length < 2 || first === slug || norm(url).includes(slug);
    case "instagram":
      // /p/<id> and /reel/<id> are anonymous; /<user>/p/<id> is not.
      if (first === "p" || first === "reel" || first === "tv") return true;
      return first === slug;
    case "linkedin":
      // /posts/<author-slug>_<id> — the author slug prefixes the path.
      if (first === "posts" || first === "pulse") {
        return norm(segments[1] ?? "").includes(slug) || norm(url).includes(slug);
      }
      return norm(url).includes(slug);
    default:
      return true;
  }
}

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
  if (!hasSerperApiKey()) {
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

  // Instagram and LinkedIn unless the site opts into more — see DEFAULT_SOCIAL_PLATFORMS.
  const allowed: readonly string[] =
    getSiteProfile(siteId).enabledSocialPlatforms ?? DEFAULT_SOCIAL_PLATFORMS;
  const usable: SocialHandles = Object.fromEntries(
    Object.entries(handles).filter(([platform]) => allowed.includes(platform))
  ) as SocialHandles;

  const configuredPlatforms = Object.entries(usable).filter(([, v]) => v?.trim());
  if (configuredPlatforms.length === 0) {
    console.warn(`[social-search] No usable social handles for site "${siteId}"`);
    return [];
  }
  if (!hasSaved) {
    console.log(`[social-search] using site-profile default handles for "${siteId}"`);
  }
  console.log(`[social-search] platforms in use: ${configuredPlatforms.map(([p]) => p).join(", ")}`);

  // Check cache
  const cacheKey = `${siteId}:${userQuery.toLowerCase().trim()}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`[social-search] Cache hit for "${cacheKey}" (${cached.length} results)`);
    return cached;
  }

  const searchQueries = buildSearchQueries(userQuery, usable);
  console.log(`[social-search] Searching ${searchQueries.length} platform(s) for "${userQuery}"`);

  // Run all platform searches in parallel
  const allResults = await Promise.all(
    searchQueries.map(async ({ platform, searchQuery, profileUrl, handle }) => {
      const raw = await serperSearch(searchQuery, { num: 5, label: "social-search" });
      return raw
        .filter((r) => belongsToAccount(r.link, platform, handle))
        .map((r) => ({
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
  cache.set(cacheKey, results);
  console.log(`[social-search] Found ${results.length} results (${raw.length - results.length} junk filtered)`);

  return results;
}

// ---------------------------------------------------------------------------
// Format social results into a context block for the RAG LLM
// ---------------------------------------------------------------------------
/**
 * Posts are numbered across the whole list, not per platform, so the model can refer
 * to one with a single stable index. Post URLs are deliberately NOT shown: the model
 * cites `[POST:n]` and the server resolves n back to a URL, which keeps long URLs out
 * of the prose and out of reach of transcription errors.
 */
export function buildSocialContextString(results: SocialSearchResult[]): string {
  if (results.length === 0) return "";

  const lines = results.map(
    (r, i) => `[POST:${i + 1}] (${r.platform}) ${r.title}\n     ${r.snippet}`
  );

  const profiles = new Map<string, string>();
  for (const r of results) {
    if (r.profileUrl && !profiles.has(r.platform)) profiles.set(r.platform, r.profileUrl);
  }
  const profileLine = profiles.size
    ? `\n\nOfficial accounts: ${[...profiles.entries()].map(([p, u]) => `${p} ${u}`).join(" · ")}`
    : "";

  return `${lines.join("\n")}${profileLine}`;
}

/** Distinct official profile URLs, most-referenced platform first. */
export function socialProfileLinks(
  results: SocialSearchResult[]
): Array<{ url: string; title: string; platform: string }> {
  const counts = new Map<string, number>();
  const urls = new Map<string, string>();
  for (const r of results) {
    counts.set(r.platform, (counts.get(r.platform) ?? 0) + 1);
    if (r.profileUrl && !urls.has(r.platform)) urls.set(r.platform, r.profileUrl);
  }
  return [...urls.entries()]
    .sort((a, b) => (counts.get(b[0]) ?? 0) - (counts.get(a[0]) ?? 0))
    .map(([platform, url]) => ({
      platform,
      url,
      title: `${platform.charAt(0).toUpperCase()}${platform.slice(1)}`,
    }));
}
