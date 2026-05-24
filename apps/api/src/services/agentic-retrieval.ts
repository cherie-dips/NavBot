
import { querySiteDocs, type RetrievedDoc } from "./vectorstore";
import {
  expandRetrievalAcrossTrackedPages,
  isExhaustiveListQuestion,
} from "./multipage-retrieval";
import {
  agenticPlannerEnabled,
  agenticRagMaxRounds,
  GROQ_MODELS,
  generateContentText,
  getGroqApiKey,
} from "./gemini-client";
import type { ChatHistoryItem } from "./chat-types";

const MAX_QUERIES_TOTAL = 8;
const MAX_QUERIES_EXHAUSTIVE = 14;
const RETRIEVAL_TOP_K = 12;

export interface AgenticRetrievalParams {
  siteId: string;
  userMessage: string;
  history: ChatHistoryItem[];
  /** Rule-based expanded queries (from caller) */
  baseQueries: string[];
}

function parsePlannerJson(raw: string): {
  search_queries?: string[];
  hyde_paragraph?: string;
} {
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as {
        search_queries?: string[];
        hyde_paragraph?: string;
      };
    } catch {
      return null;
    }
  };
  const direct = tryParse(cleaned);
  if (direct) return direct;
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    const nested = tryParse(match[0]);
    if (nested) return nested;
  }
  return {};
}

function parseRefinerJson(raw: string): { queries?: string[] } {
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]) as { queries?: string[] };
  } catch {
    return {};
  }
}

function uniqueQueries(queries: string[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries) {
    const t = q.trim();
    if (t.length < 2) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= cap) break;
  }
  return out;
}

function bestDistance(docs: RetrievedDoc[]): number {
  if (!docs.length) return 999;
  return Math.min(...docs.map((d) => d.distance ?? 999));
}

/** Token overlap heuristic: weak if few question tokens appear in top chunk. */
function keywordOverlapWeak(message: string, docs: RetrievedDoc[]): boolean {
  if (!docs.length) return true;
  const words = message
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  if (words.length < 2) return false;
  const top = (docs[0]?.content ?? "").toLowerCase();
  let hits = 0;
  for (const w of words) {
    if (top.includes(w)) hits++;
  }
  return hits < Math.min(2, Math.ceil(words.length * 0.25));
}

function retrievalLooksWeak(message: string, docs: RetrievedDoc[]): boolean {
  if (docs.length === 0) return true;
  const d = bestDistance(docs);
  if (d > 0.62) return true;
  if (d > 0.48 && keywordOverlapWeak(message, docs)) return true;
  return false;
}

function lexicalFallbackQueries(userMessage: string): string[] {
  const stop = new Set([
    "what", "when", "where", "which", "who", "how", "does", "did", "the", "and", "for", "with", "from",
    "this", "that", "have", "your", "about", "into", "list", "give", "tell", "name", "all",
  ]);
  const words = userMessage
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]} ${words[i + 1]}`);
  }
  const out = [...new Set([...words.slice(0, 6), ...bigrams.slice(0, 4)])];
  return out.filter((q) => q.length > 2).slice(0, 8);
}

async function runPlanner(
  userMessage: string,
  history: ChatHistoryItem[],
  exhaustiveList: boolean
): Promise<{ search_queries: string[]; hyde_paragraph?: string }> {
  const hist = history
    .slice(-4)
    .map((h) => `${h.role}: ${h.content.slice(0, 200)}`)
    .join("\n");

  const listHint = exhaustiveList
    ? `\nThe user wants a broad list or "all" items. Use 8-12 DISTINCT queries targeting DIFFERENT sections/pages of the website.\n`
    : "";

  const prompt = `You help retrieve website content from a vector database. Your goal is to find ALL pages that might contain relevant information — not just the single best-matching page.

