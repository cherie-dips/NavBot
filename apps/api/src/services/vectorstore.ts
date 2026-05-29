import { Pinecone } from "@pinecone-database/pinecone";
import crypto from "crypto";
import type { CrawledPage } from "./crawler";

// ---------------------------------------------------------------------------
// Pinecone client + embedding model (Inference API)
// ---------------------------------------------------------------------------
const PINECONE_API_KEY = process.env.PINECONE_API_KEY?.trim() ?? "";
const PINECONE_INDEX = process.env.PINECONE_INDEX?.trim() ?? "";
const PINECONE_EMBEDDING_MODEL =
  process.env.PINECONE_EMBEDDING_MODEL?.trim() || "llama-text-embed-v2";
const PINECONE_EMBEDDING_DIMENSION = (() => {
  const n = parseInt(process.env.PINECONE_EMBEDDING_DIMENSION ?? "1024", 10);
  return Number.isFinite(n) && n > 0 ? n : 1024;
})();

/**
 * `vectors` | `records` = force upsert style.
 * `auto` (default) = call describeIndex: if the index has `embed`, use `upsertRecords` (console “with embedding model” indexes).
 */
const PINECONE_UPSERT_MODE_ENV = process.env.PINECONE_UPSERT_MODE?.trim().toLowerCase() ?? "";

const ENV_EMBED_TEXT_FIELD =
  process.env.PINECONE_EMBED_TEXT_FIELD?.trim() || "chunk_text";

/** Mutable: resolved from index `fieldMap` when mode is auto+records. */
let activeEmbedTextField = ENV_EMBED_TEXT_FIELD;

let _upsertConfigCache: { mode: "vectors" | "records"; textField: string } | null =
  null;

/** Resolved index dimension — updated by resolveUpsertConfig from describeIndex. */
let resolvedDimension = PINECONE_EMBEDDING_DIMENSION;

/**
 * Pick vector upsert vs integrated upsertRecords and the text field name on records.
 * Also detects the actual index dimension for query-time embedding.
 */
async function resolveUpsertConfig(): Promise<{
  mode: "vectors" | "records";
  textField: string;
}> {
  if (_upsertConfigCache) {
    activeEmbedTextField = _upsertConfigCache.textField;
    return _upsertConfigCache;
  }

  // Always call describeIndex to detect the real dimension
  const desc = await getPinecone().describeIndex(PINECONE_INDEX);
  if (typeof desc.dimension === "number" && desc.dimension > 0) {
    resolvedDimension = desc.dimension;
  }

  if (PINECONE_UPSERT_MODE_ENV === "records") {
    _upsertConfigCache = { mode: "records", textField: ENV_EMBED_TEXT_FIELD };
    activeEmbedTextField = ENV_EMBED_TEXT_FIELD;
    console.log(
      `[vectorstore] Index "${PINECONE_INDEX}" dimension=${resolvedDimension}, upsert mode="records"`
    );
    return _upsertConfigCache;
  }
  if (PINECONE_UPSERT_MODE_ENV === "vectors") {
    _upsertConfigCache = { mode: "vectors", textField: ENV_EMBED_TEXT_FIELD };
    activeEmbedTextField = ENV_EMBED_TEXT_FIELD;
    console.log(
      `[vectorstore] Index "${PINECONE_INDEX}" dimension=${resolvedDimension}, upsert mode="vectors"`
    );
    return _upsertConfigCache;
  }

  // auto (default when unset or "auto")
  let mode: "vectors" | "records" = desc.embed ? "records" : "vectors";
  let textField = ENV_EMBED_TEXT_FIELD;

  if (desc.embed?.fieldMap && typeof desc.embed.fieldMap === "object") {
    const fm = desc.embed.fieldMap as Record<string, unknown>;
    const vals = Object.values(fm).filter((v): v is string => typeof v === "string");
    if (vals.length > 0) {
      textField = vals[0]!;
    }
  }

  _upsertConfigCache = { mode, textField };
  activeEmbedTextField = textField;
  console.log(
    `[vectorstore] Index "${PINECONE_INDEX}" describeIndex → dimension=${resolvedDimension}, upsert mode="${mode}"` +
      (mode === "records" ? `, embed text field="${textField}"` : "") +
      (desc.embed?.model ? `, index model=${desc.embed.model}` : "")
  );
  return _upsertConfigCache;
}

