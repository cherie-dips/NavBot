/**
 * One LLM call that does all the query understanding:
 *   - resolves a follow-up into a standalone question ("and for them?" -> full question)
 *   - classifies intent (greeting / out of scope / simple / compositional)
 *   - decomposes compositional questions into independent sub-queries
 *   - names the site sections likely to hold the answer
 *
 * It replaces the previous keyword-stuffing heuristic, which prepended frequent
 * words from recent turns onto the query and produced worse retrieval inputs than
 * the raw question ("fees admission btech - what about that?").
 *
 * Latency is hidden: the caller fires this concurrently with a baseline retrieval
 * of the raw question, so the plan arrives while first-pass chunks are already in.
 */
import { generateContentText, GEMINI_MODELS } from "./gemini-client";
import { getSiteProfile } from "./site-profile";
import type { ChatHistoryItem } from "./chat-types";

export type QueryIntent = "greeting" | "out_of_scope" | "simple" | "compositional";

export interface QueryPlan {
  /** The question with pronouns and ellipsis resolved. */
  standalone: string;
  intent: QueryIntent;
  /** Retrieval queries. One for simple, 2-4 for compositional. */
  subQueries: string[];
  /** Site sections the planner expects the answer to live in. */
  sections: string[];
  /** True when the user is asking for an exhaustive list. */
  exhaustive: boolean;
  /**
   * True when answering needs judgement rather than lookup — comparing options,
   * weighing trade-offs, explaining why, or advising this particular visitor.
   * These route through the slower reasoning pipeline; everything else does not.
   */
  analytical: boolean;
  /** Set when the plan came from the fallback path rather than the model. */
  degraded?: boolean;
}

const PLANNER_MAX_TOKENS = 400;

function buildPrompt(siteId: string): string {
  const profile = getSiteProfile(siteId);
  const scope = profile.scopeDescription || `the website ${siteId}`;
  const map = profile.sectionMap
    ? `\nSITE MAP (where content actually lives):\n${profile.sectionMap}\n`
    : "";

  return `You plan retrieval for a chatbot that answers questions about ${scope}

Given the conversation and the user's latest message, return JSON only:
{
  "standalone": "the latest message rewritten as a complete standalone question, with pronouns and implied subjects filled in from the conversation",
  "intent": "greeting" | "out_of_scope" | "simple" | "compositional",
  "subQueries": ["search phrases that would match statements on the website"],
  "sections": ["url path prefixes most likely to contain the answer"],
  "exhaustive": true if the user wants a complete list of every item, else false,
  "analytical": true if answering requires judgement rather than lookup, else false
}
${map}
INTENT RULES:
- "greeting": hello, thanks, goodbye, small talk. subQueries: [].
- "out_of_scope": the question is not about this university at all (world news, weather, sports, general trivia, writing their essay, or a request to compare against another institution using outside knowledge). subQueries: [].
- "compositional": answering needs facts from two or more different topics that live on different pages (e.g. comparing fees against scholarship coverage, or combining student count with faculty count). Give one sub-query PER topic.
- "simple": everything else, including single-topic list questions.

ANALYTICAL RULES:
Set "analytical" true when a correct answer needs the facts to be weighed, not just found:
- comparing two things, or judging whether something is worth it, good, strong or a fit
- explaining WHY something is the case, or what the trade-offs and implications are
- advice for the visitor's own situation ("should I", "is this right for someone who...")
- anything asking what makes this place different, or what its approach or philosophy is
Set it false for plain lookups: a fee, a date, an address, a name, an eligibility rule,
or a list of what exists. Retrieving those is the whole job.
Analytical questions are still in scope when they are about this university — only mark
a comparison "out_of_scope" when it needs facts about a DIFFERENT institution.

SUB-QUERY RULES:
- Write them as declarative phrases that would literally appear on a web page, NOT as questions.
  Good: "BTech annual tuition fee category A"   Bad: "How much is the tuition?"
- 1 sub-query for simple, 2-4 for compositional. Never more than 4.
- Include distinctive proper nouns from the question.
- If the user asks about placements, recruiters or career outcomes, include a sub-query about graduating class outcomes and one about career pathways.

Return only the JSON object.`;
}

