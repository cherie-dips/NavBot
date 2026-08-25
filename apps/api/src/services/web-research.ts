/**
 * Site-restricted web research.
 *
 * The vector index is a snapshot of the last crawl. It misses pages the crawler
 * never reached and goes stale between syncs, and neither failure is visible from
 * inside the index — retrieval just returns its best wrong answer. A live Google
 * search over the same domain catches both, and costs one round trip.
 *
 * Two providers, same output shape:
 *
 *   "gemini-grounding" — the Gemini API's Google Search tool. This is the supported
 *     API form of the AI Overview: Gemini runs real searches and returns a synthesised
 *     summary plus citations. It cannot be *forced* to stay on one domain (the model
 *     picks its own queries), so its citations are filtered to the site afterwards,
 *     and its source URIs are Google redirects that must be resolved before they can
 *     be shown to a visitor.
 *
 *   "serper" — a plain Google search with a `site:` filter. No summary of its own,
 *     but the restriction is enforced by Google rather than requested politely, and
 *     the URLs are the real, permanent ones.
 *
 * `auto` prefers grounding and falls back to Serper, because grounding quota is
 * metered per month and returns 429 the moment it runs out.
 */
import { getGoogleGenAI, GEMINI_MODELS } from "./gemini-client";
import { getSiteProfile } from "./site-profile";

interface WebSource {
  url: string;
  title: string;
  snippet: string;
}

type WebProvider = "gemini-grounding" | "serper" | "none";

export interface WebResearch {
  /**
   * Gemini's own grounded prose. Only the grounding provider produces this; Serper
   * returns snippets and the caller's analyst pass does the synthesis.
   */
  summary: string;
  sources: WebSource[];
  provider: WebProvider;
  queries: string[];
  ms: number;
}

const EMPTY: WebResearch = { summary: "", sources: [], provider: "none", queries: [], ms: 0 };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
type ProviderMode = "auto" | "grounding" | "serper" | "off";

function providerMode(): ProviderMode {
  const raw = process.env.NAVBOT_WEB_PROVIDER?.trim().toLowerCase();
  if (raw === "grounding" || raw === "serper" || raw === "off") return raw;
  return "auto";
}

function getSerperApiKey(): string {
  return process.env.SERPER_API_KEY?.trim() ?? "";
}

/** Searches issued per question. Each one is a billable Serper credit. */
const MAX_QUERIES = 3;
/** Results requested per query before dedupe. */
const RESULTS_PER_QUERY = 6;
/** Sources handed to the caller after merging. */
const MAX_SOURCES = 8;
const SEARCH_TIMEOUT_MS = 6_000;
const GROUNDING_MAX_TOKENS = 1_200;

// ---------------------------------------------------------------------------
// Cache — the same question from many visitors should cost one search
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { research: WebResearch; ts: number }>();

function cacheKey(siteId: string, question: string): string {
  return `${siteId}:${question.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

function getCached(key: string): WebResearch | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.research;
}

function setCached(key: string, research: WebResearch): void {
  cache.set(key, { research, ts: Date.now() });
  if (cache.size > 300) {
    const now = Date.now();
    for (const [k, v] of cache) if (now - v.ts > CACHE_TTL_MS) cache.delete(k);
  }
}

// ---------------------------------------------------------------------------
// Grounding circuit breaker
//
// Grounded requests are metered separately from ordinary generation and return 429
// the instant the monthly allowance is gone. Retrying every turn would add a failed
// round trip to every question for the rest of the month, so one failure parks the
// provider and Serper takes over.
// ---------------------------------------------------------------------------
const GROUNDING_COOLDOWN_MS = 30 * 60 * 1000;
let groundingBlockedUntil = 0;

function groundingAvailable(): boolean {
  return Date.now() >= groundingBlockedUntil;
}

function parkGrounding(reason: string): void {
  groundingBlockedUntil = Date.now() + GROUNDING_COOLDOWN_MS;
  console.warn(
    `[web-research] grounding unavailable (${reason}) — using Serper for the next ${GROUNDING_COOLDOWN_MS / 60000} minutes`
  );
}

// ---------------------------------------------------------------------------
// Domain handling
// ---------------------------------------------------------------------------
/** siteId is a bare domain in this project, but tolerate a URL or a stray "www.". */
export function siteDomain(siteId: string): string {
  let raw = siteId.trim().toLowerCase();
  raw = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return raw.replace(/^www\./, "");
}

/** Subdomains count: btech-admissions.plaksha.edu.in is still the university. */
function isOnDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Serper provider
// ---------------------------------------------------------------------------
async function serperSearch(query: string): Promise<WebSource[]> {
  const key = getSerperApiKey();
  if (!key) return [];

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: RESULTS_PER_QUERY }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[web-research] Serper ${res.status} for "${query.slice(0, 60)}"`);
      return [];
    }
    const data = (await res.json()) as {
      organic?: Array<{ title?: string; link?: string; snippet?: string }>;
    };
    return (data.organic ?? [])
      .filter((r) => r.link)
      .map((r) => ({ url: r.link!, title: r.title ?? "", snippet: r.snippet ?? "" }));
  } catch (err) {
    console.warn(
      `[web-research] Serper failed for "${query.slice(0, 60)}":`,
      err instanceof Error ? err.message.slice(0, 120) : err
    );
    return [];
  }
}

