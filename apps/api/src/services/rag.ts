import { type RetrievedDoc } from "./vectorstore";
import { searchSocialMedia, buildSocialContextString } from "./social-search";
import { getFaqUserAnswerForQuestion } from "./db";
import { runAgenticRetrieval } from "./agentic-retrieval";
import { isExhaustiveListQuestion, sortDocsForExhaustiveAnswer } from "./multipage-retrieval";
import type { ChatHistoryItem } from "./chat-types";
import {
  withRetry,
  getGroqApiKey,
  getSarvamClient,
  GROQ_MODELS,
  SARVAM_MODELS,
  SARVAM_TTS_SPEAKER,
  SARVAM_TTS_LANG,
  generateContentText,
  llmJudgeEnabled,
} from "./gemini-client";

export type { ChatHistoryItem } from "./chat-types";

if (!getGroqApiKey()) {
  console.warn(
    "GROQ_API_KEY is not set. Chat and STT will not work."
  );
}

// ---------------------------------------------------------------------------
// Domain-specific query expansion rules (cheap baseline for retrieval).
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
  {
    pattern: /\b(list|enumerate|bullet|steps|outline|name all|what are (all )?the|give me (all |the )?|each of|features|benefits|options)\b/i,
    expansion: (q) =>
      `complete list overview all items features details ${q}`,
  },
  {
    pattern: /\b(event|events|workshop|workshops|seminar|talk|hackathon|bootcamp|meetup|webinar)\b/i,
    expansion: (q) =>
      `events page all events workshops past events schedule ${q}`,
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

const CONTEXT_BUDGET_CHARS = 50_000;

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
  const maxSources = exhaustive ? 30 : 20;
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

function stripInlineSourceMentions(answer: string): string {
  return answer
    .replace(/\(\s*Source\s*:[^)]+\)/gi, "")
    .replace(/^source\s*:[\s\S]*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatSourcesLine(
  sources: Array<{ url: string; title: string; distance?: number }>,
  hasSocial = false,
  userMessage?: string
): string {
  if (!sources.length) return "";

  const catalog = userMessage && isExhaustiveListQuestion(userMessage);

  // Split into website sources (have distance) and social sources (no distance)
  const webSources = sources.filter((s) => s.distance !== undefined);
  const socialSources = sources.filter((s) => s.distance === undefined);

  // Pick top website sources
  let topWeb = webSources.filter((s) => s.distance! < 1.0);
  if (catalog) {
    const wantsEvents = /workshop|events?\b|seminar|talk|session|meetup|webinar|hackathon|bootcamp/i.test(
      userMessage
    );
    topWeb = [...topWeb].sort((a, b) => {
      const ea = wantsEvents && /\/events(\/|$)/i.test(a.url) ? 0 : 1;
      const eb = wantsEvents && /\/events(\/|$)/i.test(b.url) ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return (a.distance ?? 0) - (b.distance ?? 0);
    });
    topWeb = topWeb.slice(0, 5);
  } else {
    topWeb = topWeb.slice(0, 2);
  }

  // Always include all social sources (up to 3)
  const topSocial = socialSources.slice(0, 3);

  const combined = [...topWeb, ...topSocial];
  if (!combined.length) return "";
  return `Source: ${combined.map((s) => s.url).join(" | ")}`;
}

function sanitizeAnswerText(raw: string): string {
  return raw
    .replace(/<redacted_thinking>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1: $2")
    .trim();
}

function contextSummariesForJudge(docs: RetrievedDoc[], userMessage: string): string {
  const exhaustive = isExhaustiveListQuestion(userMessage);
  const ordered = exhaustive
    ? sortDocsForExhaustiveAnswer(docs, userMessage)
    : [...docs].sort((a, b) => (a.distance ?? 1) - (b.distance ?? 1));
  const cap = exhaustive ? 14 : 6;
  return ordered
    .slice(0, cap)
    .map((d, i) => `[${i + 1}] ${d.title} (${d.url}) — ${d.content.slice(0, 320).replace(/\s+/g, " ").trim()}`)
    .join("\n");
}

function parseJudgeJson(raw: string): {
  acceptable?: boolean;
  issues?: string[];
  revised_answer?: string;
} {
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]) as {
      acceptable?: boolean;
      issues?: string[];
      revised_answer?: string;
    };
  } catch {
    return {};
  }
}

