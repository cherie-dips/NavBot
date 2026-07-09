
import { type RetrievedDoc } from "./vectorstore";
import { hasSocialIntent, searchSocialMedia, buildSocialContextString, type SocialSearchResult } from "./social-search";
import { getFaqUserAnswerForQuestion } from "./db";
import { runAgenticRetrieval } from "./agentic-retrieval";
import { isExhaustiveListQuestion, sortDocsForExhaustiveAnswer } from "./multipage-retrieval";
import type { ChatHistoryItem, PageLink, SocialLink } from "./chat-types";
import {
  withRetry,
  getGeminiApiKey,
  getGoogleGenAI,
  GEMINI_MODELS,
  generateContentText,
} from "./gemini-client";



if (!getGeminiApiKey()) {
  console.warn(
    "GEMINI_API_KEY is not set. Chat, STT, and TTS will not work."
  );
}

// ---------------------------------------------------------------------------
// Query expansion (rule-based)
// ---------------------------------------------------------------------------
interface ExpansionRule {
  pattern: RegExp;
  expansion: (original: string) => string;
}

const QUERY_EXPANSION_RULES: ExpansionRule[] = [
  {
    pattern: /\b(deadline|admission|admit|apply|application|eligibility|criteria|requirement|enrol)/i,
    expansion: (q) => `${q} admission deadline application eligibility requirements`,
  },
  {
    pattern: /\b(fee structure|tuition|scholarship|financial aid|funding|stipend|loan|waiver)\b/i,
    expansion: (q) => `${q} tuition fee structure scholarship financial aid`,
  },
  {
    pattern: /\b(program|course|degree|major|minor|specialization|stream|branch|curriculum|syllabus|department)\b/i,
    expansion: (q) => `${q} programs courses degrees curriculum department`,
  },
  {
    pattern: /\b(contact|email|phone|address|office hours|directions?)\b/i,
    expansion: (q) => `${q} contact email phone address location`,
  },
  {
    pattern: /\b(faculty|professor|teacher|instructor|researcher|supervisor|mentor|dean)\b/i,
    expansion: (q) => `${q} faculty professor academic staff research`,
  },
  {
    pattern: /\b(placement|recruit|hiring|companies|career|job|package|salary|internship)\b/i,
    expansion: (q) => `${q} placements recruiting companies career internship`,
  },
  {
    pattern: /\b(hostel|accommodation|mess|dining|residence|dorm|campus housing)\b/i,
    expansion: (q) => `${q} hostel accommodation campus housing residence`,
  },
  {
    pattern: /\b(fest|club|society|extracurricular|campus life|student life|student activit)/i,
    expansion: (q) => `${q} events clubs student life campus activities`,
  },
  {
    pattern: /\b(research lab|publication|innovation|research centre|research center|research project)\b/i,
    expansion: (q) => `${q} research labs projects innovation centres`,
  },
];

function stripQuestionPhrasing(text: string): string {
  return text
    .replace(/^(who is|what is|what are|where is|where are|when is|when are|how is|how are|how do|how does|tell me about|can you tell me|explain|describe|give me info on|i want to know about|do you know)\s+/i, "")
    .replace(/\?+$/, "")
    .trim();
}

const FOLLOW_UP_PATTERN = /\b(it|that|this|those|them|they|its|their|there|the same|these|more about|more details|tell me more|what about|how about|and the|also the|what else)\b/i;

function resolveFollowUp(message: string, history: ChatHistoryItem[]): string {
  if (history.length === 0) return message;
  if (message.split(/\s+/).length > 8 && !FOLLOW_UP_PATTERN.test(message)) return message;

  const lastUserMsg = [...history].reverse().find((h) => h.role === "user");
  if (!lastUserMsg) return message;

  const lastTopics = stripQuestionPhrasing(lastUserMsg.content);
  if (lastTopics.length < 3) return message;

  return `${lastTopics} — ${message}`;
}