CRITICAL: Information about a topic is often spread across MULTIPLE different pages. For example:
- "deadlines" → admissions page, scholarship page, fees page, financial aid page
- "vice chancellor" → faculty page, events page, about page, news page
- "fees" → tuition page, hostel page, scholarship page, admission page
- "programs" → academics page, individual department pages, placement page

Think about which DIFFERENT sections of a website would mention the topic, and generate queries targeting each section separately.
${listHint}
User message: ${JSON.stringify(userMessage)}
Recent history:
${hist || "(none)"}

Return a JSON object:
- "search_queries": array of 6-12 DISTINCT short search strings. Each query should target a DIFFERENT page/section where the answer might appear. Do NOT generate semantic variations of the same query (bad: "admission deadline", "application deadline", "deadline for admission"). Instead target different pages (good: "admission deadline", "scholarship last date", "fee payment due date", "hostel application deadline").
- "hyde_paragraph": optional 1-2 sentence hypothetical stub with keywords for embedding similarity.
Example for "what are the deadlines?": {"search_queries":["admission application deadline","scholarship deadline","fee payment last date","hostel application deadline","exam registration deadline","financial aid deadline","semester start dates","academic calendar"],"hyde_paragraph":"Application deadlines vary by program. Admission rounds close in January, scholarship applications in February, and fee payment is due by March."}`;

  const raw = await generateContentText({
    model: GROQ_MODELS.planner,
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    config: {
      temperature: 0.2,
      maxOutputTokens: 768,
      responseMimeType: "application/json",
    },
  });

  const parsed = parsePlannerJson(raw);
  let search_queries = Array.isArray(parsed.search_queries)
    ? parsed.search_queries.map((s) => String(s).trim()).filter((s) => s.length > 1)
    : [];

  if (search_queries.length < 2) {
    search_queries = [...search_queries, ...lexicalFallbackQueries(userMessage)];
  }

  return {
    search_queries,
    hyde_paragraph:
      typeof parsed.hyde_paragraph === "string" ? parsed.hyde_paragraph : undefined,
  };
}

async function runRefiner(
  userMessage: string,
  priorQueries: string[],
  docTitles: string[]
): Promise<string[]> {
  const prompt = `The vector database did not return strong matches for this question.

User question: ${JSON.stringify(userMessage)}
Queries already tried: ${JSON.stringify(priorQueries)}
Titles seen in weak results: ${JSON.stringify(docTitles.slice(0, 8))}

