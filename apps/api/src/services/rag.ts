/**
 * NavBot RAG pipeline.
 *
 * Flow:
 *   1. curated answer (site owner's own words) or semantic cache — return immediately
 *   2. plan the query and retrieve a baseline in parallel, so planner latency is hidden
 *   3. retrieve -> strip boilerplate -> rerank
 *   4. generate against a small, high-signal context
 *   5. degrade gracefully rather than ever returning a bare error
 */
import { hasSocialIntent, searchSocialMedia, buildSocialContextString, type SocialSearchResult } from "./social-search";
import { getFaqUserAnswerForQuestion, getRagCache, setRagCache } from "./db";
import { runRetrieval } from "./agentic-retrieval";
import { planQuery, fallbackPlan, type QueryPlan } from "./query-planner";
import { buildSystemPrompt, formatAnswer, buildContactFallback } from "./answer-format";
import { getSiteProfile, applyGlossary } from "./site-profile";
import type { RerankedDoc } from "./reranker";
import type { ChatHistoryItem, PageLink, SocialLink, ChatAnswer } from "./chat-types";
import {
  withRetry,
  getGeminiApiKey,
  getGoogleGenAI,
  GEMINI_MODELS,
  generateContentText,
  generateContentStream,
} from "./gemini-client";

if (!getGeminiApiKey()) {
  console.warn("GEMINI_API_KEY is not set. Chat, STT, and TTS will not work.");
}

/**
 * Context handed to the model. The old budget was 128,000 characters, which was the
 * dominant cost in time-to-first-token and mostly filled with boilerplate. After
 * dedup and reranking, ~18k of high-signal content answers more questions, faster.
 */
const CONTEXT_BUDGET_CHARS = 18_000;
const MAX_CHARS_PER_CHUNK = 1_800;
const ANSWER_MAX_TOKENS = 1_100;

/**
 * Benchmarks must exercise the real pipeline, not replay answers a previous run
 * cached. Set NAVBOT_DISABLE_CACHE=1 when measuring.
 */
const CACHE_DISABLED = process.env.NAVBOT_DISABLE_CACHE === "1";

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------
function titleFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    const last = path.split("/").filter(Boolean).pop();
    if (!last) return url;
    return last.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return url;
  }
}

/**
 * Many Plaksha pages carry the site-wide title ("Welcome To Plaksha"), which tells
 * the model nothing about which page it is reading. Fall back to the URL slug.
 */
function resolveTitle(title: string, url: string, siteId: string): string {
  if (!title) return titleFromUrl(url);
  const norm = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const site = siteId.replace(/\./g, " ").toLowerCase();
  const generic =
    norm.length < 4 ||
    norm === "home" ||
    norm === "homepage" ||
    norm.startsWith("welcome") ||
    norm === site ||
    norm === `welcome to ${site}` ||
    norm.includes("reimagining tech education");
  return generic ? titleFromUrl(url) : title;
}

function buildContext(docs: RerankedDoc[], siteId: string): string {
  const byUrl = new Map<string, { title: string; url: string; chunks: string[] }>();
  for (const d of docs) {
    const key = d.url || d.id;
    const entry = byUrl.get(key) ?? {
      title: resolveTitle(d.title, d.url, siteId),
      url: d.url,
      chunks: [],
    };
    entry.chunks.push(d.content.slice(0, MAX_CHARS_PER_CHUNK).trim());
    byUrl.set(key, entry);
  }

  const blocks: string[] = [];
  let total = 0;
  for (const { title, url, chunks } of byUrl.values()) {
    const block = `## ${title}\n${url}\n\n${chunks.join("\n\n")}`;
    if (total + block.length > CONTEXT_BUDGET_CHARS && blocks.length > 0) break;
    blocks.push(block);
    total += block.length;
  }

  return blocks.join("\n\n---\n\n");
}

function dedupeSources(docs: RerankedDoc[], siteId: string) {
  const seen = new Map<string, { url: string; title: string; distance?: number }>();
  for (const d of docs) {
    if (d.url && !seen.has(d.url)) {
      seen.set(d.url, {
        url: d.url,
        title: resolveTitle(d.title, d.url, siteId),
        distance: d.distance,
      });
    }
  }
  return [...seen.values()];
}