async function researchViaSerper(
  domain: string,
  queries: string[]
): Promise<{ sources: WebSource[]; queries: string[] }> {
  const scoped = queries.map((q) => `site:${domain} ${q}`);
  const batches = await Promise.all(scoped.map(serperSearch));

  const seen = new Set<string>();
  const sources: WebSource[] = [];
  // Round-robin across queries so one broad query cannot crowd out the others'
  // top hits — with a flat concat, sub-query 3 never reaches the model.
  const depth = Math.max(0, ...batches.map((b) => b.length));
  for (let i = 0; i < depth && sources.length < MAX_SOURCES; i++) {
    for (const batch of batches) {
      const r = batch[i];
      if (!r || seen.has(r.url) || !isOnDomain(r.url, domain)) continue;
      seen.add(r.url);
      sources.push(r);
      if (sources.length >= MAX_SOURCES) break;
    }
  }

  return { sources, queries: scoped };
}

// ---------------------------------------------------------------------------
// Gemini grounding provider
// ---------------------------------------------------------------------------
/**
 * Grounding citations point at vertexaisearch.google.com redirects, which expire and
 * would show the visitor a Google URL instead of the university's. Reading the
 * `location` header resolves them without downloading the page.
 */
async function resolveRedirect(uri: string): Promise<string | null> {
  let current = uri;
  for (let hop = 0; hop < 3; hop++) {
    try {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(4_000),
      });
      const location = res.headers.get("location");
      if (!location) return res.status < 400 ? current : null;
      current = new URL(location, current).toString();
      if (!/vertexaisearch\.google\.com|google\.com\/url/.test(current)) return current;
    } catch {
      return null;
    }
  }
  return current;
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(msg);
}

