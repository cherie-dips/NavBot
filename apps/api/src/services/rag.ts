import { createPartFromBase64 } from "@google/genai";
import { querySiteDocs, type RetrievedDoc } from "./vectorstore";
import { hasSocialIntent, searchSocialMedia, buildSocialContextString } from "./social-search";
import { getFaqUserAnswerForQuestion } from "./db";
import { runAgenticRetrieval } from "./agentic-retrieval";
import { isExhaustiveListQuestion, sortDocsForExhaustiveAnswer } from "./multipage-retrieval";
import type { ChatHistoryItem } from "./chat-types";
import {
  geminiWithRetry,
  getGeminiApiKey,
  getGoogleGenAI,
  GEMINI_MODELS,
  generateContentText,
  llmJudgeEnabled,
  codeExecutionEnabled,
} from "./gemini-client";

export type { ChatHistoryItem } from "./chat-types";

if (!getGeminiApiKey()) {
  console.warn(
    "GOOGLE_API_KEY / GEMINI_API_KEY is not set. Chat, STT, and TTS will not work."
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

export function buildRetrievalQueries(message: string): string[] {
  const queries = new Set<string>([message]);
  for (const rule of QUERY_EXPANSION_RULES) {
    if (rule.pattern.test(message)) {
      queries.add(rule.expansion(message));
    }
  }
  return Array.from(queries);
}

function buildContextString(docs: RetrievedDoc[], userMessage: string): string {
  const exhaustive = isExhaustiveListQuestion(userMessage);
  const maxChars = exhaustive ? 1650 : 2200;
  const maxSources = exhaustive ? 34 : 28;
  const ordered = exhaustive
    ? sortDocsForExhaustiveAnswer(docs, userMessage)
    : [...docs].sort((a, b) => (a.distance ?? 1) - (b.distance ?? 1));
  const slice = ordered.slice(0, maxSources);

  return slice
    .map(
      (d, idx) =>
        `[Source ${idx + 1}]\nTitle: ${d.title}\nURL: ${d.url}\n\n${d.content.slice(0, maxChars).trim()}`
    )
    .join("\n\n---\n\n");
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
  const threshold = hasSocial ? 0.55 : 1.0;
  let relevant = sources.filter(
    (s) => s.distance === undefined || s.distance < threshold
  );
  const catalog =
    userMessage && isExhaustiveListQuestion(userMessage);
  if (catalog && relevant.length) {
    const wantsEvents = /workshop|events?\b|seminar|talk|session|meetup|webinar|hackathon|bootcamp/i.test(
      userMessage
    );
    relevant = [...relevant].sort((a, b) => {
      const ea = wantsEvents && /\/events(\/|$)/i.test(a.url) ? 0 : 1;
      const eb = wantsEvents && /\/events(\/|$)/i.test(b.url) ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return (a.distance ?? 0) - (b.distance ?? 0);
    });
  }
  const limit = catalog ? 8 : 2;
  const topSources = relevant.slice(0, limit);
  if (!topSources.length) return "";
  return `Source: ${topSources.map((s) => s.url).join(" | ")}`;
}

function sanitizeAnswerText(raw: string): string {
  return raw
    .replace(/<redacted_thinking>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1: $2")
    .trim();
}

function messageNeedsComputation(text: string): boolean {
  return /\d+\s*[%+*/×÷-]|\b(sum|total|average|mean|percent|percentage|calculate|how many|multiply|divided by|fraction|prime|fibonacci|equation|logic puzzle|riddle)\b/i.test(
    text
  );
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
  if (!llmJudgeEnabled() || !getGeminiApiKey()) return params.draftAnswer;
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
      model: GEMINI_MODELS.judge,
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

function pcm16MonoToWavBase64(pcm: Buffer, sampleRate: number): string {
  const bitsPerSample = 16;
  const numChannels = 1;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]).toString("base64");
}

function parseSampleRateFromMime(mime: string): number {
  const m = /rate=(\d+)/i.exec(mime);
  if (m) return parseInt(m[1]!, 10);
  return 24000;
}

function audioPartToWavBase64(mimeType: string, dataB64: string): string {
  const buf = Buffer.from(dataB64, "base64");
  if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "RIFF") {
    return dataB64;
  }
  const rate = parseSampleRateFromMime(mimeType || "");
  return pcm16MonoToWavBase64(buf, rate);
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
  const faqUserAnswer = await getFaqUserAnswerForQuestion(siteId, message);
  if (faqUserAnswer && !faqUserAnswer.stale) {
    return {
      answer: faqUserAnswer.answer.trim(),
      sources: [],
    };
  }

  const baseQueries = buildRetrievalQueries(message);

  const { docs: agenticDocs, needsComputation, retrievalMeta } = await runAgenticRetrieval({
    siteId,
    userMessage: message,
    history,
    baseQueries,
  });

  console.log(
    `RAG for site "${siteId}": ${retrievalMeta.totalQueriesUsed} retrieval quer${retrievalMeta.totalQueriesUsed === 1 ? "y" : "ies"} ` +
      `(rule=${retrievalMeta.ruleQueryCount}, planner=${retrievalMeta.plannerRan}, refiner=${retrievalMeta.refinerIterations}) → ${agenticDocs.length} chunks, bestDist≈${retrievalMeta.bestDistance.toFixed(4)}`
  );

  const socialIntent = hasSocialIntent(message);
  console.log(`[social] Intent detected: ${socialIntent} for query: "${message}"`);

  const socialPromise = socialIntent
    ? searchSocialMedia(siteId, message)
    : Promise.resolve([]);

  const socialResults = await socialPromise;
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
You are NavBot, a helpful assistant that answers questions using content retrieved from the website with siteId: "${siteId}".

RULES:
1. Answer primarily from the provided website context. Do NOT use prior knowledge.
2. If dates, deadlines, rounds, or schedules appear in the context, state them clearly and precisely.
3. If the context contains a table, extract the relevant row/column and present it cleanly.
4. If social media posts are provided, you may reference them and MUST include the post URL so the user can check it out.
5. If the answer is not in any context, say "I don't have that information" and suggest contacting the site owner.
6. If the user asks for a list, steps, bullet points, "name all", "what are the", or multiple distinct items, answer with a clear bullet list: each item on its own line starting with "• " or "- ". Include every relevant item you find in the context; do not omit items to be brief.
7. For non-list questions, keep answers concise: usually 1-4 short sentences, no fluff, no repeated phrasing.
8. Include useful next-step details only if they are directly relevant to the question.
9. Do NOT include citations, markdown links, or "Source:" text in the body for website sources; plain answer text only. But DO include social media URLs inline.
10. If the user's question is conversational or a greeting, respond naturally without citing sources.
11. CATALOG / MULTI-PAGE: The context is built from many website chunks, each tagged with Title and URL. For questions about everything the organization has done (events, workshops, projects, programs), read across ALL [Source …] blocks — not only the first few. A single chunk often describes ONE page (e.g. one URL under /events/… = one event or workshop). List a separate bullet for each distinct event/workshop/session you can name from those blocks.
12. URL AWARENESS: If the user asks about events or workshops and some sources have "/events/" in the URL, those sources are usually the primary evidence. Do not answer using only generic pages (e.g. /about, /projects) when /events/ sources in the same context describe specific named activities — combine them into one complete list.
`.trim();

  let combinedSystemPrompt = `${systemPrompt}\n\nWEBSITE CONTEXT (your primary knowledge source):\n\n${contextString}`;

  if (socialContextString) {
    combinedSystemPrompt += `\n\n---\n\nSOCIAL MEDIA POSTS (supplementary — include post URLs when referencing):\n\n${socialContextString}`;
  }

  const useCodeExec =
    codeExecutionEnabled() &&
    (needsComputation || messageNeedsComputation(message));

  const contents = [
    ...history.slice(-6).map((h) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }],
    })),
    { role: "user" as const, parts: [{ text: message }] },
  ];

  const rawAnswer = await generateContentText({
    model: GEMINI_MODELS.chat,
    contents,
    useCodeExecution: useCodeExec,
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
  const sourcesLine = formatSourcesLine(sources, socialResults.length > 0, message);
  const answer = sourcesLine ? `${cleanedBody}\n\n${sourcesLine}` : cleanedBody;

  return {
    answer,
    sources,
  };
}

// ---------------------------------------------------------------------------
// Speech-to-text (Gemini multimodal)
// ---------------------------------------------------------------------------
async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const ai = getGoogleGenAI();
  const b64 = audioBuffer.toString("base64");
  const audioPart = createPartFromBase64(b64, mimeType);

  console.log(
    `[STT] Sending ${(audioBuffer.length / 1024).toFixed(1)} KB of ${mimeType} to ${GEMINI_MODELS.stt}`
  );

  const response = await geminiWithRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODELS.stt,
        contents: [
          {
            role: "user",
            parts: [
              audioPart,
              {
                text: "Transcribe the speech only. Same language as the speaker. Output plain transcript text without labels, quotes, or commentary.",
              },
            ],
          },
        ],
        config: { temperature: 0 },
      }),
    { maxAttempts: 3, baseDelayMs: 800, label: "STT" }
  );

  const transcript = response.text?.trim() ?? "";
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
        "Please check that GOOGLE_API_KEY is set and try WAV, MP3, OGG, or WebM audio. " +
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
  const ai = getGoogleGenAI();
  const truncated =
    text.length > MAX_TTS_CHARS ? text.slice(0, MAX_TTS_CHARS) + "…" : text;

  console.log(`[TTS] Converting ${truncated.length} chars to speech`);

  const response = await geminiWithRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODELS.tts,
        contents: [
          {
            role: "user",
            parts: [{ text: `Say in a clear, friendly tone: ${truncated}` }],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: process.env.GEMINI_TTS_VOICE?.trim() || "Kore",
              },
            },
          },
        },
      }),
    { maxAttempts: 3, baseDelayMs: 1000, label: "TTS" }
  );

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = (part as { inlineData?: { mimeType?: string; data?: string } }).inlineData;
    if (inline?.data && inline.mimeType) {
      const wavB64 = audioPartToWavBase64(inline.mimeType, inline.data);
      console.log(`[TTS] Audio generated (${wavB64.length} chars base64)`);
      return wavB64;
    }
  }

  const fallback = response.data;
  if (fallback) {
    return audioPartToWavBase64("audio/L16;rate=24000", fallback);
  }

  throw new Error("Gemini TTS returned no audio.");
}