function safeParse(raw: string): Partial<QueryPlan> | null {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Partial<QueryPlan>;
  } catch {
    return null;
  }
}

const EXHAUSTIVE_PATTERN =
  /\b(list|all|every|each|how many|name all|what are the|enumerate|complete list|full list)\b/i;

/**
 * Used when the planner is unavailable, and as a floor under its judgement — the
 * planner sometimes marks an obviously comparative question as a simple lookup, and
 * routing that to the fast path is the exact failure this pipeline was built to fix.
 */
const ANALYTICAL_PATTERN =
  /\b(compare[sd]?|comparison|versus|vs\.?|better than|best (?:choice|option|fit|for)|worth (?:it|the)|should i|why (?:is|does|do|did|are|would|should)|how does .* (?:differ|compare)|difference between|pros and cons|trade[- ]?offs?|advantages?|disadvantages?|drawbacks?|benefits? of|right for me|suit(?:able|ed)? for|recommend|which (?:one|program|degree|course) (?:is|should)|what makes .* (?:different|unique|special)|strengths?|weakness|is it (?:good|hard|difficult|easy|safe|reputable)|reputation|value for money|return on investment|roi)\b/i;

/** Used when the planner is unavailable — keeps chat working, just less smart. */
export function fallbackPlan(message: string, history: ChatHistoryItem[]): QueryPlan {
  const lastUser = [...history].reverse().find((h) => h.role === "user");
  const looksLikeFollowUp =
    /\b(it|that|this|those|them|they|its|their|there|the same|these|more about|tell me more|what about|how about)\b/i.test(
      message
    ) && message.split(/\s+/).length <= 12;

  const standalone =
    looksLikeFollowUp && lastUser ? `${lastUser.content} — ${message}` : message;

  return {
    standalone,
    intent: "simple",
    subQueries: [standalone],
    sections: [],
    exhaustive: EXHAUSTIVE_PATTERN.test(message),
    analytical: ANALYTICAL_PATTERN.test(message),
    degraded: true,
  };
}

export async function planQuery(params: {
  siteId: string;
  message: string;
  history: ChatHistoryItem[];
}): Promise<QueryPlan> {
  const { siteId, message, history } = params;

  const recent = history.slice(-6);
  const transcript = recent.length
    ? recent.map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content.slice(0, 400)}`).join("\n")
    : "(no prior conversation)";

  try {
    const raw = await generateContentText({
      model: GEMINI_MODELS.planner,
      contents: [
        {
          role: "user" as const,
          parts: [{ text: `CONVERSATION:\n${transcript}\n\nLATEST MESSAGE: ${message}` }],
        },
      ],
      config: {
        systemInstruction: buildPrompt(siteId),
        temperature: 0,
        maxOutputTokens: PLANNER_MAX_TOKENS,
        responseMimeType: "application/json",
        thinkingLevel: "low",
      },
    });

    const parsed = safeParse(raw);
    if (!parsed) return fallbackPlan(message, history);

    const intent: QueryIntent =
      parsed.intent === "greeting" ||
      parsed.intent === "out_of_scope" ||
      parsed.intent === "compositional"
        ? parsed.intent
        : "simple";

    const standalone =
      typeof parsed.standalone === "string" && parsed.standalone.trim().length > 2
        ? parsed.standalone.trim()
        : message;

    const subQueries = Array.isArray(parsed.subQueries)
      ? parsed.subQueries.filter((s): s is string => typeof s === "string" && s.trim().length > 2).slice(0, 4)
      : [];

    const sections = Array.isArray(parsed.sections)
      ? parsed.sections.filter((s): s is string => typeof s === "string").slice(0, 6)
      : [];

    return {
      standalone,
      intent,
      subQueries: subQueries.length ? subQueries : intent === "greeting" || intent === "out_of_scope" ? [] : [standalone],
      sections,
      exhaustive: parsed.exhaustive === true || EXHAUSTIVE_PATTERN.test(message),
      analytical:
        parsed.analytical === true ||
        ANALYTICAL_PATTERN.test(message) ||
        ANALYTICAL_PATTERN.test(standalone),
    };
  } catch (err) {
    console.warn("[planner] failed:", err instanceof Error ? err.message.slice(0, 160) : err);
    return fallbackPlan(message, history);
  }
}
