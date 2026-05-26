
import { type RetrievedDoc } from "./vectorstore";
import { hasSocialIntent, searchSocialMedia, buildSocialContextString, type SocialSearchResult } from "./social-search";
import { getFaqUserAnswerForQuestion } from "./db";
import { runAgenticRetrieval } from "./agentic-retrieval";
import { isExhaustiveListQuestion, sortDocsForExhaustiveAnswer } from "./multipage-retrieval";
import type { ChatHistoryItem, PageLink, SocialLink } from "./chat-types";
import {
  withRetry,
  getSarvamApiKey,
  getSarvamClient,
  SARVAM_MODELS,
  SARVAM_TTS_SPEAKER,
  SARVAM_TTS_LANG,
  generateContentText,
} from "./gemini-client";

export type { ChatHistoryItem } from "./chat-types";

if (!getSarvamApiKey()) {
  console.warn(
    "SARVAM_API_KEY is not set. STT and TTS will not work."
  );
}

// ---------------------------------------------------------------------------
// Query expansion (3 focused rules — planner handles the rest)
// ---------------------------------------------------------------------------
interface ExpansionRule {
  pattern: RegExp;
  expansion: (original: string) => string;
}

const QUERY_EXPANSION_RULES: ExpansionRule[] = [
  {
    pattern: /\b(deadline|date|when|admission|apply|round|open|close|submit)\b/i,
    expansion: (q) => `admission deadline dates application rounds ${q}`,
  },
  {
    pattern: /\b(fee|cost|tuition|scholarship|financial|aid|funding|stipend)\b/i,
    expansion: (q) => `tuition fee scholarship financial aid ${q}`,
  },
  {
    pattern: /\b(contact|email|phone|address|location|campus|office)\b/i,
    expansion: (q) => `contact email phone address ${q}`,
  },
];

function stripQuestionPhrasing(text: string): string {
  return text
    .replace(/^(who is|what is|what are|where is|where are|when is|when are|how is|how are|how do|how does|tell me about|can you tell me|explain|describe|give me info on|i want to know about|do you know)\s+/i, "")
    .replace(/\?+$/, "")
    .trim();
}

export function buildRetrievalQueries(message: string): string[] {
  const queries = new Set<string>([message]);
  const cleaned = stripQuestionPhrasing(message);
  if (cleaned.length > 2 && cleaned.toLowerCase() !== message.toLowerCase()) {
    queries.add(cleaned);
  }
  for (const rule of QUERY_EXPANSION_RULES) {
    if (rule.pattern.test(message)) {
      queries.add(rule.expansion(cleaned));
    }
  }
  return Array.from(queries);
}

const CONTEXT_BUDGET_CHARS = 24_000;

function removeChunkOverlap(chunks: string[]): string[] {
  if (chunks.length <= 1) return chunks;
  const out = [chunks[0]!];
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1]!;
    const cur = chunks[i]!;
    const tail = prev.slice(-200);
    const overlapIdx = cur.indexOf(tail.slice(-80));
    if (overlapIdx >= 0 && overlapIdx < 200) {
      out.push(cur.slice(overlapIdx + tail.slice(-80).length).trim());
    } else {
      out.push(cur);
    }
  }
  return out.filter((c) => c.length > 20);
}

function buildContextString(docs: RetrievedDoc[], userMessage: string): string {
  const exhaustive = isExhaustiveListQuestion(userMessage);
  const maxCharsPerChunk = exhaustive ? 1400 : 1800;
  const maxSources = exhaustive ? 30 : 12;
  const ordered = exhaustive
    ? sortDocsForExhaustiveAnswer(docs, userMessage)
    : [...docs].sort((a, b) => (a.distance ?? 1) - (b.distance ?? 1));
  const slice = ordered.slice(0, maxSources);

  const byUrl = new Map<string, { title: string; bestDistance: number; chunks: string[] }>();
  for (const d of slice) {
    const key = d.url || `_untitled_${d.id}`;
    const entry = byUrl.get(key) ?? { title: d.title, bestDistance: d.distance ?? 1, chunks: [] };
    entry.chunks.push(d.content.slice(0, maxCharsPerChunk).trim());
    if ((d.distance ?? 1) < entry.bestDistance) entry.bestDistance = d.distance ?? 1;
    byUrl.set(key, entry);
  }

  const pages = [...byUrl.entries()].sort((a, b) => a[1].bestDistance - b[1].bestDistance);

  const directory = pages.map(([url, { title }], i) => `${i + 1}. ${title} — ${url}`).join("\n");
  const directoryBlock = `PAGE DIRECTORY (${pages.length} pages retrieved):\n${directory}`;

  let sourceIdx = 0;
  let totalChars = directoryBlock.length + 20;
  const blocks: string[] = [directoryBlock];
  for (const [url, { title, chunks }] of pages) {
    sourceIdx++;
    const deduped = removeChunkOverlap(chunks);
    const body = deduped.join("\n\n");
    const block = `[Source ${sourceIdx}]\nTitle: ${title}\nURL: ${url}\n\n${body}`;
    if (totalChars + block.length > CONTEXT_BUDGET_CHARS && blocks.length > 1) break;
    blocks.push(block);
    totalChars += block.length;
  }
  return blocks.join("\n\n---\n\n");
}

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
// Minimal output cleaner — no aggressive URL stripping
// ---------------------------------------------------------------------------
function cleanModelOutput(raw: string): string {
  let text = raw
    .replace(/<redacted_thinking>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/^For More Info\s*→.*$/gim, "")
    .trim();

  const blocks = text.split(/\n{3,}/).map((b) => b.trim()).filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const block of blocks) {
    const key = block.toLowerCase().replace(/\s+/g, " ");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(block);
    }
  }
  return unique.join("\n\n").trim();
}

