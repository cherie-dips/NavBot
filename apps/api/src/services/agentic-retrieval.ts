import { querySiteDocs, type RetrievedDoc } from "./vectorstore";
import {
  expandRetrievalAcrossTrackedPages,
  isExhaustiveListQuestion,
} from "./multipage-retrieval";
import {
  agenticPlannerEnabled,
  agenticRagMaxRounds,
  GEMINI_MODELS,
  generateContentText,
} from "./gemini-client";
import type { ChatHistoryItem } from "./chat-types";

const MAX_QUERIES_TOTAL = 12;
const MAX_QUERIES_EXHAUSTIVE = 16;
const RETRIEVAL_TOP_K = 12;

/** Cheap fixed strings so vector search hits section pages even when the planner is vague. */
function eventSectionRetrievalBoosters(userMessage: string): string[] {
  if (!/workshop|events?\b|seminar|talk|session|meetup|webinar|hackathon|bootcamp/i.test(userMessage)) {
    return [];
  }
  return ["events", "all events", "workshop", "past events", "event schedule"];
}

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
  needs_computation?: boolean;
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
        needs_computation?: boolean;
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
): Promise<{ search_queries: string[]; hyde_paragraph?: string; needs_computation?: boolean }> {
  const hist = history
    .slice(-4)
    .map((h) => `${h.role}: ${h.content.slice(0, 200)}`)
    .join("\n");

  const eventCatalog =
    exhaustiveList &&
    /workshop|events?\b|seminar|talk|session|meetup|webinar|hackathon|bootcamp/i.test(userMessage);

  const listHint = exhaustiveList
    ? `\nThe user wants a broad list or "all" items. Use 6-10 DISTINCT queries that could match many different pages (e.g. events index, workshops, series names, past years, project pages) — avoid repeating one narrow topic.\n`
    : "";

  const eventHint = eventCatalog
    ? `\nThis question is about events or workshops. Include queries that match INDIVIDUAL activity pages: literal words "events" and "workshop", common tech topics (ML, LLM, CNN, regression, etc.), and years (2023, 2024, 2025) so different /events/... URLs surface — not only /projects or /about.\n`
    : "";

  const prompt = `You help retrieve website content from a vector database. Given the user message and short chat history, respond with JSON only.
${listHint}${eventHint}
User message: ${JSON.stringify(userMessage)}
Recent history:
${hist || "(none)"}

Return a JSON object:
- "search_queries": array of 4-10 DISTINCT short search strings (keywords, product names, page topics, synonyms, alternate phrasings, NOT full sentences). Include sub-queries if the user asks for lists or multiple things.
- "hyde_paragraph": optional 1-2 sentence hypothetical stub (may be wrong) with extra keywords for embedding similarity.
- "needs_computation": true only if arithmetic, percentages, or date math is clearly required.

Example: {"search_queries":["pricing plans","enterprise tier","API cost per month","free trial limits"],"hyde_paragraph":"Plans include starter and enterprise with usage-based API pricing.","needs_computation":false}`;

  const raw = await generateContentText({
    model: GEMINI_MODELS.planner,
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
    needs_computation: parsed.needs_computation === true,
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
    model: GEMINI_MODELS.planner,
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
  needsComputation: boolean;
  /** For logging / debugging */
  retrievalMeta: {
    ruleQueryCount: number;
    totalQueriesUsed: number;
    plannerRan: boolean;
    refinerIterations: number;
    bestDistance: number;
  };
};

/**
 * Planner (always when API key + ENABLE_AGENTIC_PLANNER) + rule queries;
 * refiner loop controlled by AGENTIC_RAG_MAX_ROUNDS only.
 */
export async function runAgenticRetrieval(
  params: AgenticRetrievalParams
): Promise<AgenticRetrievalResult> {
  const maxRefinerRounds = agenticRagMaxRounds();
  const { siteId, userMessage, history, baseQueries } = params;
  const exhaustiveList = isExhaustiveListQuestion(userMessage);
  const queryCap = exhaustiveList ? MAX_QUERIES_EXHAUSTIVE : MAX_QUERIES_TOTAL;

  let needsComputation = false;
  let allQueries: string[] = [...baseQueries];
  let plannerRan = false;

  if (agenticPlannerEnabled() && getGeminiApiKeyForAgentic()) {
    try {
      const planned = await runPlanner(userMessage, history, exhaustiveList);
      plannerRan = true;
      needsComputation = planned.needs_computation === true;
      const fromPlanner = [
        ...planned.search_queries,
        ...(planned.hyde_paragraph ? [planned.hyde_paragraph] : []),
      ];
      allQueries = uniqueQueries([...baseQueries, ...fromPlanner], queryCap);
    } catch (e) {
      console.warn("[agentic-retrieval] planner failed, using rule + lexical fallback:", e);
      allQueries = uniqueQueries(
        [...baseQueries, ...lexicalFallbackQueries(userMessage)],
        queryCap
      );
    }
  } else {
    allQueries = uniqueQueries(
      [...baseQueries, ...lexicalFallbackQueries(userMessage)],
      queryCap
    );
  }

  if (exhaustiveList) {
    allQueries = uniqueQueries(
      [...allQueries, ...eventSectionRetrievalBoosters(userMessage)],
      queryCap
    );
  }

  let docs = await querySiteDocs({
    siteId,
    query: allQueries.length ? allQueries : [userMessage],
    topK: exhaustiveList ? RETRIEVAL_TOP_K + 6 : RETRIEVAL_TOP_K,
    exhaustiveSpread: exhaustiveList,
  });

  let refinerIterations = 0;
  let round = 0;
  while (
    maxRefinerRounds > 0 &&
    round < maxRefinerRounds &&
    retrievalLooksWeak(userMessage, docs) &&
    getGeminiApiKeyForAgentic()
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
        topK: exhaustiveList ? RETRIEVAL_TOP_K + 6 : RETRIEVAL_TOP_K,
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
    needsComputation,
    retrievalMeta: {
      ruleQueryCount: baseQueries.length,
      totalQueriesUsed: allQueries.length,
      plannerRan,
      refinerIterations,
      bestDistance: bestDist,
    },
  };
}

function getGeminiApiKeyForAgentic(): boolean {
  return !!(process.env.GOOGLE_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim());
}
