import { querySiteDocs } from "./vectorstore";
import {
  getFaqsBySite,
  replaceFaqs,
  getTopQueries,
  updateFaqAnswerPreview,
  isFaqUserAnswerStale,
  updateFaqUserAnswer,
} from "./db";
import { answerQuestionWithRag } from "./rag";
import { generateContentText, GEMINI_MODELS, getGeminiApiKey } from "./gemini-client";

const FAQ_ANSWER_PREVIEW_MAX = 800;

const SEED_QUERIES = [
  "admissions deadlines",
  "programs offered",
  "fee structure",
  "how to apply",
  "campus facilities",
  "contact information",
  "scholarships and financial aid",
  "placement statistics",
];

export async function generateFaqsForSite(
  siteId: string
): Promise<Array<{ label: string; question: string }>> {
  const docs = await querySiteDocs({ siteId, query: SEED_QUERIES, topK: 6 });

  if (docs.length === 0) {
    return [{ label: "About this website", question: "What is this website about?" }];
  }

  const contextSnippets = docs
    .slice(0, 15)
    .map((d, i) => `[${i + 1}] ${d.title}\n${d.content.slice(0, 400)}`)
    .join("\n\n");

  const topQueries = await getTopQueries(siteId, 10);
  let popularSection = "";
  if (topQueries.length >= 3) {
    popularSection = `\n\nPOPULAR USER QUESTIONS (incorporate the most relevant ones):\n${topQueries.map((q) => `- "${q.query}" (asked ${q.count} times)`).join("\n")}`;
  }

  const prompt = `You are an FAQ generator. Based on the website content below, generate 4-6 frequently asked questions that a first-time visitor would likely ask.${popularSection}

WEBSITE CONTENT:
${contextSnippets}

RULES:
1. Each FAQ must be answerable from the website content above.
2. Keep labels short (3-5 words) and questions natural.
3. Cover diverse topics (don't repeat similar questions).
4. If popular user questions are provided, prioritize those topics.
5. Return ONLY a valid JSON array of objects with "label" and "question" keys. No other text.

Example output:
[{"label":"Admission deadlines","question":"What are the admission deadlines?"},{"label":"Programs offered","question":"What programs do you offer?"}]`;

  if (!getGeminiApiKey()) {
    console.warn("generateFaqsForSite: no GEMINI_API_KEY — using fallback FAQs");
    return fallbackFaqs();
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
        temperature: 0.3,
        maxOutputTokens: 500,
      },
    });

    const cleaned = raw.trim();

    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return fallbackFaqs();

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ label: string; question: string }>;
    if (!Array.isArray(parsed) || parsed.length === 0) return fallbackFaqs();

    const validated = parsed
      .filter((f) => typeof f.label === "string" && typeof f.question === "string")
      .slice(0, 6);

    return validated.length > 0 ? validated : fallbackFaqs();
  } catch (err) {
    console.error("FAQ generation failed:", err);
    return fallbackFaqs();
  }
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

function fallbackFaqs(): Array<{ label: string; question: string }> {
  return [
    { label: "About this website", question: "What is this website about?" },
    { label: "How to get started", question: "How do I get started?" },
    { label: "Contact information", question: "How can I contact you?" },
  ];
}

/**
 * Get FAQs for a site. If none exist, generate and store them.
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

/**
 * Force-refresh FAQs for a site (incorporating latest user queries).
 */
export async function refreshFaqs(
  siteId: string
): Promise<Array<{ label: string; question: string; answerPreview?: string | null }>> {
  const generated = await generateFaqsForSite(siteId);
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