function extractRelevantPages(
  raw: string,
  sources: Array<{ url: string; title: string }>
): { cleaned: string; pageLinks: PageLink[] } {
  const match = raw.match(/\[RELEVANT_PAGES\]\s*([\s\S]*?)\s*\[\/RELEVANT_PAGES\]/i);
  const cleaned = raw.replace(/\n?\[RELEVANT_PAGES\][\s\S]*?\[\/RELEVANT_PAGES\]/i, "").trim();
  if (!match) return { cleaned, pageLinks: [] };
  const urls = match[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("http"));
  const pageLinks: PageLink[] = [];
  for (const url of urls.slice(0, 2)) {
    const src = sources.find((s) => s.url === url);
    pageLinks.push({ url, title: src?.title || url });
  }
  return { cleaned, pageLinks };
}

function stripInlineSourceMentions(answer: string): string {
  return answer
    .replace(/\(\s*Source\s*:[^)]+\)/gi, "")
    .replace(/^source\s*:[\s\S]*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanSocialTitle(raw: string): string {
  let t = raw
    .replace(/\s*(\bon\b\s*|[-–|·]\s*)?(Instagram|Twitter|LinkedIn|Facebook|X)\b.*$/i, "")
    .replace(/^.*?:\s*"?/, "")
    .replace(/"?\s*$/, "")
    .trim();
  if (!t || t.length < 5) t = "Recent post";
  return t;
}

const PLATFORM_PRIORITY: Record<string, number> = {
  instagram: 0,
  twitter: 1,
  linkedin: 2,
  facebook: 3,
};

function formatSocialLinksInline(results: SocialSearchResult[]): string {
  if (results.length === 0) return "";

  const sorted = [...results].sort(
    (a, b) => (PLATFORM_PRIORITY[a.platform] ?? 9) - (PLATFORM_PRIORITY[b.platform] ?? 9)
  );

  const MAX_INLINE = 3;
  const posts = sorted.slice(0, MAX_INLINE);
  const lines = posts.map((r) => `• ${cleanSocialTitle(r.title)} → ${r.url}`);
  return "\n\n" + lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main RAG
// ---------------------------------------------------------------------------
export async function answerQuestionWithRag(params: {
  siteId: string;
  message: string;
  history: ChatHistoryItem[];
}) {
  const { siteId, message, history } = params;
  const faqUserAnswer = await getFaqUserAnswerForQuestion(siteId, message).catch(() => null);
  if (faqUserAnswer && !faqUserAnswer.stale) {
    return {
      answer: faqUserAnswer.answer.trim(),
      sources: [],
      pageLinks: [] as PageLink[],
      socialLinks: [] as SocialLink[],
    };
  }

  const baseQueries = buildRetrievalQueries(message);

  const socialIntent = hasSocialIntent(message);
  const socialPromise = socialIntent
    ? searchSocialMedia(siteId, message).catch((err) => {
        console.error("[social] searchSocialMedia failed:", err instanceof Error ? err.message : err);
        return [] as Awaited<ReturnType<typeof searchSocialMedia>>;
      })
    : Promise.resolve([]);

  const [{ docs: agenticDocs, retrievalMeta }, socialResults] = await Promise.all([
    runAgenticRetrieval({ siteId, userMessage: message, history, baseQueries }),
    socialPromise,
  ]);

  console.log(
    `RAG for site "${siteId}": ${retrievalMeta.totalQueriesUsed} retrieval quer${retrievalMeta.totalQueriesUsed === 1 ? "y" : "ies"} ` +
      `(rule=${retrievalMeta.ruleQueryCount}, planner=${retrievalMeta.plannerRan}, refiner=${retrievalMeta.refinerIterations}) → ${agenticDocs.length} chunks, bestDist≈${retrievalMeta.bestDistance.toFixed(4)}`
  );

  const docs = agenticDocs;

  console.log(`[social] Got ${socialResults.length} social results, ${docs.length} vector docs`);

  if (docs.length === 0 && socialResults.length === 0) {
    return {
      answer:
        "I couldn't find relevant information to answer that question. " +
        "Please try rephrasing, or contact the site owner directly.",
      sources: [],
      pageLinks: [] as PageLink[],
      socialLinks: [] as SocialLink[],
    };
  }

  const contextString = buildContextString(docs, message);
  const socialContextString = buildSocialContextString(socialResults);

  const catalogQuestion = isExhaustiveListQuestion(message);

  const systemPrompt = `
You are NavBot, a friendly and knowledgeable assistant for this website. You answer questions using ONLY the retrieved website content provided below. You sound like a helpful human who knows the website inside-out — not like a search engine reading results aloud.

BEFORE COMPOSING YOUR ANSWER:
1. Read every [Source N] block in full before writing a word of your answer.
2. If the question could have partial answers spread across multiple sources (e.g. deadlines on the admissions page AND the fees page AND the scholarship page), collect all of them first, then write one unified answer. Never stop after the first matching source.

CORE RULES:
3. Answer ONLY from the provided context. Never use prior knowledge or make assumptions about information not in the context.
4. If the answer is not in the context, say "I don't have that information from the website" and suggest the user contact the site owner or check the website directly.
5. If the user's message is conversational (greeting, thanks, small talk), respond naturally and warmly without citing sources.

FORMATTING:
6. For lists, steps, or enumeration questions ("name all / what are / how many"): use a bullet list (• or -), one item per line. Include EVERY matching item from the context — do not truncate for brevity.
7. For structured comparisons or multi-attribute data (fees by program, deadlines by round, faculty with departments): use a Markdown table with a header row. Never use a bullet list when a table would be clearer.
   Example:
   | Program | Fee   | Deadline |
   |---------|-------|----------|
   | MBA     | ₹X    | Jan 15   |
8. For non-list, non-table questions: 2–5 sentences. If the answer genuinely requires more (e.g. a full program overview), write more — but every sentence must carry new information. No preamble like "Great question" or "Based on the context provided".
9. Do NOT include inline markdown links like [text](url) or "Source:" annotations anywhere in your answer. Do NOT write a "For More Info" section — the system appends relevant page links automatically below your answer.
   Exception: social media post URLs must be included inline when referencing a post (see social media rules below).

CROSS-PAGE SYNTHESIS:
10. The context comes from MULTIPLE pages, each tagged [Source N] with a title. A single question often has its answer spread across several pages. Read ALL source blocks and combine information — do not answer from just the first few.
11. When different pages mention the same topic (e.g. a deadline on the admissions page AND on the scholarship page), synthesize them into one complete answer. Flag contradictions explicitly: "The admissions page says Jan 15, while the scholarship page says Jan 30."
12. For questions about a person, department, or topic: gather details from every page that mentions them and combine into one answer.

SOCIAL MEDIA POSTS:
13. When referencing a social media post or reel, always include its URL on its own line immediately after mentioning it, in the format: → [brief description] [url]
14. Describe what the post covers in your own words — do not quote captions verbatim.
15. If multiple posts cover the same event, list each on its own line. The system renders these as link previews.

UNIVERSITY & ACADEMIC AWARENESS:
16. For admission/application questions: mention ALL deadlines, rounds, and eligibility criteria found across the context. Order deadlines chronologically. If multiple programs have different deadlines, list each separately.
17. For fee/cost questions: include tuition, additional fees, scholarship/aid info, and payment deadlines if mentioned. Use a table for fee breakdowns.
18. For program/course questions: include curriculum structure, duration, credits, specializations, and unique features. If multiple programs exist, distinguish between them clearly.
19. For faculty/people questions: include designation, department, research interests, achievements, and any associated events or talks — gathered from all pages.
20. For placement/career questions: include statistics, top recruiters, salary ranges, and any relevant programs mentioned.

FILTERING & REASONING:
21. When the user asks to filter (e.g. "which faculty did their PhD from IISc"), list ONLY the matching items. Skip non-matching items silently — never say "X does not match, but...".
22. Do not repeat yourself. State each piece of information once.
23. For counting questions ("how many"), enumerate matches explicitly (e.g. "1. X, 2. Y — that's 2 total") so you don't miscount.

RELEVANT PAGES (REQUIRED):
24. After your answer, on a new line, output the 1-2 most relevant page URLs from the context that the user should visit for more details. Use this exact format:
[RELEVANT_PAGES]
url1
url2
[/RELEVANT_PAGES]
Only include pages whose content directly answers the user's question. If no page is clearly relevant (e.g. for greetings), omit this block entirely. Never include more than 2 URLs.
`.trim();

  let fullPrompt = `${systemPrompt}\n\nWEBSITE CONTEXT (your primary knowledge source):\n\n${contextString}`;

  if (socialContextString) {
    fullPrompt += `\n\n---\n\nSOCIAL MEDIA POSTS (supplementary — include post URLs when referencing):\n\n${socialContextString}`;
  }

  const recentHistory = history.slice(-6);
  while (recentHistory.length > 0 && recentHistory[0]!.role !== "user") {
    recentHistory.shift();
  }
  const contents = [
    ...recentHistory.map((h) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }],
    })),
    { role: "user" as const, parts: [{ text: message }] },
  ];

  const rawAnswer = await generateContentText({
    model: SARVAM_MODELS.chat,
    contents,
    config: {
      systemInstruction: fullPrompt,
      temperature: 0.2,
      maxOutputTokens: catalogQuestion ? 2048 : 700,
    },
  });

  console.log(`[RAG] Raw model output (${rawAnswer.length} chars): ${rawAnswer.slice(0, 500)}`);

  const sources = deduplicateSources(docs);

  for (const sr of socialResults) {
    if (!sources.find((s) => s.url === sr.url)) {
      sources.push({ url: sr.url, title: `${sr.platform}: ${sr.title}` });
    }
  }

  const { cleaned: cleanedAnswer, pageLinks } = extractRelevantPages(rawAnswer, sources);
  let answer = stripInlineSourceMentions(cleanModelOutput(cleanedAnswer));

  const socialLinks: SocialLink[] = socialResults.slice(0, 3).map((r) => ({
    platform: r.platform,
    title: cleanSocialTitle(r.title),
    url: r.url,
  }));

  if (socialResults.length > 0) {
    answer += formatSocialLinksInline(socialResults);
  }

  return {
    answer,
    sources,
    pageLinks,
    socialLinks,
  };
}

