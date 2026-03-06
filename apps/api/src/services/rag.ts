import Groq from "groq-sdk";
import { querySiteDocs, type RetrievedDoc } from "./vectorstore";

// ---------------------------------------------------------------------------
// Groq client
// ---------------------------------------------------------------------------
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

if (!process.env.GROQ_API_KEY) {
  console.warn(
    "GROQ_API_KEY is not set. Chat endpoints will not work correctly."
  );
}

/**
 * Model selection:
 * - "openai/gpt-oss-120b"  — highest quality (your current model)
 * - "llama-3.3-70b-versatile" — good fallback if quota hit
 */
const CHAT_MODEL =
  process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b";

// ---------------------------------------------------------------------------
// Domain-specific query expansion rules.
// When the user's question matches a pattern, we add a second targeted query
// to improve recall for that topic in ChromaDB.
// ---------------------------------------------------------------------------
interface ExpansionRule {
  pattern: RegExp;
  expansion: (original: string) => string;
}

const QUERY_EXPANSION_RULES: ExpansionRule[] = [
  {
    // Deadline / date / admission round queries
    pattern: /\b(deadline|date|when|admission|apply|round|open|close|submit)\b/i,
    expansion: (q) =>
      `admission rounds application deadline dates schedule ${q}`,
  },
  {
    // Fee / scholarship / financial aid queries
    pattern: /\b(fee|cost|tuition|scholarship|financial|aid|funding|stipend)\b/i,
    expansion: (q) => `tuition fee scholarship financial aid funding ${q}`,
  },
  {
    // Eligibility / requirements queries
    pattern: /\b(eligib|requir|criteria|qualify|gpa|gmat|gre|score|minimum)\b/i,
    expansion: (q) => `eligibility criteria requirements qualifications ${q}`,
  },
  {
    // Program / curriculum queries
    pattern: /\b(program|course|curriculum|syllabus|module|credit|semester)\b/i,
    expansion: (q) => `program curriculum courses modules structure ${q}`,
  },
  {
    // Contact / location queries
    pattern: /\b(contact|email|phone|address|location|campus|office)\b/i,
    expansion: (q) => `contact information address email phone campus ${q}`,
  },
];

/**
 * Build a list of query strings for retrieval.
 * Always includes the original query + any domain expansions that match.
 * Deduplicates identical queries.
 */
function buildRetrievalQueries(message: string): string[] {
  const queries = new Set<string>([message]);

  for (const rule of QUERY_EXPANSION_RULES) {
    if (rule.pattern.test(message)) {
      queries.add(rule.expansion(message));
    }
  }

  return Array.from(queries);
}

