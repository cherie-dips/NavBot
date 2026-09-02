import { querySiteDocs } from "../retrieval/vectorstore";
import {
  getFaqsBySite,
  replaceFaqs,
  getTopQueries,
  updateFaqAnswerPreview,
  isFaqUserAnswerStale,
  updateFaqUserAnswer,
} from "../platform/db";
import { answerQuestionWithRag } from "./rag";
import { generateContentText, GEMINI_MODELS, getGeminiApiKey } from "../platform/gemini-client";

const FAQ_ANSWER_PREVIEW_MAX = 800;
const MIN_FAQS = 5;
const MAX_FAQS = 8;

const SEED_QUERIES = [
  "about mission vision overview",
  "services products offerings features",
  "team people leadership founders",
  "contact information location address",
  "projects work portfolio experience",
  "events news updates announcements",
  "apply join register get started",
  "pricing plans cost investment",
  "achievements highlights awards recognition",
  "FAQ help support resources",
];

const QUERY_REFRESH_THRESHOLD = 20;

export async function generateFaqsForSite(
  siteId: string
): Promise<Array<{ label: string; question: string }>> {
  const docs = await querySiteDocs({ siteId, query: SEED_QUERIES, topK: 18 });
  console.log(`[FAQ] Retrieved ${docs.length} docs from Pinecone for seed queries`);

  if (docs.length === 0) return [];

  const contextSnippets = docs
    .slice(0, 24)
    .map((d, i) => `[${i + 1}] ${d.title}\n${d.content.slice(0, 500)}`)
    .join("\n\n");

  const topQueries = await getTopQueries(siteId, 15);
  let popularSection = "";
  if (topQueries.length >= 1) {
    popularSection = `\n\nPOPULAR USER QUESTIONS — these are real questions users have asked. Incorporate the most relevant ones as FAQs:\n${topQueries.map((q) => `- "${q.query}" (asked ${q.count} times)`).join("\n")}`;
  }

  const siteDomain = siteId.replace(/^www\./, "");
  const prompt = `You are generating FAQ questions for the chatbot of ${siteDomain}. Based on the website content below, generate exactly ${MAX_FAQS} thoughtful frequently asked questions that a first-time visitor would ask.${popularSection}

WEBSITE CONTENT:
${contextSnippets}

RULES:
1. Generate EXACTLY ${MAX_FAQS} FAQs. This is critical — do not generate fewer.
2. Questions MUST be specific to THIS website's actual content. Read the content carefully and generate questions that match what this particular site offers.
3. Do NOT use generic questions like "What is this website about?" or "How can I contact you?" — every FAQ should reflect something unique about this site.
4. Labels: 2-5 words, specific and descriptive.
5. Questions: natural, conversational, specific to the site's content.
6. Cover diverse topics — each FAQ should address a different aspect of the website.
7. If popular user questions are provided, prioritize those — they represent what real visitors want to know.
8. Return ONLY a valid JSON array of objects with "label" and "question" keys. No other text.

Example: for a university site you might generate [{"label":"B.Tech Programs","question":"What B.Tech programs are offered?"}], for a portfolio site [{"label":"Tech Stack","question":"What technologies do you work with?"}], for a company site [{"label":"Product Pricing","question":"What are the pricing plans?"}] — always match the site.`;

  if (!getGeminiApiKey()) {
    console.warn("[FAQ] no GEMINI_API_KEY — building FAQs from user queries");
    return buildFaqsFromUserQueries(topQueries);
  }

  try {
    const raw = await generateContentText({
      model: GEMINI_MODELS.chat,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "You output only valid JSON arrays. No markdown, no explanation.\n\n" + prompt,
            },
          ],
        },
      ],
      config: {
        temperature: 0.4,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    });

    const cleaned = raw.trim();
    console.log(`[FAQ] LLM raw output (${cleaned.length} chars): ${JSON.stringify(cleaned.slice(0, 500))}`);

    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("[FAQ] No JSON array found in LLM output");
      return buildFaqsFromUserQueries(topQueries);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ label: string; question: string }>;
    console.log(`[FAQ] Parsed ${parsed.length} items from JSON`);
    if (!Array.isArray(parsed) || parsed.length === 0) return buildFaqsFromUserQueries(topQueries);

    const validated = parsed
      .filter((f) => typeof f.label === "string" && f.label.trim().length > 0 && typeof f.question === "string" && f.question.trim().length > 0)
      .slice(0, MAX_FAQS);

    console.log(`[FAQ] Validated ${validated.length} FAQs`);
    if (validated.length < MIN_FAQS) {
      console.warn(`[FAQ] Only ${validated.length} valid FAQs from LLM, supplementing with user queries`);
      return supplementWithUserQueries(validated, topQueries);
    }
    return validated;
  } catch (err) {
    console.error("[FAQ] Generation failed:", err);
    return buildFaqsFromUserQueries(topQueries);
  }
}

function buildFaqsFromUserQueries(
  topQueries: Array<{ query: string; count: number }>
): Array<{ label: string; question: string }> {
  if (topQueries.length === 0) return [];
  const faqs = topQueries.slice(0, MAX_FAQS).map((q) => {
    const label = q.query
      .replace(/[?!.]+$/, "")
      .replace(/^(what|how|where|when|who|which|can|do|does|is|are|tell me about|i want to know)\s+/i, "")
      .slice(0, 40)
      .trim();
    const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
    return {
      label: capitalized,
      question: q.query.endsWith("?") ? q.query : `${q.query}?`,
    };
  });
  return faqs;
}

