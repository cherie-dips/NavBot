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
import { generateContentText, GEMINI_MODELS } from "../platform/gemini-client";
import { getSiteProfile } from "../platform/site-profile";
import type { ChatHistoryItem } from "../answer/chat-types";

type QueryIntent = "greeting" | "out_of_scope" | "simple" | "compositional";

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
  /**
   * True when the visitor is asking what something is LIKE rather than what it is —
   * a typical week, life in the hostel, what to expect. These need a picture built
   * from several parts of the site, and an answer written as a description rather
   * than a fact list.
   */
  experiential: boolean;
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
  "analytical": true if answering requires judgement rather than lookup, else false,
  "experiential": true if the visitor is asking what something is LIKE to live or do, else false
}
${map}
INTENT RULES:
- "greeting": hello, thanks, goodbye, small talk. subQueries: [].
- "out_of_scope": ONLY when the question has nothing to do with this university — world news,
  weather, sports, celebrities, general trivia, coding help, or a request to write their essay
  or do their homework. subQueries: [].
  Everything about the university is IN scope, including subjects the scope summary above does
  not spell out: academic regulations, grading, continuous assessment and moderation, exam and
  attendance policy, academic integrity, quality assurance and accreditation, student support,
  hostel rules, clubs, governance and committees, alumni.
  A question that names another college, asks you to compare, or asks "which is right for me"
  is IN scope. The visitor is asking about THIS university's side of their decision, and that
  is what retrieval should go and find.
  When in doubt, never choose out_of_scope. Retrieving and finding nothing is a far better
  failure than refusing a question this website can actually answer.
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
Analytical questions are in scope. A comparison against another institution is in scope too —
plan it as a search for what THIS university offers on the dimensions being compared.

EXPERIENTIAL RULES:
Set "experiential" true when the visitor wants to picture something, not look it up:
- "what is a typical day/week like", "what's it like to study/live here", "what should I expect"
- daily routine, hostel and mess life, weekends, social life, workload, atmosphere, culture
- anything a current student would answer from experience rather than from a page of facts
These are the questions where retrieving only the literal words fails worst. Someone asking
about a typical week is NOT asking for a course list — they are asking how their time is
actually spent, and the answer lives scattered across academics, housing, food, clubs,
sports and weekends.

SUB-QUERY RULES:
- Write them as declarative phrases that would literally appear on a web page, NOT as questions.
  Good: "BTech annual tuition fee category A"   Bad: "How much is the tuition?"
- 1 sub-query for simple, 2-4 for compositional. Never more than 4.
- For an experiential question, use all 4 on DIFFERENT FACETS of the thing being asked
  about — never four rewordings of the same phrase. For "a typical week as a first-year",
  that means one query about class and lab schedules, one about hostel and dining, one
  about clubs, sports and student activities, and one about how students describe the
  experience. Each facet is a different part of the site; a single literal query only ever
  finds one of them, which is how a question about daily life comes back as a course list.
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
    experiential: false,
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
      experiential: parsed.experiential === true,
    };
  } catch (err) {
    console.warn("[planner] failed:", err instanceof Error ? err.message.slice(0, 160) : err);
    return fallbackPlan(message, history);
  }
}
