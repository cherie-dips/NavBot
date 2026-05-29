
import { querySiteDocs, type RetrievedDoc } from "./vectorstore";
import {
  expandRetrievalAcrossTrackedPages,
  isExhaustiveListQuestion,
} from "./multipage-retrieval";
import type { ChatHistoryItem } from "./chat-types";

const MAX_QUERIES_TOTAL = 8;
const MAX_QUERIES_EXHAUSTIVE = 14;
const RETRIEVAL_TOP_K = 18;

export interface AgenticRetrievalParams {
  siteId: string;
  userMessage: string;
  history: ChatHistoryItem[];
  baseQueries: string[];
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

export type AgenticRetrievalResult = {
  docs: RetrievedDoc[];
  retrievalMeta: {
    ruleQueryCount: number;
    totalQueriesUsed: number;
    bestDistance: number;
  };
};

export async function runAgenticRetrieval(
  params: AgenticRetrievalParams
): Promise<AgenticRetrievalResult> {
  const { siteId, userMessage, baseQueries } = params;
  const exhaustiveList = isExhaustiveListQuestion(userMessage);
  const queryCap = exhaustiveList ? MAX_QUERIES_EXHAUSTIVE : MAX_QUERIES_TOTAL;
  const topK = exhaustiveList ? RETRIEVAL_TOP_K + 6 : RETRIEVAL_TOP_K;

  const allQueries = uniqueQueries(
    [...baseQueries, ...lexicalFallbackQueries(userMessage)],
    queryCap
  );

  let docs = await querySiteDocs({
    siteId,
    query: allQueries.length ? allQueries : [userMessage],
    topK,
    exhaustiveSpread: exhaustiveList,
  });

  docs = await expandRetrievalAcrossTrackedPages(siteId, docs, userMessage);

  const bestDist = bestDistance(docs);
  console.log(
    `[RAG retrieval] site="${siteId}" queries=${allQueries.length} exhaustiveList=${exhaustiveList} chunks=${docs.length} bestDistance=${bestDist.toFixed(4)}`
  );

  return {
    docs,
    retrievalMeta: {
      ruleQueryCount: baseQueries.length,
      totalQueriesUsed: allQueries.length,
      bestDistance: bestDist,
    },
  };
}
