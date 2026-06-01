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
  "admissions deadlines how to apply",
  "programs courses degrees offered",
  "fee structure tuition scholarships financial aid",
  "campus facilities hostel accommodation",
  "placements careers companies recruiting",
  "faculty research labs leadership",
  "events workshops student life clubs",
  "about mission founders vision",
  "contact information address email",
  "achievements rankings highlights",
];

const MIN_FAQS = 5;
const MAX_FAQS = 8;

export async function generateFaqsForSite(
  siteId: string
): Promise<Array<{ label: string; question: string }>> {
  const docs = await querySiteDocs({ siteId, query: SEED_QUERIES, topK: 18 });

  if (docs.length === 0) {
    return fallbackFaqs();
  }

  const contextSnippets = docs
    .slice(0, 24)
    .map((d, i) => `[${i + 1}] ${d.title}\n${d.content.slice(0, 500)}`)
    .join("\n\n");

  const topQueries = await getTopQueries(siteId, 15);
  let popularSection = "";
  if (topQueries.length >= 2) {
    popularSection = `\n\nPOPULAR USER QUESTIONS (incorporate the most relevant ones):\n${topQueries.map((q) => `- "${q.query}" (asked ${q.count} times)`).join("\n")}`;
  }

  const siteDomain = siteId.replace(/^www\./, "");
  const prompt = `You are generating FAQ questions for the chatbot of ${siteDomain}. Based on the website content below, generate exactly ${MAX_FAQS} thoughtful frequently asked questions that a prospective visitor would ask.${popularSection}

WEBSITE CONTENT:
${contextSnippets}

RULES:
1. Generate EXACTLY ${MAX_FAQS} FAQs. This is critical — do not generate fewer.
2. Questions must be specific to this website's actual content — not generic like "What is this website about?" or "How can I contact you?"
3. Think about what a prospective student, parent, or visitor would genuinely want to know: specific programs, unique offerings, admission criteria, placements, campus life, leadership, research, events, etc.
4. Labels: 2-5 words, specific and descriptive (e.g. "B.Tech Admissions" not "Admissions").
5. Questions: natural, conversational, specific (e.g. "What are the placement statistics and top recruiting companies?" not "Tell me about placements").
6. Cover diverse topics — each FAQ should address a different aspect of the website.
7. If popular user questions are provided, prioritize and refine those topics.
8. Return ONLY a valid JSON array of objects with "label" and "question" keys. No other text.

Example output format:
[{"label":"B.Tech Programs","question":"What B.Tech programs are offered and what makes them unique?"},{"label":"Placement Stats","question":"What are the placement statistics and which companies recruit from here?"}]`;

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
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
    });

    const cleaned = raw.trim();

    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return fallbackFaqs();

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ label: string; question: string }>;
    if (!Array.isArray(parsed) || parsed.length === 0) return fallbackFaqs();

    const validated = parsed
      .filter((f) => typeof f.label === "string" && f.label.trim().length > 0 && typeof f.question === "string" && f.question.trim().length > 0)
      .slice(0, MAX_FAQS);

    if (validated.length < MIN_FAQS) return fallbackFaqs();
    return validated;
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
    { label: "Programs offered", question: "What programs and courses are offered?" },
    { label: "How to apply", question: "How do I apply and what are the admission requirements?" },
    { label: "Fee & scholarships", question: "What is the fee structure and are scholarships available?" },
    { label: "Campus & facilities", question: "What facilities and campus life can students expect?" },
    { label: "Placements & careers", question: "What are the placement statistics and top recruiters?" },
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