async function researchViaGrounding(
  siteId: string,
  domain: string,
  question: string
): Promise<{ summary: string; sources: WebSource[]; queries: string[] } | null> {
  const ai = getGoogleGenAI();
  const name = getSiteProfile(siteId).displayName || domain;

  const instruction = `You are researching a question about ${name} for its website assistant.

Search the web and gather the facts needed to answer it. Every search you run must be restricted to the official site with a "site:${domain}" filter — do not use sources from anywhere else, and ignore third-party listing sites, forums and news coverage even if they appear.

Write a factual brief of what you found. Give exact figures, dates and names as they appear on the site. If the site does not answer part of the question, say which part is missing rather than filling it from general knowledge.`;

  let res: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    res = await ai.models.generateContent({
      model: GEMINI_MODELS.chat,
      contents: [{ role: "user", parts: [{ text: question }] }],
      config: {
        systemInstruction: instruction,
        temperature: 0.2,
        maxOutputTokens: GROUNDING_MAX_TOKENS,
        tools: [{ googleSearch: {} }],
      } as never,
    });
  } catch (err) {
    if (isQuotaError(err)) parkGrounding("quota exhausted");
    else
      console.warn(
        "[web-research] grounding call failed:",
        err instanceof Error ? err.message.slice(0, 200) : err
      );
    return null;
  }

  const meta = (res.candidates?.[0] as { groundingMetadata?: unknown })?.groundingMetadata as
    | {
        webSearchQueries?: string[];
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      }
    | undefined;

  const chunks = (meta?.groundingChunks ?? []).filter((c) => c.web?.uri);
  const resolved = await Promise.all(
    chunks.slice(0, MAX_SOURCES * 2).map(async (c) => {
      const url = await resolveRedirect(c.web!.uri!);
      return url ? { url, title: c.web!.title ?? "", snippet: "" } : null;
    })
  );

  // The domain filter is the enforcement step: the prompt asked the model to stay on
  // the site, and this is what happens when it did not.
  const seen = new Set<string>();
  const sources: WebSource[] = [];
  for (const r of resolved) {
    if (!r || seen.has(r.url) || !isOnDomain(r.url, domain)) continue;
    seen.add(r.url);
    sources.push(r);
    if (sources.length >= MAX_SOURCES) break;
  }

  const summary = res.text?.trim() ?? "";
  if (!summary && sources.length === 0) return null;

  return { summary, sources, queries: meta?.webSearchQueries ?? [] };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export async function researchWeb(params: {
  siteId: string;
  question: string;
  /** Planner sub-queries. They already read as page text, which is what search wants. */
  subQueries?: string[];
}): Promise<WebResearch> {
  const { siteId, question, subQueries = [] } = params;
  const mode = providerMode();
  if (mode === "off") return EMPTY;

  const key = cacheKey(siteId, question);
  const cached = getCached(key);
  if (cached) return cached;

  const domain = siteDomain(siteId);
  if (!domain) return EMPTY;

  const t0 = Date.now();

  // Grounding first when it is allowed and has not been parked by a quota failure.
  if ((mode === "auto" || mode === "grounding") && groundingAvailable()) {
    const grounded = await researchViaGrounding(siteId, domain, question);
    if (grounded && (grounded.summary || grounded.sources.length)) {
      const research: WebResearch = {
        ...grounded,
        provider: "gemini-grounding",
        ms: Date.now() - t0,
      };
      console.log(
        `[web-research] site=${siteId} provider=grounding sources=${research.sources.length} ${research.ms}ms`
      );
      setCached(key, research);
      return research;
    }
    if (mode === "grounding") return EMPTY;
  }

  if (mode === "grounding") return EMPTY;

  // Dedupe so two sub-queries that rewrote to the same phrase do not burn two credits.
  const seenQ = new Set<string>();
  const queries = [question, ...subQueries]
    .map((q) => q.trim())
    .filter((q) => {
      const norm = q.toLowerCase();
      if (q.length < 3 || seenQ.has(norm)) return false;
      seenQ.add(norm);
      return true;
    })
    .slice(0, MAX_QUERIES);

  const { sources, queries: issued } = await researchViaSerper(domain, queries);
  const research: WebResearch = {
    summary: "",
    sources,
    provider: sources.length ? "serper" : "none",
    queries: issued,
    ms: Date.now() - t0,
  };

  console.log(
    `[web-research] site=${siteId} provider=${research.provider} q=${issued.length} sources=${sources.length} ${research.ms}ms`
  );

  if (sources.length) setCached(key, research);
  return research;
}

/** Formats sources for a prompt. Numbering is 1-based to match how models cite. */
export function buildWebContextString(research: WebResearch): string {
  if (!research.sources.length && !research.summary) return "";

  const parts: string[] = [];
  if (research.summary) {
    parts.push(`Search summary (from a live web search of the official site):\n${research.summary}`);
  }
  if (research.sources.length) {
    const lines = research.sources.map(
      (s, i) => `[WEB:${i + 1}] ${s.title || s.url}\n${s.url}${s.snippet ? `\n${s.snippet}` : ""}`
    );
    parts.push(`Live search results from the official site:\n\n${lines.join("\n\n")}`);
  }
  return parts.join("\n\n");
}