const UPSERT_RECORDS_BATCH = 64;

function requirePineconeConfig(): void {
  if (!PINECONE_API_KEY) {
    throw new Error("PINECONE_API_KEY is required for the vector store.");
  }
  if (!PINECONE_INDEX) {
    throw new Error("PINECONE_INDEX is required for the vector store.");
  }
}

let _pinecone: Pinecone | null = null;

function getPinecone(): Pinecone {
  requirePineconeConfig();
  if (!_pinecone) {
    _pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
  }
  return _pinecone;
}

const PINECONE_HOST = process.env.PINECONE_HOST?.trim() ?? "";

function index() {
  return PINECONE_HOST
    ? getPinecone().index(PINECONE_INDEX, PINECONE_HOST)
    : getPinecone().index(PINECONE_INDEX);
}

function siteNamespace(siteId: string): string {
  return `site_${siteId}`;
}

function nsIndex(siteId: string) {
  return index().namespace(siteNamespace(siteId));
}

/** Record count in Pinecone for this site’s namespace (0 if missing or on error). */
export async function pineconeSiteNamespaceRecordCount(
  siteId: string
): Promise<number> {
  try {
    requirePineconeConfig();
    const stats = await index().describeIndexStats();
    const ns = siteNamespace(siteId);
    const raw = stats.namespaces?.[ns]?.recordCount;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  } catch (err) {
    console.warn(
      `[vectorstore] describeIndexStats failed for namespace "${siteNamespace(siteId)}":`,
      err
    );
    return 0;
  }
}

/** Stable short hash for vector IDs and list-by-prefix (per URL). */
function urlHash(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 16);
}

/** Deterministic ID: avoids prefix collisions between chunk indices. */
function chunkVectorId(url: string, chunkIndex: number): string {
  return `${urlHash(url)}_${String(chunkIndex).padStart(6, "0")}`;
}

async function embedTexts(
  texts: string[],
  inputType: "query" | "passage"
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const params: Record<string, string> = {
    inputType,
    truncate: "END",
  };
  (params as Record<string, unknown>).dimension = resolvedDimension;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await getPinecone().inference.embed(
        PINECONE_EMBEDDING_MODEL,
        texts,
        params
      );

      const data = res.data ?? [];
      if (data.length !== texts.length) {
        throw new Error(
          `Pinecone embed: expected ${texts.length} vectors, got ${data.length}`
        );
      }

      const out: number[][] = [];
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row || row.vectorType !== "dense" || !("values" in row)) {
          throw new Error(`Pinecone embed: expected dense vector at index ${i}`);
        }
        const values = row.values;
        if (!values?.length) {
          throw new Error(`Pinecone embed: empty vector at index ${i}`);
        }
        if (values.length !== resolvedDimension) {
          console.warn(
            `[vectorstore] embedding dim ${values.length} !== index dimension (${resolvedDimension}); check index + model config`
          );
        }
        out.push([...values]);
      }
      return out;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/expected.*vector|expected.*dense|empty vector/i.test(msg)) throw err;
      if (attempt < 3) {
        console.warn(`[vectorstore] embed failed (attempt ${attempt}/3): ${msg.slice(0, 200)}. Retrying...`);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw lastErr;
}

/** Pinecone cosine scores are similarity (higher = closer). Chroma used distance (lower = closer). */
function scoreToDistance(score: number | undefined): number | undefined {
  if (typeof score !== "number" || Number.isNaN(score)) return undefined;
  return 1 - score;
}