// ---------------------------------------------------------------------------
// Speech-to-text (Sarvam Saaras)
// ---------------------------------------------------------------------------
async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const client = getSarvamClient();

  console.log(
    `[STT] Sending ${(audioBuffer.length / 1024).toFixed(1)} KB of ${mimeType} to Sarvam ${SARVAM_MODELS.stt}`
  );

  const ext = mimeType.includes("wav") ? "wav"
    : mimeType.includes("mp3") || mimeType.includes("mpeg") ? "mp3"
    : mimeType.includes("ogg") ? "ogg"
    : mimeType.includes("webm") ? "webm"
    : "wav";

  const blob = new Blob([audioBuffer], { type: mimeType });
  const file = new File([blob], `audio.${ext}`, { type: mimeType });

  const response = await withRetry(
    () =>
      client.speechToText.transcribe({
        file,
        model: SARVAM_MODELS.stt as "saaras:v3" | "saarika:v2.5",
        language_code: "unknown" as never,
      }),
    { maxAttempts: 3, baseDelayMs: 800, label: "STT" }
  );

  const result = response as unknown as { transcript?: string; text?: string };
  const transcript = (result.transcript ?? result.text ?? "").trim();
  if (!transcript) {
    throw new Error("Sarvam STT returned an empty transcript.");
  }
  console.log(`[STT] Transcript: "${transcript}"`);
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
        "Sorry, I couldn't transcribe your voice message. " +
        "Please check that SARVAM_API_KEY is set and try WAV, MP3, OGG, or WebM audio. " +
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
// Text-to-speech → base64 WAV for widget
// ---------------------------------------------------------------------------
const MAX_TTS_CHARS = 1000;

export async function synthesizeSpeech(text: string): Promise<string> {
  const client = getSarvamClient();
  const truncated =
    text.length > MAX_TTS_CHARS ? text.slice(0, MAX_TTS_CHARS) + "…" : text;

  console.log(`[TTS] Converting ${truncated.length} chars to speech`);

  const response = await withRetry(
    () =>
      client.textToSpeech.convert({
        text: truncated,
        target_language_code: SARVAM_TTS_LANG as "en-IN",
        speaker: SARVAM_TTS_SPEAKER as "anushka",
        model: SARVAM_MODELS.tts as "bulbul:v2",
      }),
    { maxAttempts: 3, baseDelayMs: 1000, label: "TTS" }
  );

  const result = response as unknown as { audios?: string[] };
  const wavB64 = result.audios?.[0];
  if (!wavB64) throw new Error("Sarvam TTS returned no audio.");

  console.log(`[TTS] Audio generated (${wavB64.length} chars base64)`);
  return wavB64;
}