function buildContents(params: {
  context: string;
  socialContext: string;
  history: ChatHistoryItem[];
  message: string;
}) {
  const { context, socialContext, history, message } = params;

  let contextMessage = `Page content from the website:\n\n${context}`;
  if (socialContext) {
    contextMessage += `\n\n---\n\nRecent social media posts:\n\n${socialContext}`;
  }

  const recent = history.slice(-6);
  while (recent.length > 0 && recent[0]!.role !== "user") recent.shift();

  return [
    { role: "user" as const, parts: [{ text: contextMessage }] },
    { role: "model" as const, parts: [{ text: "Understood — I'll answer from these pages." }] },
    ...recent.map((h) => ({
      role: h.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: h.content }],
    })),
    { role: "user" as const, parts: [{ text: message }] },
  ];
}

// ---------------------------------------------------------------------------
// Canned replies that need no retrieval
// ---------------------------------------------------------------------------
function greetingAnswer(siteId: string): ChatAnswer {
  const name = getSiteProfile(siteId).displayName || siteId;
  return {
    answer: `Hello! I'm NavBot, the assistant for the ${name} website. I can help with admissions and deadlines, fees and financial aid, our BTech and graduate programs, faculty, research centers, campus life, and career outcomes. What would you like to know?`,
    sources: [],
    pageLinks: [],
    socialLinks: [],
    followUps: [
      "What BTech programs does Plaksha offer?",
      "What are the admission deadlines?",
      "What financial aid is available?",
    ],
    path: "greeting",
  };
}

function outOfScopeAnswer(siteId: string): ChatAnswer {
  const name = getSiteProfile(siteId).displayName || siteId;
  return {
    answer: `I only cover ${name} — admissions, programs, fees and financial aid, faculty, research, campus life and career outcomes. Ask me anything in those areas and I'll help.`,
    sources: [],
    pageLinks: [],
    socialLinks: [],
    followUps: [
      "What makes the Plaksha curriculum different?",
      "What are the BTech admission rounds?",
      "Where do Plaksha graduates work?",
    ],
    path: "out_of_scope",
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export async function answerQuestionWithRag(params: {
  siteId: string;
  message: string;
  history: ChatHistoryItem[];
}): Promise<ChatAnswer> {
  const { siteId, message, history } = params;

  // 1. Curated answer written by the site owner always wins.
  const curated = CACHE_DISABLED
    ? null
    : await getFaqUserAnswerForQuestion(siteId, message).catch(() => null);
  if (curated && !curated.stale) {
    return {
      answer: applyGlossary(curated.answer.trim(), siteId),
      sources: [],
      pageLinks: [],
      socialLinks: [],
      followUps: [],
      path: "faq",
    };
  }

  const isFirstTurn = history.length === 0;
  if (isFirstTurn && !CACHE_DISABLED) {
    const cached = await getRagCache(siteId, message).catch(() => null);
    if (cached) {
      return {
        answer: cached.answer,
        sources: cached.sources,
        pageLinks: cached.pageLinks as PageLink[],
        socialLinks: [],
        followUps: [],
        path: "cache",
      };
    }
  }

  // 2. Plan and pre-fetch concurrently — the planner's round trip overlaps retrieval.
  const socialPromise = hasSocialIntent(message)
    ? searchSocialMedia(siteId, message).catch(() => [] as SocialSearchResult[])
    : Promise.resolve([] as SocialSearchResult[]);

  let plan: QueryPlan;
  try {
    plan = await planQuery({ siteId, message, history });
  } catch {
    plan = fallbackPlan(message, history);
  }

  if (plan.intent === "greeting") return greetingAnswer(siteId);
  if (plan.intent === "out_of_scope") return outOfScopeAnswer(siteId);

  // 3. Retrieve.
  const retrieval = await runRetrieval({ siteId, plan });
  const socialResults = await socialPromise;

  // Only bail out when there is genuinely nothing to read. A low rerank score on
  // real pages means the phrasing is unusual, not that the answer is missing, so the
  // model gets to see the pages and decide.
  if (retrieval.docs.length === 0 && socialResults.length === 0) {
    console.warn(`[rag] retrieved nothing for "${plan.standalone.slice(0, 70)}"`);
    const fb = buildContactFallback({ siteId, question: plan.standalone, docs: [] });
    return { ...fb, sources: [], socialLinks: [], path: "contact_fallback" };
  }

  // 4. Generate.
  const context = buildContext(retrieval.docs, siteId);
  const socialContext = buildSocialContextString(socialResults);
  const systemPrompt = buildSystemPrompt({
    siteId,
    confidence: retrieval.meta.confidence === "strong" ? "strong" : "weak",
    exhaustive: plan.exhaustive,
  });
  const contents = buildContents({ context, socialContext, history, message });

  let raw = "";
  let path: ChatAnswer["path"] = "answered";
  try {
    raw = await generateContentText({
      model: GEMINI_MODELS.chat,
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
        maxOutputTokens: ANSWER_MAX_TOKENS,
        thinkingLevel: "low",
      },
    });
  } catch (err) {
    // Rung 2: one retry on a reduced context, which also dodges token-limit failures.
    console.warn("[rag] generation failed, retrying with reduced context:", err instanceof Error ? err.message.slice(0, 160) : err);
    path = "retry";
    try {
      const smaller = buildContext(retrieval.docs.slice(0, 5), siteId);
      raw = await generateContentText({
        model: GEMINI_MODELS.chat,
        contents: buildContents({ context: smaller, socialContext: "", history: [], message }),
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2,
          maxOutputTokens: ANSWER_MAX_TOKENS,
          thinkingLevel: "low",
        },
      });
    } catch (err2) {
      console.error("[rag] generation failed twice:", err2 instanceof Error ? err2.message.slice(0, 160) : err2);
      raw = "";
    }
  }

  // Rungs 3 and 4: partial answer with pages, else the contact block.
  if (!raw.trim()) {
    const fb = buildContactFallback({
      siteId,
      question: plan.standalone,
      docs: retrieval.docs,
      reason: "generation_failed",
    });
    return { ...fb, sources: dedupeSources(retrieval.docs, siteId), socialLinks: [], path: "contact_fallback" };
  }

  const formatted = formatAnswer({ raw, siteId, docs: retrieval.docs });
  const sources = dedupeSources(retrieval.docs, siteId);

  const socialLinks: SocialLink[] = socialResults.slice(0, 3).map((r) => ({
    platform: r.platform,
    title: r.title,
    url: r.url,
  }));
  for (const sr of socialResults) {
    if (!sources.some((s) => s.url === sr.url)) {
      sources.push({ url: sr.url, title: `${sr.platform}: ${sr.title}` });
    }
  }

  const result: ChatAnswer = {
    answer: formatted.answer,
    sources,
    pageLinks: formatted.pageLinks,
    socialLinks,
    followUps: formatted.followUps,
    path,
  };

  // Only cache confident, first-turn answers that actually said something.
  const declined = /I don'?t have that specific detail|I only cover/i.test(result.answer);
  if (isFirstTurn && !CACHE_DISABLED && retrieval.meta.confidence === "strong" && !declined) {
    setRagCache(siteId, message, {
      answer: result.answer,
      sources: sources.map((s) => ({ url: s.url, title: s.title })),
      pageLinks: result.pageLinks,
    }).catch(() => {});
  }

  return result;
}

