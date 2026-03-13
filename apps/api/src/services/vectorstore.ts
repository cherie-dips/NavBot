import { ChromaClient, CloudClient, IncludeEnum, OpenAIEmbeddingFunction } from "chromadb";
import crypto from "crypto";
import type { CrawledPage } from "./crawler";

// ---------------------------------------------------------------------------
// Client setup — Cloud or local ChromaDB
// ---------------------------------------------------------------------------
const useChromaCloud =
  process.env.CHROMA_API_KEY &&
  process.env.CHROMA_TENANT &&
  process.env.CHROMA_DATABASE;

function getCloudHost(): string {
  const raw = process.env.CHROMA_HOST || "api.trychroma.com";
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

const client = useChromaCloud
  ? new CloudClient({
      apiKey: process.env.CHROMA_API_KEY!,
      cloudHost: getCloudHost(),
      cloudPort: process.env.CHROMA_CLOUD_PORT || "443",
      tenant: process.env.CHROMA_TENANT!,
      database: process.env.CHROMA_DATABASE!,
    })
  : new ChromaClient({
      path: process.env.CHROMA_URL || "http://localhost:8000",
    });

// ---------------------------------------------------------------------------
// Embedding function
// Use text-embedding-3-small (OpenAI) — far better semantic retrieval than
// ChromaDB's default. Falls back gracefully if key is absent.
//
// Alternative: swap for a local "nomic-embed-text" via Ollama for zero cost.
// ---------------------------------------------------------------------------
const embedder = process.env.OPENAI_API_KEY
  ? new OpenAIEmbeddingFunction({
      openai_api_key: process.env.OPENAI_API_KEY,
      openai_model: "text-embedding-3-small", // cheap + accurate
    })
  : undefined; // ChromaDB default embedding when no key provided

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const COLLECTION_PREFIX = "site_";

/**
 * Chunk size tuned for deadline/table-heavy pages:
 * - Small enough that one chunk = one topic
 * - Large enough to include a full table row with context
 */
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 180; // ~20% overlap preserves cross-boundary context
const MAX_PAGE_CONTENT_LENGTH = 12000; // allow longer pages (tables are verbose)
const MAX_TITLE_LENGTH = 500;
const BATCH_SIZE = 10; // upsert in batches for speed

// ---------------------------------------------------------------------------
// Chunking — split on paragraph/sentence boundaries where possible
// ---------------------------------------------------------------------------
function chunkText(
  text: string,
  maxChunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): string[] {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return [];
  if (trimmed.length <= maxChunkSize) return [trimmed];

  const chunks: string[] = [];
  let start = 0;

  while (start < trimmed.length) {
    let end = start + maxChunkSize;

    if (end < trimmed.length) {
      // Prefer splitting on double newline (paragraph boundary)
      const paraBreak = trimmed.lastIndexOf("\n\n", end);
      if (paraBreak > start + maxChunkSize * 0.5) {
        end = paraBreak + 2;
      } else {
        // Fall back to single newline
        const lineBreak = trimmed.lastIndexOf("\n", end);
        if (lineBreak > start + maxChunkSize * 0.5) {
          end = lineBreak + 1;
        } else {
          // Last resort: word boundary
          const wordBreak = trimmed.lastIndexOf(" ", end);
          if (wordBreak > start) end = wordBreak + 1;
        }
      }
    }

    const chunk = trimmed.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);

    start = end - overlap;
    if (start >= trimmed.length) break;
  }

  return chunks.filter((c) => c.length > 20); // discard tiny fragments
}

// ---------------------------------------------------------------------------
// Build enriched chunks — CRITICAL: every chunk includes page identity
// so the embedding model has full context even when the chunk is retrieved
// in isolation.
// ---------------------------------------------------------------------------
interface EnrichedChunk {
  id: string;
  document: string; // prefixed with page title + URL
  url: string;
  title: string;
  chunkIndex: number;
  totalChunks: number;
}

function buildEnrichedChunks(page: CrawledPage): EnrichedChunk[] {
  const content = typeof page.content === "string"
    ? page.content.slice(0, MAX_PAGE_CONTENT_LENGTH)
    : "";
  const title = String(page.title ?? "").slice(0, MAX_TITLE_LENGTH);
  const url = String(page.url ?? "");

  const rawChunks = chunkText(content);
  if (rawChunks.length === 0) return [];

  return rawChunks.map((chunk, i) => {
    // Prefix EVERY chunk with page identity — this is what makes retrieval work.
    // When a user asks "what's the MS AI deadline", the chunk containing
    // "Feb 1, 2026" will also contain "MS in AI Admissions" from the prefix.
    const enrichedDocument = [
      `Page: ${title}`,
      `URL: ${url}`,
      rawChunks.length > 1 ? `Section: ${i + 1} of ${rawChunks.length}` : "",
      "",
      chunk,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      id: rawChunks.length === 1 ? url : `${url}#chunk_${i}`,
      document: enrichedDocument,
      url,
      title,
      chunkIndex: i,
      totalChunks: rawChunks.length,
    };
  });
}

// ---------------------------------------------------------------------------
// Content fingerprint for dedup within a single upsert call
// (crawler already dedupes pages; this catches any edge cases)
// ---------------------------------------------------------------------------
function chunkFingerprint(text: string): string {
  return crypto.createHash("md5").update(text).digest("hex");
}

// ---------------------------------------------------------------------------
// Collection accessor
// ---------------------------------------------------------------------------
async function getSiteCollection(siteId: string) {
  const name = `${COLLECTION_PREFIX}${siteId}`;
  return client.getOrCreateCollection({
    name,
    ...(embedder ? { embeddingFunction: embedder } : {}),
    metadata: {
      "hnsw:space": "cosine", // cosine similarity works better for semantic search
    },
  });
}

