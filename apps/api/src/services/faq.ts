import { SarvamAIClient } from "sarvamai";
import { querySiteDocs } from "./vectorstore";
import { getFaqsBySite, replaceFaqs, getTopQueries } from "./db";

const sarvam = new SarvamAIClient({
  apiSubscriptionKey: process.env.SARVAM_API_KEY ?? "",
});

const CHAT_MODEL = (process.env.SARVAM_CHAT_MODEL || "sarvam-m") as any;

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

export async function generateFaqsForSite(siteId: string): Promise<Array<{ label: string; question: string }>> {
  // Retrieve a broad set of content chunks from the vector store
  const docs = await querySiteDocs({ siteId, query: SEED_QUERIES, topK: 6 });

  if (docs.length === 0) {
    return [{ label: "About this website", question: "What is this website about?" }];
  }

  const contextSnippets = docs
    .slice(0, 15)
    .map((d, i) => `[${i + 1}] ${d.title}\n${d.content.slice(0, 400)}`)
    .join("\n\n");

  // Check if there are popular user queries to incorporate
  const topQueries = getTopQueries(siteId, 10);
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

  try {
    const completion = await sarvam.chat.completions({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: "You output only valid JSON arrays. No markdown, no explanation." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const raw: string = (completion as any).choices?.[0]?.message?.content ?? "[]";
    const cleaned = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<\/?think>/gi, "")
      .trim();

    // Extract JSON array from the response (handle markdown code fences)
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
export async function getOrGenerateFaqs(siteId: string): Promise<Array<{ label: string; question: string }>> {
  const existing = getFaqsBySite(siteId);
  if (existing.length > 0) {
    return existing.map((f) => ({ label: f.label, question: f.question }));
  }

  const generated = await generateFaqsForSite(siteId);
  replaceFaqs(siteId, generated);
  return generated;
}

/**
 * Force-refresh FAQs for a site (incorporating latest user queries).
 */
export async function refreshFaqs(siteId: string): Promise<Array<{ label: string; question: string }>> {
  const generated = await generateFaqsForSite(siteId);
  replaceFaqs(siteId, generated);
  return generated;
}