/** Passage text on query/fetch hits (metadata `content` or integrated embed field). */
function chunkTextFromMetadata(
  meta: Record<string, unknown> | null | undefined
): string {
  if (!meta) return "";
  if (typeof meta.content === "string" && meta.content.length > 0) {
    return meta.content;
  }
  const fromField = meta[activeEmbedTextField];
  if (typeof fromField === "string") return fromField;
  return "";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 300;
const MAX_PAGE_CONTENT_LENGTH = 48000;
const MAX_TITLE_LENGTH = 500;
const EMBED_BATCH_SIZE = 32;
const UPSERT_BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Chunking
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
      const paraBreak = trimmed.lastIndexOf("\n\n", end);
      if (paraBreak > start + maxChunkSize * 0.5) {
        end = paraBreak + 2;
      } else {
        const lineBreak = trimmed.lastIndexOf("\n", end);
        if (lineBreak > start + maxChunkSize * 0.5) {
          end = lineBreak + 1;
        } else {
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

  return chunks.filter((c) => c.length > 20);
}

interface EnrichedChunk {
  id: string;
  document: string;
  url: string;
  title: string;
  chunkIndex: number;
  totalChunks: number;
}

function findSectionHeading(fullContent: string, chunkText: string): string {
  const searchKey = chunkText.split("\n").find((l) => l.trim().length > 20)?.trim();
  if (!searchKey) return "";
  const pos = fullContent.indexOf(searchKey);
  if (pos < 0) return "";

  const before = fullContent.slice(0, pos);
  const headingStack: string[] = [];
  for (const line of before.split("\n")) {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const level = match[1]!.length;
      while (headingStack.length >= level) headingStack.pop();
      headingStack.push(match[2]!.trim());
    }
  }
  return headingStack.join(" > ");
}

function buildEnrichedChunks(page: CrawledPage): EnrichedChunk[] {
  const content =
    typeof page.content === "string"
      ? page.content.slice(0, MAX_PAGE_CONTENT_LENGTH)
      : "";
  const title = String(page.title ?? "").slice(0, MAX_TITLE_LENGTH);
  const url = String(page.url ?? "");

  const rawChunks = chunkText(content);
  if (rawChunks.length === 0) return [];

  return rawChunks.map((chunk, i) => {
    const heading = findSectionHeading(content, chunk);
    const enrichedDocument = [
      `Page: ${title}`,
      `URL: ${url}`,
      heading ? `Section: ${heading}` : "",
      rawChunks.length > 1 ? `Part: ${i + 1} of ${rawChunks.length}` : "",
      "",
      chunk,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      id: chunkVectorId(url, i),
      document: enrichedDocument,
      url,
      title,
      chunkIndex: i,
      totalChunks: rawChunks.length,
    };
  });
}

function chunkFingerprint(text: string): string {
  return crypto.createHash("md5").update(text).digest("hex");
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------
export async function upsertSitePages(
  siteId: string,
  pages: CrawledPage[],
  options?: { replaceExisting?: boolean }
) {
  const { mode: upsertMode, textField: embedTextField } = await resolveUpsertConfig();
  const ns = nsIndex(siteId);

  if (options?.replaceExisting) {
    try {
      await ns.deleteAll();
      console.log(`Cleared Pinecone namespace for site: ${siteId}`);
    } catch (err) {
      console.error("Failed to clear existing vectors for site", siteId, err);
    }
  }

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

  const nsName = siteNamespace(siteId);
  console.log(
    `Upserting ${allChunks.length} chunks from ${pages.length} pages into Pinecone namespace "${nsName}" (mode=${upsertMode}). ` +
      `In the Pinecone console → Browser, choose this namespace (not the default) to inspect vectors.`
  );

  let failedCount = 0;

  if (upsertMode === "records") {
    for (let i = 0; i < allChunks.length; i += UPSERT_RECORDS_BATCH) {
      const batch = allChunks.slice(i, i + UPSERT_RECORDS_BATCH);
      try {
        const integrated = batch.map((c) => ({
          id: c.id,
          [embedTextField]: c.document,
          siteId: String(siteId),
          url: c.url,
          title: c.title,
          chunkIndex: c.chunkIndex,
          totalChunks: c.totalChunks,
        }));
        await ns.upsertRecords(integrated);

        if (i % 200 === 0) {
          console.log(
            `  Progress: ${Math.min(i + UPSERT_RECORDS_BATCH, allChunks.length)} / ${allChunks.length}`
          );
        }
      } catch (err) {
        failedCount += batch.length;
        console.warn(
          `[vectorstore] Pinecone upsertRecords failed for batch starting at ${batch[0]?.id}:`,
          err
        );
      }
    }
  } else {
    for (let i = 0; i < allChunks.length; i += EMBED_BATCH_SIZE) {
      const batch = allChunks.slice(i, i + EMBED_BATCH_SIZE);
      const texts = batch.map((c) => c.document);

      try {
        const vectors = await embedTexts(texts, "passage");
        const records = batch.map((c, j) => ({
          id: c.id,
          values: vectors[j]!,
          metadata: {
            siteId: String(siteId),
            url: c.url,
            title: c.title,
            chunkIndex: c.chunkIndex,
            totalChunks: c.totalChunks,
            content: c.document,
          },
        }));

        for (let u = 0; u < records.length; u += UPSERT_BATCH_SIZE) {
          await ns.upsert(records.slice(u, u + UPSERT_BATCH_SIZE));
        }

        if (i % 200 === 0) {
          console.log(
            `  Progress: ${Math.min(i + EMBED_BATCH_SIZE, allChunks.length)} / ${allChunks.length}`
          );
        }
      } catch (err) {
        failedCount += batch.length;
        console.warn(
          `[vectorstore] Pinecone upsert/embed failed for batch starting at ${batch[0]?.id}:`,
          err
        );
        const msg = err instanceof Error ? err.message : String(err);
        if (
          /integrated|upsert records|field_map|embed/i.test(msg) ||
          /400|403/.test(msg)
        ) {
          console.warn(
            `[vectorstore] This index may require integrated upsert. Set PINECONE_UPSERT_MODE=auto (default) or records, or create a dense-only index for PINECONE_UPSERT_MODE=vectors.`
          );
        }
      }
    }
  }

  return {
    insertedCount: allChunks.length - failedCount,
    failedCount,
    pageCount: pages.length,
    totalChunks: allChunks.length,
  };
}

export type UpsertResult = ReturnType<typeof upsertSitePages> extends Promise<
  infer T
>
  ? T
  : never;

// ---------------------------------------------------------------------------
// Delete chunks for specific page URLs
// ---------------------------------------------------------------------------
export async function deletePagesFromSite(
  siteId: string,
  pageUrls: string[]
): Promise<number> {
  if (pageUrls.length === 0) return 0;
  const ns = nsIndex(siteId);
  let deletedCount = 0;

  try {
    await ns.deleteMany({ url: { $in: pageUrls } });
    deletedCount = pageUrls.length;
    console.log(
      `Deleted chunks for ${pageUrls.length} URL(s) from site "${siteId}" (Pinecone filter delete)`
    );
  } catch (err) {
    console.error(`Failed to delete chunks by URL filter for site ${siteId}:`, err);
    for (const url of pageUrls) {
      try {
        await ns.deleteMany({ url: { $eq: url } });
        deletedCount++;
        console.log(`Deleted chunks for: ${url}`);
      } catch (e) {
        console.error(`Failed to delete chunks for ${url}:`, e);
      }
    }
  }

  return deletedCount;
}

// ---------------------------------------------------------------------------
// Retrieved document shape
// ---------------------------------------------------------------------------
export interface RetrievedDoc {
  id: string;
  content: string;
  url: string;
  title: string;
  distance?: number;
}

// ---------------------------------------------------------------------------
// Delete entire site namespace
// ---------------------------------------------------------------------------
export async function deleteSiteCollection(siteId: string): Promise<boolean> {
  const name = siteNamespace(siteId);
  try {
    await index().deleteNamespace(name);
    console.log(`Deleted Pinecone namespace: ${name}`);
    return true;
  } catch (err) {
    console.error(`Failed to delete namespace ${name}:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------
function selectWithUrlSpread(
  pool: RetrievedDoc[],
  maxPerUrl: number,
  maxTotal: number
): RetrievedDoc[] {
  const sorted = [...pool].sort(
    (a, b) => (a.distance ?? 1) - (b.distance ?? 1)
  );
  const perUrl = new Map<string, number>();
  const picked: RetrievedDoc[] = [];

  for (const d of sorted) {
    const u = d.url || "_";
    const n = perUrl.get(u) ?? 0;
    if (n >= maxPerUrl) continue;
    perUrl.set(u, n + 1);
    picked.push(d);
    if (picked.length >= maxTotal) return picked;
  }
  return picked;
}

export async function querySiteDocs(params: {
  siteId: string;
  query: string | string[];
  topK?: number;
  exhaustiveSpread?: boolean;
}): Promise<RetrievedDoc[]> {
  await resolveUpsertConfig();
  const { siteId } = params;
  const exhaustive = params.exhaustiveSpread === true;
  const requestedTopK = params.topK ?? (exhaustive ? 18 : 6);
  const nResults = exhaustive ? Math.max(requestedTopK, 20) : requestedTopK;
  const queries = Array.isArray(params.query) ? params.query : [params.query];

  const ns = nsIndex(siteId);
  const seen = new Set<string>();
  const docs: RetrievedDoc[] = [];

  const queryVectors = await embedTexts(queries, "query");

  const queryResults = await Promise.all(
    queryVectors.map((vector) =>
      vector
        ? ns.query({ vector, topK: nResults, includeMetadata: true, includeValues: false })
        : Promise.resolve({ matches: [] })
    )
  );

  for (const result of queryResults) {
    for (const m of result.matches ?? []) {
      const id = m.id;
      if (seen.has(id)) continue;
      seen.add(id);

      const meta = m.metadata as Record<string, unknown> | undefined;
      const content = chunkTextFromMetadata(meta);
      docs.push({
        id,
        content,
        url: typeof meta?.url === "string" ? meta.url : "",
        title: typeof meta?.title === "string" ? meta.title : "",
        distance: scoreToDistance(m.score),
      });
    }
  }

  docs.sort((a, b) => (a.distance ?? 1) - (b.distance ?? 1));
  const rawPoolLimit = exhaustive ? 320 : 150;
  const pool = docs.slice(0, rawPoolLimit);
  const maxPerUrl = exhaustive ? 5 : 6;
  const maxTotal = exhaustive ? 96 : 52;
  return selectWithUrlSpread(pool, maxPerUrl, maxTotal);
}

const URL_LIST_BATCH = 8;
const LIST_PAGE_SIZE = 100;

/**
 * Load chunks for specific page URLs (metadata `url` match). Uses id-prefix list + fetch
 * (deterministic chunk IDs per URL).
 */
export async function getDocsForUrls(
  siteId: string,
  urls: string[],
  options?: { maxTotal?: number; maxPerUrl?: number; supplementaryDistance?: number }
): Promise<RetrievedDoc[]> {
  const maxTotal = options?.maxTotal ?? 72;
  const maxPerUrl = options?.maxPerUrl ?? 5;
  const suppD = options?.supplementaryDistance ?? 0.72;
  if (urls.length === 0) return [];

  await resolveUpsertConfig();
  const ns = nsIndex(siteId);
  const byUrlCount = new Map<string, number>();
  const out: RetrievedDoc[] = [];

  const ingestRecords = (recs: Record<string, { metadata?: Record<string, unknown> }>) => {
    for (const id of Object.keys(recs)) {
      const row = recs[id];
      const meta = row?.metadata;
      const url = typeof meta?.url === "string" ? meta.url : "";
      const c = byUrlCount.get(url) ?? 0;
      if (c >= maxPerUrl) continue;
      byUrlCount.set(url, c + 1);
      out.push({
        id,
        content: chunkTextFromMetadata(meta),
        url,
        title: typeof meta?.title === "string" ? meta.title : "",
        distance: suppD,
      });
      if (out.length >= maxTotal) return true;
    }
    return false;
  };

  for (let i = 0; i < urls.length && out.length < maxTotal; i += URL_LIST_BATCH) {
    const batch = urls.slice(i, i + URL_LIST_BATCH);
    for (const url of batch) {
      if (out.length >= maxTotal) break;
      const prefix = `${urlHash(url)}_`;
      const ids: string[] = [];
      let paginationToken: string | undefined;

      do {
        try {
          const listed = await ns.listPaginated({
            prefix,
            limit: LIST_PAGE_SIZE,
            paginationToken,
          });
          for (const v of listed.vectors ?? []) {
            if (v?.id) ids.push(v.id);
          }
          paginationToken = listed.pagination?.next;
          if (ids.length >= maxPerUrl * 4) break;
        } catch (err) {
          console.warn("[vectorstore] listPaginated failed for URL:", url, err);
          break;
        }
      } while (paginationToken);

      if (ids.length === 0) continue;

      const uniqueIds = [...new Set(ids)].slice(0, maxPerUrl * 4);
      const FETCH_BATCH = 200;
      for (let f = 0; f < uniqueIds.length && out.length < maxTotal; f += FETCH_BATCH) {
        const slice = uniqueIds.slice(f, f + FETCH_BATCH);
        try {
          const fetched = await ns.fetch(slice);
          if (ingestRecords(fetched.records as Record<string, { metadata?: Record<string, unknown> }>)) {
            break;
          }
        } catch (err) {
          console.warn("[vectorstore] fetch failed for URL:", url, err);
        }
      }
    }
  }

  return out;
}