// ---------------------------------------------------------------------------
// Upsert pages into ChromaDB
// ---------------------------------------------------------------------------
export async function upsertSitePages(
  siteId: string,
  pages: CrawledPage[],
  options?: { replaceExisting?: boolean }
) {
  const collection = await getSiteCollection(siteId);

  if (options?.replaceExisting) {
    try {
      // Delete all docs for this site
      await collection.delete({ where: { siteId } });
      console.log(`Cleared existing docs for site: ${siteId}`);
    } catch (err) {
      console.error("Failed to clear existing docs for site", siteId, err);
    }
  }

  // Build all enriched chunks, deduping on content hash
  const seenHashes = new Set<string>();
  const allChunks: EnrichedChunk[] = [];

  for (const page of pages) {
    const chunks = buildEnrichedChunks(page);
    for (const chunk of chunks) {
      const hash = chunkFingerprint(chunk.document);
      if (seenHashes.has(hash)) continue;
      seenHashes.add(hash);
      allChunks.push(chunk);
    }
  }

  console.log(
    `Upserting ${allChunks.length} chunks from ${pages.length} pages into site "${siteId}"`
  );

  // Upsert in batches
  const failedIds: string[] = [];

  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);

    try {
      await collection.upsert({
        ids: batch.map((c) => c.id),
        documents: batch.map((c) => c.document),
        metadatas: batch.map((c) => ({
          siteId: String(siteId),
          url: c.url,
          title: c.title,
          chunkIndex: c.chunkIndex,
          totalChunks: c.totalChunks,
        })),
      });

      if (i % 100 === 0) {
        console.log(`  Progress: ${Math.min(i + BATCH_SIZE, allChunks.length)} / ${allChunks.length}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // 422 from Chroma Cloud = chunk too large or bad content; skip gracefully
      if (msg.includes("422")) {
        const ids = batch.map((c) => c.id);
        failedIds.push(...ids);
        console.warn(
          `Chroma 422 — skipping batch of ${batch.length} starting at: ${ids[0]}`
        );
        continue;
      }

      throw err;
    }
  }

  if (failedIds.length > 0) {
    console.warn(
      `Chroma Cloud: ${failedIds.length} chunk(s) skipped (422):`,
      failedIds.slice(0, 5).join(", "),
      failedIds.length > 5 ? `... and ${failedIds.length - 5} more` : ""
    );
  }

  return {
    insertedCount: allChunks.length - failedIds.length,
    failedCount: failedIds.length,
    pageCount: pages.length,
    totalChunks: allChunks.length,
  };
}

export type UpsertResult = ReturnType<typeof upsertSitePages> extends Promise<infer T>
  ? T
  : never;

// ---------------------------------------------------------------------------
// Delete chunks for specific page URLs (used for selective page updates)
// ---------------------------------------------------------------------------
export async function deletePagesFromSite(
  siteId: string,
  pageUrls: string[]
): Promise<number> {
  const collection = await getSiteCollection(siteId);
  let deletedCount = 0;

  for (const url of pageUrls) {
    try {
      await collection.delete({ where: { url } });
      deletedCount++;
      console.log(`Deleted chunks for: ${url}`);
    } catch (err) {
      console.error(`Failed to delete chunks for ${url}:`, err);
    }
  }

  console.log(`Deleted chunks for ${deletedCount}/${pageUrls.length} URLs from site "${siteId}"`);
  return deletedCount;
}

// ---------------------------------------------------------------------------
// Retrieved document shape
// ---------------------------------------------------------------------------
export interface RetrievedDoc {
  id: string;
  content: string; // enriched document text
  url: string;
  title: string;
  distance?: number;
}

// ---------------------------------------------------------------------------
// Query — supports multiple query strings for multi-pass retrieval
// ---------------------------------------------------------------------------
export async function querySiteDocs(params: {
  siteId: string;
  query: string | string[]; // accept array for multi-query retrieval
  topK?: number;
}): Promise<RetrievedDoc[]> {
  const { siteId, topK = 6 } = params;
  const queries = Array.isArray(params.query) ? params.query : [params.query];

  const collection = await getSiteCollection(siteId);

  // Run all queries in one ChromaDB call (queryTexts accepts multiple queries)
  const result = await collection.query({
    nResults: topK,
    queryTexts: queries,
    where: { siteId },
    include: [
      IncludeEnum.Metadatas,
      IncludeEnum.Documents,
      IncludeEnum.Distances,
    ],
  });

  // Flatten results from all query vectors, dedup by chunk id
  const seen = new Set<string>();
  const docs: RetrievedDoc[] = [];

  for (let q = 0; q < queries.length; q++) {
    const ids = result.ids?.[q] || [];
    const documents = result.documents?.[q] || [];
    const metadatas = result.metadatas?.[q] || [];
    const distances = result.distances?.[q] || [];

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (seen.has(id)) continue;
      seen.add(id);

      const meta = metadatas[i] as Record<string, unknown>;
      docs.push({
        id,
        content: (documents[i] as string) ?? "",
        url: (meta?.url as string) ?? "",
        title: (meta?.title as string) ?? "",
        distance:
          typeof distances[i] === "number" ? (distances[i] as number) : undefined,
      });
    }
  }

  // Sort by distance (closest = most relevant) and return top K overall
  docs.sort((a, b) => (a.distance ?? 1) - (b.distance ?? 1));
  return docs.slice(0, topK * queries.length);
}