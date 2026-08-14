/**
 * Cross-encoder reranking via Pinecone Inference.
 *
 * Vector distance is a weak answerability signal: measured on this index, the
 * decisive chunk and an irrelevant one sat at distance 0.426 vs 0.455 — a 0.03 gap
 * that no threshold can separate. The reranker scored the same pair 0.9992 vs 0.55.
 *
 * That calibrated score is what replaces the hand-tuned distance cutoffs
 * (0.70 / 0.75 / 0.85 / 0.92) that were causing refusals on answerable questions.
 */
import { Pinecone } from "@pinecone-database/pinecone";
import type { RetrievedDoc } from "./vectorstore";

const RERANK_MODEL = process.env.PINECONE_RERANK_MODEL?.trim() || "bge-reranker-v2-m3";

/** The model truncates long inputs; keep documents well under its window. */
const MAX_DOC_CHARS = 1800;
/** Pinecone caps documents per rerank call. */
const MAX_DOCS_PER_CALL = 100;

let _pc: Pinecone | null = null;
function getPinecone(): Pinecone {
  if (!_pc) {
    const key = process.env.PINECONE_API_KEY?.trim();
    if (!key) throw new Error("PINECONE_API_KEY is required for reranking.");
    _pc = new Pinecone({ apiKey: key });
  }
  return _pc;
}

type RerankFn = (
  model: string,
  query: string,
  documents: Array<{ id: string; text: string }>,
  options: Record<string, unknown>
) => Promise<{ data: Array<{ index: number; score: number }> }>;

export interface RerankedDoc extends RetrievedDoc {
  /** 0..1, calibrated. Above ~0.5 the chunk genuinely answers the query. */
  rerankScore: number;
}

/**
 * Confidence bands. Derived from observed behaviour on this index: genuinely
 * relevant chunks land above 0.9, tangential ones in the 0.2-0.6 range, and
 * unrelated ones below 0.01.
 */
export const RELEVANCE = {
  /** At or above this, answer normally. */
  STRONG: 0.55,
  /** Between WEAK and STRONG, answer but flag possible incompleteness. */
  WEAK: 0.12,
  /** Below WEAK, we have nothing useful — go to the fallback ladder. */
} as const;

async function rerankBatch(
  query: string,
  docs: RetrievedDoc[]
): Promise<Array<{ doc: RetrievedDoc; score: number }>> {
  const documents = docs.map((d, i) => ({
    id: String(i),
    text: d.content.slice(0, MAX_DOC_CHARS),
  }));

  const rerank = (getPinecone().inference as unknown as { rerank: RerankFn }).rerank;
  const res = await rerank.call(getPinecone().inference, RERANK_MODEL, query, documents, {
    topN: documents.length,
    returnDocuments: false,
  });

  return (res.data ?? [])
    .filter((r) => docs[r.index] !== undefined)
    .map((r) => ({ doc: docs[r.index]!, score: r.score }));
}

/**
 * Rerank candidates against the query and return the top N with scores attached.
 * On any failure this degrades to distance ordering rather than throwing, so a
 * reranker outage slows quality but never breaks chat.
 */
export async function rerankDocs(
  query: string,
  docs: RetrievedDoc[],
  topN: number
): Promise<{ docs: RerankedDoc[]; ok: boolean; ms: number }> {
  const t0 = Date.now();
  if (docs.length === 0) return { docs: [], ok: true, ms: 0 };

  try {
    const batches: RetrievedDoc[][] = [];
    for (let i = 0; i < docs.length; i += MAX_DOCS_PER_CALL) {
      batches.push(docs.slice(i, i + MAX_DOCS_PER_CALL));
    }

    const results = (await Promise.all(batches.map((b) => rerankBatch(query, b)))).flat();
    results.sort((a, b) => b.score - a.score);

    return {
      docs: results.slice(0, topN).map(({ doc, score }) => ({ ...doc, rerankScore: score })),
      ok: true,
      ms: Date.now() - t0,
    };
  } catch (err) {
    console.warn(
      "[rerank] failed, falling back to distance order:",
      err instanceof Error ? err.message.slice(0, 200) : err
    );
    const fallback = [...docs]
      .sort((a, b) => (a.distance ?? 1) - (b.distance ?? 1))
      .slice(0, topN)
      // Map distance into a rough 0..1 so downstream banding still works.
      .map((d) => ({ ...d, rerankScore: Math.max(0, 1 - (d.distance ?? 1)) }));
    return { docs: fallback, ok: false, ms: Date.now() - t0 };
  }
}