async function judgeAnswer(params: {
  userMessage: string;
  docs: RetrievedDoc[];
  draftAnswer: string;
}): Promise<string> {
  if (!llmJudgeEnabled() || !getGroqApiKey()) return params.draftAnswer;
  if (params.docs.length === 0) return params.draftAnswer;

  const prompt = `You evaluate a website chatbot answer (NavBot). Return JSON only.

USER QUESTION:
${JSON.stringify(params.userMessage)}

RETRIEVED CONTEXT (snippets — the bot may only use these for factual claims about the site):
${contextSummariesForJudge(params.docs, params.userMessage)}

DRAFT ANSWER:
${JSON.stringify(params.draftAnswer)}

Return:
{"acceptable": true/false, "issues": ["short reason"], "revised_answer": "optional fixed answer text, or omit"}

Rules:
- Facts about the organization must appear in the context. If not, the answer should say it does not have that information.
- Do not invent URLs, dates, or policies.
- If acceptable, set acceptable true and omit revised_answer.
- revised_answer must be plain text like the draft (no markdown links for site sources; social URLs may appear inline if in context).
- If the draft uses bullet lines (• or -), preserve that list format in revised_answer; do not collapse lists into one paragraph.
- For non-list answers, keep revised_answer concise when you provide one.
- If the user asked for a list of events/workshops/sessions and the context includes several distinct URLs under /events/ (or titles clearly tied to those URLs), the draft is NOT acceptable if it only names one or two items while many are described in context; revised_answer should list each distinct event/workshop found across sources (one bullet per item).`;

  try {
    const raw = await generateContentText({
      model: GROQ_MODELS.judge,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        maxOutputTokens: isExhaustiveListQuestion(params.userMessage) ? 1536 : 512,
        responseMimeType: "application/json",
      },
    });
    const j = parseJudgeJson(raw);
    if (j.acceptable === true) return params.draftAnswer;
    if (typeof j.revised_answer === "string" && j.revised_answer.trim()) {
      return sanitizeAnswerText(j.revised_answer.trim());
    }
    return (
      "I don't have that information in the website content I can see. " +
      "Please try rephrasing or contact the site owner."
    );
  } catch (e) {
    console.warn("[judge] skipped:", e);
    return params.draftAnswer;
  }
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
    };
  }

  const baseQueries = buildRetrievalQueries(message);

  const socialPromise = searchSocialMedia(siteId, message).catch((err) => {
    console.error("[social] searchSocialMedia failed:", err instanceof Error ? err.message : err);
    return [] as Awaited<ReturnType<typeof searchSocialMedia>>;
  });

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
    };
  }

  const contextString = buildContextString(docs, message);
  const socialContextString = buildSocialContextString(socialResults);

  const catalogQuestion = isExhaustiveListQuestion(message);

  const systemPrompt = `
You are NavBot, a friendly and knowledgeable assistant for this website. You answer questions using ONLY the retrieved website content provided below. You sound like a helpful human who knows the website inside-out — not like a search engine reading results aloud.

CORE RULES:
1. Answer ONLY from the provided context. Never use prior knowledge or make assumptions about information not in the context.
2. If the answer is not in the context, say "I don't have that information from the website" and suggest the user contact the site owner or check the website directly.
3. If the user's message is conversational (greeting, thanks, small talk), respond naturally and warmly without citing sources.

FORMATTING:
4. For lists, steps, or "name all / what are the / how many" questions: use a bullet list (• or -), one item per line. Include EVERY relevant item from the context — do not omit items to be brief.
5. For non-list questions: keep answers concise — 1-4 clear sentences, no filler, no repeated phrasing.
6. If the context contains a table or structured data (fees, schedules, comparisons), extract the relevant rows and present them cleanly.
7. Do NOT include citations, markdown links, or "Source:" text in the body. Plain text only. Exception: social media URLs should be included inline.

CROSS-PAGE SYNTHESIS:
8. The context comes from MULTIPLE pages of the website, each tagged with [Source N], Title, and URL. A single question often has its answer spread across several pages. Read ALL source blocks and combine information — do not answer from just the first few.
9. When different pages mention the same topic (e.g. deadlines on admissions page AND on scholarship page AND on fees page), synthesize all of them into one complete answer. Flag differences if pages contradict each other (e.g. "The admissions page says Jan 15, while the scholarship page says Jan 30").
10. For questions about a person, department, or topic: gather details from every page that mentions them. A person may appear on a faculty page, an events page, and a news page — combine all of it.

UNIVERSITY & ACADEMIC AWARENESS:
11. For admission/application questions: mention ALL deadlines, rounds, and eligibility criteria you find across the context. Order deadlines chronologically. If multiple programs have different deadlines, list each separately.
12. For fee/cost questions: include tuition, any additional fees, scholarship/aid info, and payment deadlines if mentioned anywhere in the context. Present fee structures clearly — use a breakdown if multiple components exist.
13. For program/course questions: include curriculum structure, duration, credits, specializations, and any unique features mentioned. If multiple programs exist, distinguish between them clearly.
14. For faculty/people questions: include designation, department, research interests, achievements, and any events/talks they are associated with — gathered from all pages.
15. For placement/career questions: include statistics, top recruiters, salary ranges, and any relevant programs mentioned in the context.

REASONING & COUNTING:
16. For questions involving counting ("how many"), arithmetic, comparisons, or date logic: enumerate items explicitly (e.g. "1. X, 2. Y, 3. Z — that's 3 total") so you don't miscount. Show brief reasoning when the question is quantitative.
`.trim();

  let combinedSystemPrompt = `${systemPrompt}\n\nWEBSITE CONTEXT (your primary knowledge source):\n\n${contextString}`;

  if (socialContextString) {
    combinedSystemPrompt += `\n\n---\n\nSOCIAL MEDIA POSTS (supplementary — include post URLs when referencing):\n\n${socialContextString}`;
  }

  const contents = [
    ...history.slice(-6).map((h) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }],
    })),
    { role: "user" as const, parts: [{ text: message }] },
  ];

  const rawAnswer = await generateContentText({
    model: GROQ_MODELS.chat,
    contents,
    config: {
      systemInstruction: combinedSystemPrompt,
      temperature: 0.2,
      maxOutputTokens: catalogQuestion ? 2048 : 700,
    },
  });

  let answerBody = sanitizeAnswerText(rawAnswer);

  answerBody = await judgeAnswer({
    userMessage: message,
    docs,
    draftAnswer: answerBody,
  });

  const sources = deduplicateSources(docs);

  for (const sr of socialResults) {
    if (!sources.find((s) => s.url === sr.url)) {
      sources.push({ url: sr.url, title: `${sr.platform}: ${sr.title}` });
    }
  }

  const cleanedBody = stripInlineSourceMentions(answerBody);
  const sourcesLine = formatSourcesLine(sources, true, message);
  const answer = sourcesLine ? `${cleanedBody}\n\n${sourcesLine}` : cleanedBody;

  return {
    answer,
    sources,
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
