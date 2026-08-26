/**
 * Retrieval orchestration.
 *
 * Previous shape: up to 14 rule-generated query variants, each embedded and queried,
 * then an entity-expansion round, then optionally a whole second pass if the first
 * scored badly. Roughly 30 network round trips and up to 96 chunks handed to the model,
 * over half of which were navigation boilerplate.
 *
 * Current shape, one pass:
 *   1. 1-4 planner sub-queries, embedded in a single batch, queried in parallel
 *   2. section expansion for list questions, scoped by the site profile
 *   3. boilerplate removal (collapse duplicates, drop menus)
 *   4. one cross-encoder rerank that decides ordering (and how much to hedge)
 */
import { querySiteDocs, type RetrievedDoc } from "./vectorstore";
import { getTrackedUrls } from "./db";
import { removeBoilerplate, type BoilerplateStats } from "./boilerplate";
import { rerankDocs, RELEVANCE, type RerankedDoc } from "./reranker";
import { sectionsForQuestion } from "./site-profile";
import type { QueryPlan } from "./query-planner";

/** Candidates pulled from the vector store before reranking. */
const CANDIDATE_TOP_K = 24;
const CANDIDATE_TOP_K_EXHAUSTIVE = 32;
/** Chunks kept after reranking — this is what reaches the prompt. */
const KEEP_AFTER_RERANK = 14;
const KEEP_AFTER_RERANK_EXHAUSTIVE = 24;
/** Extra pages pulled in for "list every X" questions. */
const SECTION_EXPANSION_URLS = 40;
const SECTION_EXPANSION_CHUNKS = 40;

/**
 * The tracked-URL set changes only on re-crawl, but section expansion needs it on
 * every list question. Reading 526 rows from Postgres each time was pure latency.
 */
const TRACKED_TTL_MS = 5 * 60_000;
const trackedCache = new Map<string, { at: number; urls: Set<string> }>();

async function getTrackedUrlsCached(siteId: string): Promise<Set<string>> {
  const hit = trackedCache.get(siteId);
  if (hit && Date.now() - hit.at < TRACKED_TTL_MS) return hit.urls;
  const urls = await getTrackedUrls(siteId).catch(() => new Set<string>());
  trackedCache.set(siteId, { at: Date.now(), urls });
  return urls;
}

interface RetrievalResult {
  docs: RerankedDoc[];
  meta: {
    queries: string[];
    candidates: number;
    boilerplate: BoilerplateStats;
    kept: number;
    topScore: number;
    /** "none" means we retrieved nothing at all — never "the score looked low". */
    confidence: "strong" | "weak" | "none";
    rerankOk: boolean;
    ms: { retrieve: number; rerank: number; total: number };
  };
}

function mergeById(sets: RetrievedDoc[][]): RetrievedDoc[] {
  const seen = new Set<string>();
  const out: RetrievedDoc[] = [];
  for (const set of sets) {
    for (const d of set) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(d);
    }
  }
  return out;
}

/**
 * For exhaustive questions, pull in sibling pages from the sections the site profile
 * maps this question to. Without this, "what research centers are there" only sees
 * whichever centers happened to rank in the vector search.
 */
async function expandBySection(
  siteId: string,
  question: string,
  plannerSections: string[]
): Promise<RetrievedDoc[]> {
  const { patterns } = sectionsForQuestion(siteId, question);

  // The planner's own section guesses are treated as path prefixes.
  const plannerPatterns = plannerSections
    .map((s) => s.trim())
    .filter((s) => s.startsWith("/"))
    .map((s) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

  const allPatterns = [...patterns, ...plannerPatterns];
  if (allPatterns.length === 0) return [];

  const tracked = await getTrackedUrlsCached(siteId);
  if (tracked.size === 0) return [];

  const candidates: string[] = [];
  for (const url of tracked) {
    let path: string;
    try {
      path = new URL(url).pathname;
    } catch {
      continue;
    }
    if (allPatterns.some((p) => p.test(path))) candidates.push(url);
    if (candidates.length >= SECTION_EXPANSION_URLS) break;
  }

  if (candidates.length === 0) return [];

  // One metadata-filtered vector query, rather than a list+fetch per URL. On the
  // live index that replaced ~1.5-4.6s of round trips with a single ~0.8s query,
  // and returns the most relevant chunks from those pages instead of the first few.
  return querySiteDocs({
    siteId,
    query: [question],
    topK: SECTION_EXPANSION_CHUNKS,
    restrictToUrls: candidates,
  }).catch(() => []);
}

export async function runRetrieval(params: {
  siteId: string;
  plan: QueryPlan;
}): Promise<RetrievalResult> {
  const { siteId, plan } = params;
  const t0 = Date.now();

  const queries = plan.subQueries.length ? plan.subQueries : [plan.standalone];
  const topK = plan.exhaustive ? CANDIDATE_TOP_K_EXHAUSTIVE : CANDIDATE_TOP_K;

  // The vector search and the section expansion are independent, so they run
  // together. Doing them in sequence was costing ~5s on every list question.
  const [primary, extra] = await Promise.all([
    querySiteDocs({
      siteId,
      query: queries,
      topK,
      exhaustiveSpread: plan.exhaustive,
    }),
    plan.exhaustive
      ? expandBySection(siteId, plan.standalone, plan.sections)
      : Promise.resolve([] as RetrievedDoc[]),
  ]);

  // Primary first so vector-ranked chunks win ties during dedupe.
  const candidates = extra.length ? mergeById([primary, extra]) : primary;

  const retrieveMs = Date.now() - t0;

  const { docs: cleaned, stats } = removeBoilerplate(candidates, siteId);

  const keep = plan.exhaustive ? KEEP_AFTER_RERANK_EXHAUSTIVE : KEEP_AFTER_RERANK;
  const { docs: ranked, ok: rerankOk, ms: rerankMs } = await rerankDocs(
    plan.standalone,
    cleaned,
    keep
  );

  const topScore = ranked[0]?.rerankScore ?? 0;
  // Confidence sets how much the answer hedges. Only an empty result set counts as
  // "none": a low score on a well-retrieved page means unusual phrasing, not absence.
  // Faceted questions are scored against their own bar — see RELEVANCE.STRONG_FACETED.
  const strongBar = plan.experiential ? RELEVANCE.STRONG_FACETED : RELEVANCE.STRONG;
  const confidence: "strong" | "weak" | "none" =
    ranked.length === 0 ? "none" : topScore >= strongBar ? "strong" : "weak";

  console.log(
    `[retrieval] site=${siteId} q=${queries.length} cand=${candidates.length} ` +
      `boilerplate(-${stats.navDropped}nav -${stats.collapsed}dup) -> ${cleaned.length} ` +
      `-> kept ${ranked.length} top=${topScore.toFixed(3)} ${confidence}(bar ${strongBar}) ` +
      `[retrieve ${retrieveMs}ms, rerank ${rerankMs}ms]`
  );

  return {
    docs: ranked,
    meta: {
      queries,
      candidates: candidates.length,
      boilerplate: stats,
      kept: ranked.length,
      topScore,
      confidence,
      rerankOk,
      ms: { retrieve: retrieveMs, rerank: rerankMs, total: Date.now() - t0 },
    },
  };
}
