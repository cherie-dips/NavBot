import { SarvamAIClient } from "sarvamai";
import { querySiteDocs, type RetrievedDoc } from "./vectorstore";

// ---------------------------------------------------------------------------
// Sarvam AI client
// ---------------------------------------------------------------------------
const sarvam = new SarvamAIClient({
  apiSubscriptionKey: process.env.SARVAM_API_KEY ?? "",
});

if (!process.env.SARVAM_API_KEY) {
  console.warn(
    "SARVAM_API_KEY is not set. Chat endpoints will not work correctly."
  );
}

const CHAT_MODEL = (process.env.SARVAM_CHAT_MODEL || "sarvam-m") as any;

// ---------------------------------------------------------------------------
// Domain-specific query expansion rules.
// ---------------------------------------------------------------------------
interface ExpansionRule {
  pattern: RegExp;
  expansion: (original: string) => string;
}

const QUERY_EXPANSION_RULES: ExpansionRule[] = [
  {
    pattern: /\b(deadline|date|when|admission|apply|round|open|close|submit)\b/i,
    expansion: (q) =>
      `admission rounds application deadline dates schedule ${q}`,
  },
  {
    pattern: /\b(fee|cost|tuition|scholarship|financial|aid|funding|stipend)\b/i,
    expansion: (q) => `tuition fee scholarship financial aid funding ${q}`,
  },
  {
    pattern: /\b(eligib|requir|criteria|qualify|gpa|gmat|gre|score|minimum)\b/i,
    expansion: (q) => `eligibility criteria requirements qualifications ${q}`,
  },
  {
    pattern: /\b(program|course|curriculum|syllabus|module|credit|semester)\b/i,
    expansion: (q) => `program curriculum courses modules structure ${q}`,
  },
  {
    pattern: /\b(contact|email|phone|address|location|campus|office)\b/i,
    expansion: (q) => `contact information address email phone campus ${q}`,
  },
];

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
// ---------------------------------------------------------------------------
function buildContextString(docs: RetrievedDoc[]): string {
  return docs
    .map(
      (d, idx) =>
        `[Source ${idx + 1}]\nTitle: ${d.title}\nURL: ${d.url}\n\n${d.content
          .slice(0, 1200)
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
// Simple retry wrapper for Sarvam calls (handles transient errors)
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
        `Sarvam request failed (attempt ${attempt}/${maxAttempts}): ${msg}. Retrying in ${delayMs}ms...`
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
// Enforce strict user/assistant alternation required by Sarvam AI.
// Drops consecutive same-role messages and ensures the first non-system
// message is always "user" and the last message is always "user".
// ---------------------------------------------------------------------------
type SarvamMessage = { role: "system" | "user" | "assistant"; content: string };

function enforceAlternation(msgs: SarvamMessage[]): SarvamMessage[] {
  // 1. Collect system messages and non-system messages separately
  const system = msgs.filter((m) => m.role === "system");
  const conversation = msgs.filter((m) => m.role !== "system");

  // 2. Drop leading assistant messages — first non-system msg must be "user"
  while (conversation.length > 0 && conversation[0]!.role === "assistant") {
    conversation.shift();
  }

  // 3. Drop consecutive same-role messages (keep the first of each run)
  const deduped: SarvamMessage[] = [];
  for (const msg of conversation) {
    if (deduped.length > 0 && deduped[deduped.length - 1]!.role === msg.role) {
      continue;
    }
    deduped.push(msg);
  }

  // 4. Ensure the last message is from the user (the current question)
  while (deduped.length > 0 && deduped[deduped.length - 1]!.role === "assistant") {
    deduped.pop();
  }

  return [...system, ...deduped];
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

  // 2. Retrieve relevant chunks
  const docs = await querySiteDocs({
    siteId,
    query: retrievalQueries,
    topK: 8,
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

  // 4. System prompt
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

  const combinedSystemPrompt = `${systemPrompt}\n\nWEBSITE CONTEXT (your only knowledge source):\n\n${contextString}`;

  // 5. Build message array — keep last 6 history turns to manage token budget
  const rawMessages: SarvamMessage[] = [
    { role: "system", content: combinedSystemPrompt },
    ...history.slice(-6).map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: message },
  ];

  const chatMessages = enforceAlternation(rawMessages);

  // 6. Call Sarvam AI with retry
  const completion = await withRetry(() =>
    sarvam.chat.completions({
      model: CHAT_MODEL,
      messages: chatMessages,
      temperature: 0.2,
      max_tokens: 600,
    })
  );

  const rawAnswer: string = (completion as any).choices?.[0]?.message?.content ?? "";
  const answer = rawAnswer
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .trim();

  return {
    answer,
    sources: deduplicateSources(docs),
  };
}

// ---------------------------------------------------------------------------
// Sarvam saaras:v3 Speech-to-Text transcription
// ---------------------------------------------------------------------------
async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string
): Promise<string> {
  // Determine a sensible filename extension from the MIME type
  const ext = mimeType.includes("ogg")
    ? "ogg"
    : mimeType.includes("mp4") || mimeType.includes("mp4a")
    ? "mp4"
    : mimeType.includes("mpeg") || mimeType.includes("mp3")
    ? "mp3"
    : mimeType.includes("wav")
    ? "wav"
    : "webm"; // default — browsers use webm for MediaRecorder

  const filename = `audio.${ext}`;

  // Build a proper File object from the buffer
  const audioFile = new File([new Uint8Array(audioBuffer)], filename, { type: mimeType });

  console.log(
    `[STT] Sending ${(audioBuffer.length / 1024).toFixed(1)} KB of ${mimeType} to Sarvam saaras:v3`
  );

  const response = await withRetry(() =>
    sarvam.speechToText.transcribe({
      file: audioFile,
      model: "saaras:v3" as any,
      mode: "transcribe" as any,
    })
  );

  // The SDK returns { transcript, language_code, request_id }
  const transcript = (response as any).transcript as string | undefined;

  if (!transcript || transcript.trim() === "") {
    throw new Error("Sarvam STT returned an empty transcript.");
  }

  console.log(
    `[STT] Transcript (lang: ${(response as any).language_code ?? "unknown"}): "${transcript}"`
  );

  return transcript.trim();
}

// ---------------------------------------------------------------------------
// Voice input: transcribe with Sarvam saaras:v3, then run RAG pipeline
// ---------------------------------------------------------------------------
export async function transcribeAndAnswer(params: {
  siteId: string;
  audioBuffer: Buffer;
  mimeType: string;
  history?: ChatHistoryItem[];
}) {
  const { siteId, audioBuffer, mimeType, history = [] } = params;

  let transcript: string;

  try {
    transcript = await transcribeAudio(audioBuffer, mimeType);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[STT] Transcription failed:", msg);

    // Surface a friendly error to the client rather than a server 500
    return {
      transcript: null,
      answer:
        "Sorry, I couldn't transcribe your voice message. " +
        "Please check that your SARVAM_API_KEY is set and the audio format is supported (WebM, MP3, WAV, OGG). " +
        "You can also type your question instead.",
      sources: [],
      error: msg,
    };
  }

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

// ---------------------------------------------------------------------------
// Text-to-Speech using Sarvam bulbul:v3
// Returns a base64-encoded WAV string.
// ---------------------------------------------------------------------------
const TTS_MODEL = "bulbul:v3" as any;
const MAX_TTS_CHARS = 1000;

export async function synthesizeSpeech(text: string): Promise<string> {
  const truncated = text.length > MAX_TTS_CHARS ? text.slice(0, MAX_TTS_CHARS) + "…" : text;

  console.log(`[TTS] Converting ${truncated.length} chars to speech`);

  const response = await withRetry(() =>
    sarvam.textToSpeech.convert({
      text: truncated,
      target_language_code: "en-IN",
      model: TTS_MODEL,
    })
  );

  const base64Audio = (response as any).audios?.[0] ?? (response as any).audio ?? "";

  if (!base64Audio) {
    throw new Error("Sarvam TTS returned empty audio.");
  }

  console.log(`[TTS] Audio generated (${(base64Audio.length / 1024).toFixed(1)} KB base64)`);
  return base64Audio;
}