function buildRetrievalQueries(message: string): string[] {
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

const CONTEXT_BUDGET_CHARS = 128_000;

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

function titleFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    const last = path.split("/").filter(Boolean).pop();
    if (!last) return url;
    return last
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return url;
  }
}

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
    norm === `welcome to ${site}`;
  return generic ? titleFromUrl(url) : title;
}

function isRedundant(chunk: string, existing: string[], threshold: number): boolean {
  const words = new Set(chunk.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  if (words.size < 5) return false;
  for (const e of existing) {
    const eWords = new Set(e.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    let overlap = 0;
    for (const w of words) if (eWords.has(w)) overlap++;
    if (overlap / words.size > threshold) return true;
  }
  return false;
}

function buildContextString(docs: RetrievedDoc[], userMessage: string, siteId: string): string {
  const exhaustive = isExhaustiveListQuestion(userMessage);
  const maxCharsPerChunk = exhaustive ? 1200 : 2000;
  const maxSources = exhaustive ? 40 : 30;
  const ordered = exhaustive
    ? sortDocsForExhaustiveAnswer(docs, userMessage)
    : [...docs].sort((a, b) => (a.distance ?? 1) - (b.distance ?? 1));
  const slice = ordered.slice(0, maxSources);

  const byUrl = new Map<string, { title: string; url: string; bestDistance: number; chunks: string[] }>();
  for (const d of slice) {
    const key = d.url || `_untitled_${d.id}`;
    const title = resolveTitle(d.title, d.url, siteId);
    const entry = byUrl.get(key) ?? { title, url: d.url, bestDistance: d.distance ?? 1, chunks: [] };
    entry.chunks.push(d.content.slice(0, maxCharsPerChunk).trim());
    if ((d.distance ?? 1) < entry.bestDistance) entry.bestDistance = d.distance ?? 1;
    byUrl.set(key, entry);
  }

  const pages = [...byUrl.entries()].sort((a, b) => a[1].bestDistance - b[1].bestDistance);

  let totalChars = 0;
  const blocks: string[] = [];
  const includedKeys = new Set<string>();
  const allIncludedChunks: string[] = [];

  for (const [key, { title, chunks }] of pages) {
    const deduped = removeChunkOverlap(chunks);
    const fresh = deduped.filter((c) => !isRedundant(c, allIncludedChunks, 0.75));
    if (fresh.length === 0) continue;
    const body = fresh.join("\n\n");
    const block = `${title}\n${body}`;
    if (totalChars + block.length > CONTEXT_BUDGET_CHARS && blocks.length > 0) break;
    blocks.push(block);
    totalChars += block.length;
    includedKeys.add(key);
    allIncludedChunks.push(...fresh);
  }

  const urlDirectory = pages
    .filter(([key]) => includedKeys.has(key))
    .map(([, { title, url }]) => `${title} — ${url}`)
    .join("\n");
  blocks.push(`Pages:\n${urlDirectory}`);

  return blocks.join("\n\n---\n\n");
}

function deduplicateSources(
  docs: RetrievedDoc[],
  siteId: string
): Array<{ url: string; title: string; distance?: number }> {
  const seen = new Map<string, { url: string; title: string; distance?: number }>();
  for (const d of docs) {
    if (!seen.has(d.url)) {
      seen.set(d.url, { url: d.url, title: resolveTitle(d.title, d.url, siteId), distance: d.distance });
    }
  }
  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// Output cleaner
// ---------------------------------------------------------------------------
const META_PATTERN = /\b(based on (the )?(context|sources?|provided|retrieved)|according to (the )?(sources?|context|provided)|from (the )?(retrieved|provided|available) (context|sources?|information)|I (found|checked|reviewed|searched|re-?checked)|looking at (the )?(sources?|context|pages?)|(?:it )?(appears|seems) (?:that |from ))\b/i;

function cleanModelOutput(raw: string): string {
  let text = raw
    .replace(/\[(?:Source\s*\d+|(?:\d+))\]\((https?:\/\/[^\s)]+)\)/gi, "")
    .trim();

  const META_START = /^(based on|according to|from the|I found|looking at|it (?:appears|seems))\b/i;
  const firstBreak = text.search(/[.!:]\s/);
  if (firstBreak > 0 && firstBreak < 150) {
    const firstSentence = text.slice(0, firstBreak + 1).trim();
    if (META_START.test(firstSentence)) {
      text = text.slice(firstBreak + 1).replace(/^[,:;\s]+/, "").trim();
    }
  }

  const lines = text.split("\n");
  while (lines.length > 1) {
    const last = lines[lines.length - 1]!.trim();
    if (last && META_PATTERN.test(last) && last.length < 180 && !/\b\d+\b/.test(last)) {
      lines.pop();
    } else {
      break;
    }
  }
  text = lines.join("\n").trim();

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
    .replace(/\(?\s*(?:as (?:per|mentioned in|stated in|noted in) )?Source\s*\d+\s*(?:and\s*(?:Source\s*)?\d+)*\s*\)?[.,;]?\s*/gi, "")
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

  const enrichedMessage = resolveFollowUp(message, history);
  const baseQueries = buildRetrievalQueries(enrichedMessage);
  if (enrichedMessage !== message) {
    for (const q of buildRetrievalQueries(message)) {
      if (!baseQueries.includes(q)) baseQueries.push(q);
    }
  }

  const socialIntent = hasSocialIntent(message);
  const socialPromise = socialIntent
    ? searchSocialMedia(siteId, message).catch((err) => {
        console.error("[social] searchSocialMedia failed:", err instanceof Error ? err.message : err);
        return [] as Awaited<ReturnType<typeof searchSocialMedia>>;
      })
    : Promise.resolve([]);

  const [{ docs, retrievalMeta }, socialResults] = await Promise.all([
    runAgenticRetrieval({ siteId, userMessage: message, history, baseQueries }),
    socialPromise,
  ]);

  console.log(
    `RAG for site "${siteId}": ${retrievalMeta.totalQueriesUsed} queries → ${docs.length} chunks, bestDist≈${retrievalMeta.bestDistance.toFixed(4)}`
  );
  console.log(`[social] Got ${socialResults.length} social results, ${docs.length} vector docs`);

  const NO_MATCH_THRESHOLD = 0.85;
  const LOW_QUALITY_THRESHOLD = 0.65;
  const bestDist = retrievalMeta.bestDistance;

  if ((docs.length === 0 && socialResults.length === 0) || bestDist >= NO_MATCH_THRESHOLD) {
    return {
      answer:
        "I couldn't find relevant information to answer that question. " +
        "Please try rephrasing, or contact the site owner directly.",
      sources: [],
      pageLinks: [] as PageLink[],
      socialLinks: [] as SocialLink[],
    };
  }

  const lowConfidence = bestDist >= LOW_QUALITY_THRESHOLD;

  const contextString = buildContextString(docs, message, siteId);
  const socialContextString = buildSocialContextString(socialResults);

  const systemPrompt = `You are NavBot, a navigation chatbot for the website ${siteId}. You help users find information on the website by answering questions. Use ONLY the provided page content for factual answers. For greetings, small talk, and thank-yous, respond naturally without needing page content.

ANSWER FORMAT:
- Start directly with the answer. First word must be content, not commentary.
- Keep answers concise — this is a chat widget, not a document.
- Lists: bullet points (•), one per line.
- Short answers (dates, names, yes/no): 1-2 sentences is fine.
- Detailed answers (comparisons, overviews): up to 5 sentences or a brief list.
- Avoid large markdown tables — use bullet points instead for chat readability.

RULES:
- Unknown answer: reply "I don't have that information — please check ${siteId} or contact them directly."
- Only state facts you are certain about. If your answer may be incomplete, add "For the full list, check the relevant page below."
- Carefully scan ALL provided page content before answering. Information about the same topic may be spread across multiple pages — do not stop after finding a partial answer on one page.
- Connect the dots: if a person is mentioned on one page and a school/institute/initiative named after them appears on another page, link those facts together in your answer.
- Combine information from all pages into one unified answer.
- If pages contradict each other, state both versions with their page names.
- Counting questions: enumerate items then state the total.
- Greetings: respond naturally and introduce yourself as the chatbot for this website.
- Follow-up questions: use the conversation history to resolve pronouns and references (e.g. "tell me more", "what about the fees for that").
- Respond in the same language the user writes in.
- When social media posts are provided, include their URLs inline in your answer so users can click through to the original post.

After your answer, on a new line output 1-2 page URLs that directly answer the question:
[RELEVANT_PAGES]
url1
url2
[/RELEVANT_PAGES]
Only include pages whose content you actually used in your answer. Omit for greetings.`;

  let contextMessage = lowConfidence
    ? `Note: the retrieved pages may not be closely related to the question. Only answer if you find a clear match; otherwise say you don't have that information.\n\nPage content:\n\n${contextString}`
    : `Page content:\n\n${contextString}`;
  if (socialContextString) {
    contextMessage += `\n\n---\n\nRecent social media posts:\n\n${socialContextString}`;
  }

  const recentHistory = history.slice(-6);
  while (recentHistory.length > 0 && recentHistory[0]!.role !== "user") {
    recentHistory.shift();
  }
  const contents = [
    { role: "user" as const, parts: [{ text: contextMessage }] },
    { role: "model" as const, parts: [{ text: "Ready." }] },
    ...recentHistory.map((h) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }],
    })),
    { role: "user" as const, parts: [{ text: message }] },
  ];

  const rawAnswer = await generateContentText({
    model: GEMINI_MODELS.chat,
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.2,
      maxOutputTokens: 4096,
    },
  });

  console.log(`[RAG] Raw model output (${rawAnswer.length} chars): ${rawAnswer.slice(0, 500)}`);

  const sources = deduplicateSources(docs, siteId);

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
// Speech-to-text (Gemini 2.5 Flash)
// ---------------------------------------------------------------------------
async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const ai = getGoogleGenAI();
  const audioBase64 = audioBuffer.toString("base64");

  console.log(
    `[STT] Sending ${(audioBuffer.length / 1024).toFixed(1)} KB of ${mimeType} to Gemini ${GEMINI_MODELS.stt}`
  );

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
  if (!transcript) {
    throw new Error("Gemini STT returned an empty transcript.");
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
        "Please check that GEMINI_API_KEY is set and try WAV, MP3, OGG, or WebM audio. " +
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
// Text-to-speech → base64 audio for widget (Gemini 2.5 Flash)
// ---------------------------------------------------------------------------
const MAX_TTS_CHARS = 1000;
const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE?.trim() || "Kore";

export async function synthesizeSpeech(text: string): Promise<string> {
  const ai = getGoogleGenAI();
  const truncated =
    text.length > MAX_TTS_CHARS ? text.slice(0, MAX_TTS_CHARS) + "…" : text;

  console.log(`[TTS] Converting ${truncated.length} chars to speech via Gemini`);

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODELS.tts,
        contents: [
          {
            role: "user",
            parts: [{ text: `Read this text aloud:\n\n${truncated}` }],
          },
        ],
        config: {
          responseModalities: ["audio"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE },
            },
          },
        },
      }),
    { maxAttempts: 3, baseDelayMs: 1000, label: "TTS" }
  );

  const candidates = response.candidates ?? [];
  const parts = candidates[0]?.content?.parts ?? [];
  const audioPart = parts.find(
    (p) => "inlineData" in p && p.inlineData != null
  );
  const inlineData = (audioPart as { inlineData?: { data?: string; mimeType?: string } } | undefined)?.inlineData;
  if (!inlineData?.data) {
    throw new Error("Gemini TTS returned no audio data.");
  }

  console.log(`[TTS] Audio generated (${inlineData.data.length} chars base64, ${inlineData.mimeType})`);
  return inlineData.data;
}