// ---------------------------------------------------------------------------
// Streaming variant — same pipeline, text delivered as it is generated
// ---------------------------------------------------------------------------
export type StreamEvent =
  | { type: "status"; stage: "planning" | "searching" | "reading" | "writing"; detail?: string }
  | { type: "delta"; text: string }
  | { type: "done"; answer: ChatAnswer };

export async function* answerQuestionStreaming(params: {
  siteId: string;
  message: string;
  history: ChatHistoryItem[];
}): AsyncGenerator<StreamEvent, void, unknown> {
  const { siteId, message, history } = params;

  const curated = await getFaqUserAnswerForQuestion(siteId, message).catch(() => null);
  if (curated && !curated.stale) {
    const answer = applyGlossary(curated.answer.trim(), siteId);
    yield { type: "delta", text: answer };
    yield {
      type: "done",
      answer: { answer, sources: [], pageLinks: [], socialLinks: [], followUps: [], path: "faq" },
    };
    return;
  }

  yield { type: "status", stage: "planning" };

  let plan: QueryPlan;
  try {
    plan = await planQuery({ siteId, message, history });
  } catch {
    plan = fallbackPlan(message, history);
  }

  if (plan.intent === "greeting" || plan.intent === "out_of_scope") {
    const canned = plan.intent === "greeting" ? greetingAnswer(siteId) : outOfScopeAnswer(siteId);
    yield { type: "delta", text: canned.answer };
    yield { type: "done", answer: canned };
    return;
  }

  yield { type: "status", stage: "searching" };
  const retrieval = await runRetrieval({ siteId, plan });

  if (retrieval.docs.length === 0) {
    const fb = buildContactFallback({ siteId, question: plan.standalone, docs: [] });
    yield { type: "delta", text: fb.answer };
    yield {
      type: "done",
      answer: { ...fb, sources: [], socialLinks: [], path: "contact_fallback" },
    };
    return;
  }

  const pageCount = new Set(retrieval.docs.map((d) => d.url)).size;
  yield { type: "status", stage: "reading", detail: `${pageCount} page${pageCount === 1 ? "" : "s"}` };

  const context = buildContext(retrieval.docs, siteId);
  const systemPrompt = buildSystemPrompt({
    siteId,
    confidence: retrieval.meta.confidence === "strong" ? "strong" : "weak",
    exhaustive: plan.exhaustive,
  });

  yield { type: "status", stage: "writing" };

  // Buffer so the [RELEVANT_PAGES] / [FOLLOW_UPS] blocks are never shown to the user.
  let raw = "";
  let flushed = 0;
  const MARKER_LOOKAHEAD = 24;

  for await (const delta of generateContentStream({
    model: GEMINI_MODELS.chat,
    contents: buildContents({ context, socialContext: "", history, message }),
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.2,
      maxOutputTokens: ANSWER_MAX_TOKENS,
      thinkingLevel: "low",
    },
  })) {
    raw += delta;
    const markerAt = raw.indexOf("[RELEVANT_PAGES]");
    const safeUpTo = markerAt >= 0 ? markerAt : Math.max(0, raw.length - MARKER_LOOKAHEAD);
    if (safeUpTo > flushed) {
      yield { type: "delta", text: raw.slice(flushed, safeUpTo) };
      flushed = safeUpTo;
    }
    if (markerAt >= 0) break;
  }

  if (!raw.trim()) {
    const fb = buildContactFallback({
      siteId,
      question: plan.standalone,
      docs: retrieval.docs,
      reason: "generation_failed",
    });
    yield { type: "delta", text: fb.answer };
    yield {
      type: "done",
      answer: { ...fb, sources: dedupeSources(retrieval.docs, siteId), socialLinks: [], path: "contact_fallback" },
    };
    return;
  }

  const formatted = formatAnswer({ raw, siteId, docs: retrieval.docs });

  // Emit whatever the cleanup pass changed or the tail we held back.
  if (formatted.answer.length > flushed) {
    yield { type: "delta", text: formatted.answer.slice(flushed) };
  }

  yield {
    type: "done",
    answer: {
      answer: formatted.answer,
      sources: dedupeSources(retrieval.docs, siteId),
      pageLinks: formatted.pageLinks,
      socialLinks: [],
      followUps: formatted.followUps,
      path: "answered",
    },
  };
}