// ---------------------------------------------------------------------------
// Format retrieved docs into a context block for the LLM.
// Each block includes its source number, title, URL and content.
// The enriched document already contains the page title (from vectorstore),
// so we just pass it straight through.
// ---------------------------------------------------------------------------
function buildContextString(docs: RetrievedDoc[]): string {
  return docs
    .map(
      (d, idx) =>
        `[Source ${idx + 1}]\nTitle: ${d.title}\nURL: ${d.url}\n\n${d.content
          .slice(0, 1200) // cap per source to stay under token budget
          .trim()}`
    )
    .join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Deduplicate sources for the response (multiple chunks → one URL)
// ---------------------------------------------------------------------------
function deduplicateSources(
  docs: RetrievedDoc[]
): Array<{ url: string; title: string; distance?: number }> {
  const seen = new Map<string, { url: string; title: string; distance?: number }>();
  for (const d of docs) {
    if (!seen.has(d.url)) {
      seen.set(d.url, { url: d.url, title: d.title, distance: d.distance });
    }
  }
  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// Simple retry wrapper for Groq calls (handles transient 500s)
// ---------------------------------------------------------------------------
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 800
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        msg.includes("500") ||
        msg.includes("503") ||
        msg.includes("rate_limit") ||
        msg.includes("timeout");

      if (!isRetryable || attempt === maxAttempts) throw err;

      console.warn(
        `Groq request failed (attempt ${attempt}/${maxAttempts}): ${msg}. Retrying in ${delayMs}ms...`
      );
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Chat history type
// ---------------------------------------------------------------------------
export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Main RAG function
// ---------------------------------------------------------------------------
export async function answerQuestionWithRag(params: {
  siteId: string;
  message: string;
  history: ChatHistoryItem[];
}) {
  const { siteId, message, history } = params;

  // 1. Build multi-query retrieval set
  const retrievalQueries = buildRetrievalQueries(message);
  console.log(
    `RAG query for site "${siteId}":`,
    retrievalQueries.length > 1
      ? `${retrievalQueries.length} queries (expanded)`
      : "1 query"
  );

  // 2. Retrieve relevant chunks (vectorstore handles multi-query + dedup)
  const docs = await querySiteDocs({
    siteId,
    query: retrievalQueries,
    topK: 8, // top 8 per query; vectorstore dedupes and re-ranks
  });

  if (docs.length === 0) {
    return {
      answer:
        "I couldn't find relevant information to answer that question. " +
        "Please try rephrasing, or contact the site owner directly.",
      sources: [],
    };
  }

  // 3. Build context block
  const contextString = buildContextString(docs);

  // 4. System prompt — concise and instruction-focused
  const systemPrompt = `
You are NavBot, a helpful assistant that answers questions ONLY using content retrieved from the website with siteId: "${siteId}".

RULES:
1. Answer ONLY from the provided context. Do NOT use prior knowledge.
2. If dates, deadlines, rounds, or schedules appear in the context, state them clearly and precisely.
3. If the context contains a table, extract the relevant row/column and present it cleanly.
4. If the answer is not in the context, say "I don't have that information" and suggest contacting the site owner.
5. Always cite the source page title or URL when giving specific facts (deadlines, fees, names, etc.).
6. Be concise. Do not repeat the question back. Do not pad your answer.
7. If the user's question is conversational or a greeting, respond naturally without citing sources.
`.trim();

  const contextSystemMessage = `WEBSITE CONTEXT (your only knowledge source):\n\n${contextString}`;

  // 5. Build message array — keep last 6 history turns to manage token budget
  const recentHistory = history.slice(-6);

  const chatMessages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "system", content: contextSystemMessage },
    ...recentHistory.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: message },
  ];

  // 6. Call Groq with retry
  const completion = await withRetry(() =>
    groq.chat.completions.create({
      model: CHAT_MODEL,
      messages: chatMessages,
      temperature: 0.2, // lower = more factual / less hallucination
      max_tokens: 600,
    })
  );

  const answer = completion.choices[0]?.message?.content ?? "";

  return {
    answer,
    sources: deduplicateSources(docs),
  };
}

// ---------------------------------------------------------------------------
// Voice input stub — plug in real STT (Whisper, Deepgram, etc.) here
// ---------------------------------------------------------------------------
export async function transcribeAndAnswer(params: {
  siteId: string;
  audioBuffer: Buffer;
  mimeType: string;
  history?: ChatHistoryItem[];
}) {
  const { siteId, audioBuffer, mimeType, history = [] } = params;

  let transcript: string;

  // --- Swap this block for a real STT provider ---
  // Example with Groq Whisper:
  //
  // const audioFile = new File([audioBuffer], "audio.webm", { type: mimeType });
  // const transcription = await groq.audio.transcriptions.create({
  //   file: audioFile,
  //   model: "whisper-large-v3",
  // });
  // transcript = transcription.text;
  //
  // Or with OpenAI Whisper:
  // const transcription = await openai.audio.transcriptions.create({
  //   file: new File([audioBuffer], "audio.webm", { type: mimeType }),
  //   model: "whisper-1",
  // });
  // transcript = transcription.text;
  // ------------------------------------------------

  transcript =
    "Voice message received, but transcription is not yet configured. Please type your question.";

  const result = await answerQuestionWithRag({
    siteId,
    message: transcript,
    history,
  });

  return {
    transcript,
    ...result,
  };
}