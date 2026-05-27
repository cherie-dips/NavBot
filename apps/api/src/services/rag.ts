
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
  GROQ_MODELS,
  generateContentText,
  llmJudgeEnabled,
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

const INSTITUTION_SYNONYMS: Record<string, string> = {
  iisc: "IISc Indian Institute of Science Bangalore Bengaluru",
  iit: "IIT Indian Institute of Technology",
  nit: "NIT National Institute of Technology",
  iiit: "IIIT International Institute of Information Technology",
  iiser: "IISER Indian Institute of Science Education and Research",
  bits: "BITS Birla Institute of Technology and Science",
};

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
  {
    pattern: /\b(faculty|professor|teacher|instructor|researcher|supervisor|mentor|phd|doctorate|academic staff)\b/i,
    expansion: (q) => `faculty professor PhD academic research ${q}`,
  },
  {
    pattern: /\b(placement|recruit|hiring|company|companies|career|job|package|ctc|salary)\b/i,
    expansion: (q) => `placement recruiting companies career packages ${q}`,
  },
  {
    pattern: /\b(IISc|IIT|NIT|IIIT|IISER|BITS)\b/i,
    expansion: (q) => {
      const lower = q.toLowerCase();
      for (const [abbrev, full] of Object.entries(INSTITUTION_SYNONYMS)) {
        if (lower.includes(abbrev)) return `${full} ${q}`;
      }
      return q;
    },
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

const CONTEXT_BUDGET_CHARS = 32_000;

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
  const maxCharsPerChunk = exhaustive ? 1200 : 1600;
  const maxSources = exhaustive ? 40 : 15;
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
    .replace(/^(Based on|According to|From) (the )?(provided |retrieved |available )?(context|sources?|content|information|data)[\s,:]*/gim, "")
    .replace(/^(After |Upon |I |Having )(re-?)?check(ing|ed)?.*?(,|:)\s*/gim, "")
    .replace(/^(After |Upon )(re-?)?review(ing|ed)?.*?(,|:)\s*/gim, "")
    .replace(/^(I found that|I can see that|It (appears|seems) that|Let me)\s*/gim, "")
    .replace(/^(The following|These)\s+\w+\s+(are |is |were |was )?(explicitly |clearly )?(mentioned|listed|found|stated|identified).*?[.:]\s*/gim, "")
    .replace(/^(Here (are|is)|Below (are|is)).*?[.:]\s*/gim, "")
    .replace(/\bhowever[,;]?\s*(the )?(context|source|page|data|information)\s+(does not|doesn't|is not|isn't)\s+[^.]*\./gi, "")
    .replace(/\b,?\s*but\s+(the )?(specialization|detail|information|context)\s+(is not|isn't|was not|wasn't)\s+[^.]*\./gi, "")
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
// Inline LLM judge — checks answer completeness & groundedness
// ---------------------------------------------------------------------------
interface JudgeVerdict {
  pass: boolean;
  feedback: string;
}

function parseJudgeVerdict(raw: string): JudgeVerdict {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return { pass: true, feedback: "" };
  try {
    const parsed = JSON.parse(match[0]) as { pass?: boolean; feedback?: string };
    return {
      pass: parsed.pass !== false,
      feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
    };
  } catch {
    return { pass: true, feedback: "" };
  }
}

async function runInlineJudge(
  question: string,
  answer: string,
  context: string
): Promise<JudgeVerdict> {
  const prompt = `You are a quality judge for a RAG chatbot. Check if the answer is complete and grounded.

QUESTION: ${JSON.stringify(question)}

ANSWER TO CHECK: ${JSON.stringify(answer.slice(0, 2000))}

CONTEXT (retrieved pages): ${context.slice(0, 8000)}

Check these criteria:
1. COMPLETENESS: Does the answer list ALL matching items from the context? For filter/list questions ("which faculty...", "what companies..."), count how many matches exist in the context vs how many the answer lists.
2. GROUNDEDNESS: Is every claim in the answer supported by the context?
3. RELEVANCE: Does it actually answer the question asked?

If ALL criteria pass, return: {"pass": true, "feedback": ""}
If any criterion fails, return: {"pass": false, "feedback": "Specific instruction to fix the answer, e.g. 'The context contains 5 faculty with PhDs from IISc but the answer only lists 2. Include: [names].'"}

Return JSON only.`;

  const raw = await generateContentText({
    model: GROQ_MODELS.judge,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.1,
      maxOutputTokens: 300,
      responseMimeType: "application/json",
    },
  });

  return parseJudgeVerdict(raw);
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

  const systemPrompt = `
You are NavBot, a helpful assistant for this website. Answer questions using ONLY the retrieved content below.

OUTPUT FORMAT — STRICT:
Your response must contain ONLY the direct answer. No preamble, no narration, no meta-commentary.
FORBIDDEN patterns (never write these):
- "After checking/reviewing/re-checking..."
- "I found that..." / "I can see that..."
- "The following X are mentioned..." / "These X are explicitly mentioned..."
- "Based on the context/sources/data..."
- "However, it is mentioned that..." / "but the context says..."
- Any sentence describing your own process or what you checked

WRONG: "After re-checking the faculty page, I found that the following faculty members have done their PhD from IISc:"
RIGHT: "Faculty members with PhDs from IISc:"

CORE RULES:
1. Use only the provided context. No prior knowledge, no assumptions.
2. If the answer isn't in the context: "I don't have that information — please contact the site or check directly."
3. For greetings or small talk, respond naturally without citing anything.

CONFIDENCE — INCLUDE OR SKIP:
4. Only include items you are CERTAIN about from the context. If a detail is ambiguous, unclear, or only partially mentioned — skip it entirely. Never hedge with "however", "but it's not clear", "the specialization is not mentioned", etc. Either state a fact or omit it.

FORMATTING:
5. Lists/enumerations: bullet points (•), one item per line. Include every matching item — never truncate.
6. Multi-column data (comparisons, fee tables, schedules, specs): Markdown table with header row.
7. Everything else: plain prose, 2–5 sentences. Every sentence must add new information.
8. No markdown links, no "Source:" labels, no "For More Info" sections. The system handles links automatically.

SYNTHESIS:
9. Answers often span multiple pages. Combine information from all relevant sources into one complete answer.
10. If two sources contradict each other, flag it: "The admissions page says Jan 15, while the fees page says Jan 30."

SOCIAL MEDIA:
11. When referencing a post or reel, add its URL on its own line right after: → [what the post is about] [url]

FILTERING:
12. Filter questions ("which X did Y"): list only explicit matches. Skip non-matches silently — no "X doesn't qualify, but...".
13. Counting questions ("how many"): enumerate items (1. X, 2. Y — total: 2) to avoid miscounting.
14. Never repeat the same information twice.

RELEVANT PAGES (required):
After your answer, output the 1–2 page URLs most directly relevant to the question:
[RELEVANT_PAGES]
url1
url2
[/RELEVANT_PAGES]
Omit entirely for greetings. Max 2 URLs.
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

  let rawAnswer = await generateContentText({
    model: SARVAM_MODELS.chat,
    contents,
    config: {
      systemInstruction: fullPrompt,
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  });

  console.log(`[RAG] Raw model output (${rawAnswer.length} chars): ${rawAnswer.slice(0, 500)}`);

  if (llmJudgeEnabled()) {
    try {
      const verdict = await runInlineJudge(message, rawAnswer, contextString);
      if (!verdict.pass && verdict.feedback) {
        console.log(`[RAG judge] FAIL — refining. Feedback: ${verdict.feedback}`);
        const refinedContents = [
          ...contents,
          { role: "model" as const, parts: [{ text: rawAnswer }] },
          {
            role: "user" as const,
            parts: [{ text: `Your previous answer was incomplete or inaccurate. ${verdict.feedback}\n\nPlease rewrite your answer addressing this feedback. Use the same context provided earlier.` }],
          },
        ];
        rawAnswer = await generateContentText({
          model: SARVAM_MODELS.chat,
          contents: refinedContents,
          config: {
            systemInstruction: fullPrompt,
            temperature: 0.2,
            maxOutputTokens: 2048,
          },
        });
        console.log(`[RAG judge] Refined answer (${rawAnswer.length} chars)`);
      } else {
        console.log(`[RAG judge] PASS`);
      }
    } catch (err) {
      console.warn(`[RAG judge] failed, using original answer:`, err instanceof Error ? err.message : err);
    }
  }

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