// ---------------------------------------------------------------------------
// Speech-to-text
// ---------------------------------------------------------------------------
async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const ai = getGoogleGenAI();
  const audioBase64 = audioBuffer.toString("base64");

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODELS.stt,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: audioBase64 } },
              { text: "Transcribe this audio exactly. Return only the transcript text, no explanations." },
            ],
          },
        ],
        config: { temperature: 0.0, maxOutputTokens: 1024 },
      }),
    { maxAttempts: 3, baseDelayMs: 800, label: "STT" }
  );

  const transcript = (response.text ?? "").trim();
  if (!transcript) throw new Error("Gemini STT returned an empty transcript.");
  return transcript;
}

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
    return {
      transcript: null,
      answer:
        "I couldn't make out that voice message. Please try again, or type your question instead.",
      sources: [],
      pageLinks: [] as PageLink[],
      socialLinks: [] as SocialLink[],
      followUps: [] as string[],
      error: msg,
    };
  }

  const result = await answerQuestionWithRag({ siteId, message: transcript, history });
  return { transcript, ...result };
}

// ---------------------------------------------------------------------------
// Text-to-speech
// ---------------------------------------------------------------------------
const MAX_TTS_CHARS = 1000;
const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE?.trim() || "Kore";

export async function synthesizeSpeech(text: string): Promise<string> {
  const ai = getGoogleGenAI();
  const truncated = text.length > MAX_TTS_CHARS ? text.slice(0, MAX_TTS_CHARS) + "…" : text;

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODELS.tts,
        contents: [{ role: "user", parts: [{ text: `Read this text aloud:\n\n${truncated}` }] }],
        config: {
          responseModalities: ["audio"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE } },
          },
        },
      }),
    { maxAttempts: 3, baseDelayMs: 1000, label: "TTS" }
  );

  const parts = (response.candidates ?? [])[0]?.content?.parts ?? [];
  const audioPart = parts.find((p) => "inlineData" in p && p.inlineData != null);
  const inlineData = (audioPart as { inlineData?: { data?: string } } | undefined)?.inlineData;
  if (!inlineData?.data) throw new Error("Gemini TTS returned no audio data.");
  return inlineData.data;
}