function supplementWithUserQueries(
  llmFaqs: Array<{ label: string; question: string }>,
  topQueries: Array<{ query: string; count: number }>
): Array<{ label: string; question: string }> {
  const existing = new Set(llmFaqs.map((f) => f.question.toLowerCase()));
  const extras = buildFaqsFromUserQueries(topQueries).filter(
    (f) => !existing.has(f.question.toLowerCase())
  );
  const combined = [...llmFaqs, ...extras].slice(0, MAX_FAQS);
  return combined;
}

function normalizeAnswerPreview(answer: string): string {
  const trimmed = answer.trim();
  if (trimmed.length <= FAQ_ANSWER_PREVIEW_MAX) return trimmed;
  return `${trimmed.slice(0, FAQ_ANSWER_PREVIEW_MAX)}…`;
}

async function generateAnswerForFaq(siteId: string, question: string): Promise<string | null> {
  try {
    const result = await answerQuestionWithRag({
      siteId,
      message: question,
      history: [],
    });
    return result.answer ? normalizeAnswerPreview(result.answer) : null;
  } catch {
    return null;
  }
}

/**
 * Get FAQs for a site. If none exist, generate and store them.
 * If enough new user queries have accumulated, trigger a background refresh.
 */
export async function getOrGenerateFaqs(
  siteId: string,
  options?: { includeAnswers?: boolean }
): Promise<
  Array<{
    id?: number;
    label: string;
    question: string;
    answerPreview?: string | null;
    answer?: string | null;
    hasUserAnswer?: boolean;
    userAnswerIsStale?: boolean;
  }>
> {
  const includeAnswers = options?.includeAnswers === true;
  const existing = await getFaqsBySite(siteId);

  if (existing.length > 0) {
    maybeScheduleRefresh(siteId, existing).catch(() => {});

    if (!includeAnswers) {
      return existing.map((f) => ({ label: f.label, question: f.question }));
    }
    const enriched = await Promise.all(
      existing.map(async (f) => {
        const hasUserAnswer = !!f.user_answer?.trim();
        const userAnswerIsStale = hasUserAnswer
          ? await isFaqUserAnswerStale(siteId, f.user_answer_updated_at)
          : false;
        const effectiveUserAnswer = hasUserAnswer && !userAnswerIsStale ? f.user_answer : null;
        const current = f.answer_preview ?? null;
        const resolvedCurrent = effectiveUserAnswer ?? current;
        if (resolvedCurrent) {
          return {
            id: f.id,
            label: f.label,
            question: f.question,
            answerPreview: normalizeAnswerPreview(resolvedCurrent),
            answer: resolvedCurrent,
            hasUserAnswer,
            userAnswerIsStale,
          };
        }
        const generated = await generateAnswerForFaq(siteId, f.question);
        if (generated) await updateFaqAnswerPreview(f.id, generated);
        const effective = effectiveUserAnswer ?? generated;
        return {
          id: f.id,
          label: f.label,
          question: f.question,
          answerPreview: effective ? normalizeAnswerPreview(effective) : null,
          answer: effective,
          hasUserAnswer,
          userAnswerIsStale,
        };
      })
    );
    return enriched;
  }

  const generated = await generateFaqsForSite(siteId);
  if (generated.length === 0) return [];

  if (!includeAnswers) {
    await replaceFaqs(siteId, generated);
    return generated;
  }
  const withAnswers = await Promise.all(
    generated.map(async (faq) => ({
      ...faq,
      answerPreview: await generateAnswerForFaq(siteId, faq.question),
    }))
  );
  await replaceFaqs(siteId, withAnswers);
  return withAnswers;
}

const refreshInProgress = new Set<string>();

async function maybeScheduleRefresh(siteId: string, existing: Array<{ created_at: Date | string }>) {
  if (refreshInProgress.has(siteId)) return;

  const oldestFaq = existing.reduce((oldest, f) => {
    const d = f.created_at instanceof Date ? f.created_at : new Date(f.created_at);
    return d < oldest ? d : oldest;
  }, new Date());

  const topQueries = await getTopQueries(siteId, 1);
  const totalQueries = topQueries.reduce((sum, q) => sum + q.count, 0);

  const hoursSinceGenerated = (Date.now() - oldestFaq.getTime()) / (1000 * 60 * 60);
  const shouldRefresh = totalQueries >= QUERY_REFRESH_THRESHOLD && hoursSinceGenerated >= 24;

  if (!shouldRefresh) return;

  console.log(`[FAQ] Auto-refreshing FAQs for ${siteId} (${totalQueries} queries, ${Math.round(hoursSinceGenerated)}h since last generation)`);
  refreshInProgress.add(siteId);
  try {
    await refreshFaqs(siteId);
  } finally {
    refreshInProgress.delete(siteId);
  }
}

/**
 * Force-refresh FAQs for a site (incorporating latest user queries).
 */
export async function refreshFaqs(
  siteId: string
): Promise<Array<{ label: string; question: string; answerPreview?: string | null }>> {
  const generated = await generateFaqsForSite(siteId);
  if (generated.length === 0) {
    console.warn(`[FAQ] Refresh produced 0 FAQs for ${siteId} — keeping existing`);
    const existing = await getFaqsBySite(siteId);
    return existing.map((f) => ({ label: f.label, question: f.question, answerPreview: f.answer_preview }));
  }
  const withAnswers = await Promise.all(
    generated.map(async (faq) => ({
      ...faq,
      answerPreview: await generateAnswerForFaq(siteId, faq.question),
    }))
  );
  await replaceFaqs(siteId, withAnswers);
  return withAnswers;
}

export async function saveFaqUserAnswer(
  siteId: string,
  faqId: number,
  userAnswer: string
): Promise<boolean> {
  const normalized = userAnswer.trim();
  if (!normalized) return false;
  return await updateFaqUserAnswer(siteId, faqId, normalized);
}