Output JSON only: {"queries":["alternative search 1","alternative search 2","alternative search 3"]}
Use broader terms, URL path keywords (e.g. events, /events, workshop), abbreviations, or different phrasings.`;

  const raw = await generateContentText({
    model: GROQ_MODELS.planner,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.3,
      maxOutputTokens: 256,
      responseMimeType: "application/json",
    },
  });

  const q = parseRefinerJson(raw).queries;
  return Array.isArray(q) ? q.filter((s) => typeof s === "string") : [];
}

export type AgenticRetrievalResult = {
  docs: RetrievedDoc[];
  /** For logging / debugging */
  retrievalMeta: {
    ruleQueryCount: number;
    totalQueriesUsed: number;
    plannerRan: boolean;
    refinerIterations: number;
    sufficiencyRounds: number;
    bestDistance: number;
  };
};

/**
 * Planner (always when API key + ENABLE_AGENTIC_PLANNER) + rule queries;
 * refiner loop controlled by AGENTIC_RAG_MAX_ROUNDS only.
 */
function mergeDocsById(primary: RetrievedDoc[], extra: RetrievedDoc[]): RetrievedDoc[] {
  const seen = new Set(primary.map((d) => d.id));
  const merged = [...primary];
  for (const d of extra) {
    if (!seen.has(d.id)) {
      seen.add(d.id);
      merged.push(d);
    }
  }
  return merged;
}

export async function runAgenticRetrieval(
  params: AgenticRetrievalParams
): Promise<AgenticRetrievalResult> {
  const maxRefinerRounds = agenticRagMaxRounds();
  const { siteId, userMessage, history, baseQueries } = params;
  const exhaustiveList = isExhaustiveListQuestion(userMessage);
  const queryCap = exhaustiveList ? MAX_QUERIES_EXHAUSTIVE : MAX_QUERIES_TOTAL;
  const topK = exhaustiveList ? RETRIEVAL_TOP_K + 6 : RETRIEVAL_TOP_K;

  // --- Phase 1: Run planner + initial vector search IN PARALLEL ---
  const immediateQueries = uniqueQueries(
    [...baseQueries, ...lexicalFallbackQueries(userMessage)],
    queryCap
  );

  const usePlanner = agenticPlannerEnabled() && !!getGroqApiKey();

  const [initialDocs, plannerResult] = await Promise.all([
    querySiteDocs({
      siteId,
      query: immediateQueries.length ? immediateQueries : [userMessage],
      topK,
      exhaustiveSpread: exhaustiveList,
    }),
    usePlanner
      ? runPlanner(userMessage, history, exhaustiveList).catch((e) => {
          console.warn("[agentic-retrieval] planner failed:", e);
          return null;
        })
      : Promise.resolve(null),
  ]);

  let plannerRan = !!plannerResult;
  let allQueries = [...immediateQueries];
  let docs = initialDocs;

  // --- Phase 2: If planner returned NEW queries, do a fast follow-up search ---
  if (plannerResult) {
    const plannerQueries = [
      ...plannerResult.search_queries,
      ...(plannerResult.hyde_paragraph ? [plannerResult.hyde_paragraph] : []),
    ];
    const newOnly = plannerQueries.filter(
      (q) => !immediateQueries.some((iq) => iq.toLowerCase() === q.trim().toLowerCase())
    );
    allQueries = uniqueQueries([...immediateQueries, ...plannerQueries], queryCap);

    if (newOnly.length > 0) {
      const plannerDocs = await querySiteDocs({
        siteId,
        query: newOnly,
        topK,
        exhaustiveSpread: exhaustiveList,
      });
      docs = mergeDocsById(initialDocs, plannerDocs);
    }
  }

  // --- Phase 3: Refiner (only if retrieval looks weak) ---
  let refinerIterations = 0;
  let round = 0;
  while (
    maxRefinerRounds > 0 &&
    round < maxRefinerRounds &&
    retrievalLooksWeak(userMessage, docs) &&
    !!getGroqApiKey()
  ) {
    round++;
    try {
      const alt = await runRefiner(
        userMessage,
        allQueries,
        docs.map((d) => d.title).filter(Boolean)
      );
      if (!alt.length) break;
      refinerIterations++;
      const combined = uniqueQueries([...allQueries, ...alt], queryCap + 4);
      const nextDocs = await querySiteDocs({
        siteId,
        query: combined,
        topK,
        exhaustiveSpread: exhaustiveList,
      });
      if (nextDocs.length === 0) break;
      if (bestDistance(nextDocs) < bestDistance(docs) || nextDocs.length > docs.length) {
        docs = nextDocs;
        allQueries = combined;
      }
      if (!retrievalLooksWeak(userMessage, docs)) break;
    } catch (e) {
      console.warn("[agentic-retrieval] refiner failed:", e);
      break;
    }
  }

  docs = await expandRetrievalAcrossTrackedPages(siteId, docs, userMessage);

  const bestDist = bestDistance(docs);
  console.log(
    `[RAG retrieval] site="${siteId}" ruleQueries=${baseQueries.length} totalQueries=${allQueries.length} planner=${plannerRan} refiner=${refinerIterations} exhaustiveList=${exhaustiveList} chunks=${docs.length} bestDistance=${bestDist.toFixed(4)}`
  );

  return {
    docs,
    retrievalMeta: {
      ruleQueryCount: baseQueries.length,
      totalQueriesUsed: allQueries.length,
      plannerRan,
      refinerIterations,
      sufficiencyRounds: 0,
      bestDistance: bestDist,
    },
  };
}

