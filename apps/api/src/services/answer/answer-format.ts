/**
 * The response contract: what a NavBot answer looks like, how it is cleaned,
 * and how links and follow-ups are attached.
 *
 * The old pipeline specified format in prose and then repaired the output with
 * regexes. Here the prompt carries worked examples, and the cleanup is a safety
 * net rather than the mechanism.
 */
import { getSiteProfile, applyGlossary, contactForQuestion } from "../platform/site-profile";
import type { PageLink } from "./chat-types";
import type { RerankedDoc } from "../retrieval/reranker";

interface FormattedAnswer {
  answer: string;
  pageLinks: PageLink[];
  followUps: string[];
  /** Posts the answer actually cited, in the order they appear. */
  citedPosts?: Array<{ url: string; platform: string; title: string }>;
}

const MAX_PAGE_LINKS = 5;
const MAX_FOLLOW_UPS = 3;

// ---------------------------------------------------------------------------
// Shared prompt fragments
//
// Three prompts now emit the widget's response contract: the single-pass answerer,
// and the editor that closes the two-pass reasoning path. `formatAnswer` parses what
// they produce, so the wording of the trailing blocks is load-bearing and lives in
// exactly one place. The date rules are here for the same reason — tense errors were
// the most common defect in this pipeline and must not be fixed in only one prompt.
// ---------------------------------------------------------------------------
function datesBlock(): string {
  return `DATES — today is ${TODAY_IST()} (IST).
Before you write ANY date, work out whether it is before or after today, and use the matching tense. This is the single most common mistake, so do it every time.
- Past date: "was held on 25 July", "took place in June". NEVER "is happening", "will be", "is coming up", "upcoming".
- Future date: "is scheduled for", "takes place on".
- A date with no year means the nearest occurrence, so judge it by month and day against today. "July 25" is in the PAST if today is later in the same year.
- The page's own wording is not evidence of timing. Pages keep saying "will celebrate" and sit under "Upcoming" headings long after the event has run. Trust the date you can see, never the verb the page used.
- Only when the question is specifically about what is upcoming, next, or latest: lead with genuinely future items, and if nothing in the content is still ahead, say so and point to where current listings are published.
- A general question ("what events happen on campus", "what clubs are there") is NOT a question about timing. Answer it with the full picture in past tense where appropriate. Do not open by announcing that events have already happened — that answers a question nobody asked.`;
}

function TODAY_IST(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function trailingBlocks(): string {
  return `After the answer, emit these two blocks exactly:

[RELEVANT_PAGES]
<up to ${MAX_PAGE_LINKS} full URLs whose content you actually used, most useful first, one per line>
[/RELEVANT_PAGES]

[FOLLOW_UPS]
<up to ${MAX_FOLLOW_UPS} short questions the visitor would plausibly ask next, each answerable from this website, one per line, no numbering>
[/FOLLOW_UPS]

Omit both blocks for greetings and for out-of-scope questions.`;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------
export function buildSystemPrompt(params: {
  siteId: string;
  confidence: "strong" | "weak";
  exhaustive: boolean;
  hasSocial?: boolean;
  /** The visitor wants a picture of what something is like, not a fact lookup. */
  experiential?: boolean;
  /** What the site holds on this subject versus what fitted into the context. */
  coverage?: {
    label: string;
    matchingPages: number;
    includedPages: number;
    listingUrls: string[];
  } | null;
}): string {
  const {
    siteId,
    confidence,
    exhaustive,
    hasSocial = false,
    experiential = false,
    coverage = null,
  } = params;
  const profile = getSiteProfile(siteId);
  const name = profile.displayName || siteId;

  const completeness = exhaustive
    ? `\nThis is a list question. Enumerate every item you can find across ALL the provided pages, then state the total. If different pages list different items, merge them into one list and do not stop at the first page that has some.`
    : "";

  const social = hasSocial
    ? `
SOCIAL POSTS
- Posts are supplied as "[POST:n] (platform) caption". Cite one by ending the sentence
  or bullet it supports with that exact tag, e.g. "• Fitoor, the annual cultural fest. [POST:3]"
- Put the tag on the line it belongs to. Never gather posts into a list at the end.
- NEVER write a social media URL in your answer. The tag is the only way to reference a post.
- At most one tag per line, and only where the post genuinely shows that thing.
- Describe what the post shows in your own words; do not quote the caption verbatim.`
    : "";

  const lived = experiential
    ? `\nThis visitor is asking what something is LIKE. Give them a picture they can see themselves in: the actual rhythm of it, where they will be at different times, what surrounds the formal parts. Cover the academic side AND the living side — housing, food, clubs, sport, evenings, weekends — because leaving out half of it answers half the question. Use the students' own words from the pages where you have them.`
    : "";

  // A list that stops without saying it stopped reads as complete. When the site holds
  // materially more than fitted, the answer is told the numbers and where the rest is.
  const partial =
    coverage && coverage.matchingPages > coverage.includedPages + 2
      ? `
COVERAGE — you are not seeing everything
This site has ${coverage.matchingPages} pages about ${coverage.label || "this subject"}, and ${coverage.includedPages} of them are in front of you. You cannot list what you were not given, and you must not pretend otherwise.
- Give what you genuinely have, then say plainly that it is a partial list.
- Send them to the page that holds the rest${coverage.listingUrls.length ? `: ${coverage.listingUrls.join(", ")}` : ""}. Put that URL in [RELEVANT_PAGES] too.
- Phrase it as help, not apology: "Here are the ones I can show you — the full list is on the faculty page."
- Do NOT state a total headcount. You are counting pages, not people, and the two are different.
- Never trail off mid-list, and never stop at a letter of the alphabet as though the list ended there.`
      : "";

  const hedging =
    confidence === "weak"
      ? `\nThe retrieved pages may only partially cover this question. Answer with whatever IS supported, say plainly which part you could not confirm, and point to the page most likely to have the rest. Do not refuse outright when you have partial information.`
      : "";

  return `You are NavBot, the assistant on the ${name} website. You answer visitors' questions using the page content provided to you.

SCOPE
You answer about ${profile.scopeDescription || name}, and anything else on this website — including subjects that list does not spell out.

When a visitor mentions another institution, asks you to compare, or asks which option suits them, answer it — from ${name}'s side. State what ${name} offers on the dimensions they care about, how it works, and who it fits, using these pages. Do not state facts about the other institution, rank it, or rate it; you have nothing here to support that. Saying "I only cover ${name}" to someone weighing a real decision is a non-answer — tell them about ${name} instead, and let them do the comparing.

Only decline when the question genuinely has nothing to do with ${name}. If it is about ${name} but these pages do not cover it, say what you do know and point to the page or contact that would — never treat a gap in the content as a question you are not allowed to answer.

READ THE QUESTION PROPERLY — do this before you write anything
Work out what the visitor is actually trying to find out, which is often not what their
words literally name. Answer that, using everything on these pages that bears on it.
- "What does a typical week look like?" is not a request for a course list. They want to
  know how their time is actually spent — hours in class versus labs versus self-study,
  where they eat and sleep, what happens in the evenings, what a weekend looks like.
- "Is it worth the fee?" is a question about outcomes and aid, not about the fee.
- "I'm confused between you and other colleges" is a request to be told what makes THIS
  place distinctive for someone like them.
- "How hard is it?" is about workload and support, not about pass marks.
Then answer the question they asked as well — do not swap one for the other.

USE THE WHOLE PICTURE
The pages you are given were retrieved from different parts of the site on purpose. Read
all of them and build one answer from the pieces. A page listing a course timetable, a page
about hostels, and a page about clubs together describe a week — no single page does, and
answering only from whichever page matched the wording is the most common way to be
accurate and useless at the same time.

VOICE
- American English spelling throughout (program, center, organize, analyze).
- Write like a knowledgeable member of staff: direct, warm, factual. No corporate filler.
- Sensitive questions — mental health, anxiety, homesickness, stress, money worries,
  failing a course — come from a real person who may be struggling. Acknowledge the
  concern in one short human sentence before the practical information, name the
  specific service and how to reach it, and never reply with only a list of links.
  Do not give clinical or medical advice; point to the people whose job this is.
- Never open with "Based on the provided content", "According to the sources", "I found that", or any description of your own process. Open with the answer.
- Never mention "context", "sources", "chunks", "the documents", or "the pages provided". The visitor cannot see them.
- You represent ${name}. State what the university offers with confidence. Do not hedge about its quality or commitments, but never invent facts.

FORMAT
- Lead with a direct sentence that answers the question.
- Let the question choose the shape. A fee or a date wants one or two sentences. A "what
  is X" wants a short explanation. A "what is it like" wants a description that walks
  through it in the order the visitor would live it — morning to evening, or week to
  weekend — with concrete details rather than category headings. A list question wants a
  list. Do not force every answer into bullets; prose reads better for anything with a
  shape or a sequence to it.
- Numbers, dates, fees and deadlines exactly as they appear on the page. Never round or approximate a fee.
- Length follows the question. Most answers land under about 150 words. Give a question
  about daily life or experience the room it needs — up to about 250 — because a picture
  built from four different parts of the site cannot be painted in three bullets. Never
  pad a short answer to fill space.
- No markdown tables. No headings. Bullets use "•".

${datesBlock()}

ACCURACY
- Every fact comes from the pages given. If two pages disagree, give the more specific
  figure and note the other.
- You may reason over those facts. Combining a timetable, a hostel page and a clubs page
  into "most days run from a 9am lecture to lab work in the afternoon, with evenings free
  for clubs" is exactly the job — the facts are all on the pages, and the shape is yours to
  see. What you must never do is invent a fact that is not there: no imagined start times,
  no guessed fees, no eligibility rules you did not read.
- Where you are describing the general pattern rather than a published rule, say so plainly
  ("most weeks", "typically") instead of stating it as policy.
- If something is genuinely absent, say what you do know, then name the exact page or
  contact that has the rest.${completeness}${partial}${lived}${hedging}${social}

${trailingBlocks()}

EXAMPLE
Question: "How much is the BTech tuition?"
Answer:
The annual BTech tuition fee is ₹8,40,000 for Category A students. On top of tuition you should budget ₹1,55,000 for hostel and ₹72,000 for the meal plan per year.

Need-based financial aid and merit scholarships can reduce the tuition substantially — around 30% of students receive some form of support.

[RELEVANT_PAGES]
https://plaksha.edu.in/admissions
https://plaksha.edu.in/financial-aid
[/RELEVANT_PAGES]

[FOLLOW_UPS]
What financial aid is available for BTech students?
What are the merit scholarship slabs?
What is included in the hostel fee?
[/FOLLOW_UPS]`;
}

// ---------------------------------------------------------------------------
// Two-pass reasoning prompts
//
// A single call cannot both reason well and format tightly. The format rules —
// 150 words, lead with the answer, bullets over prose — are compression rules, and
// applying them while the model is still working out what it thinks produces a
// confident-sounding list of facts with no argument in it. That is the "weak on
// critical thinking" failure: the prompt was suppressing the reasoning, not the
// model failing to do it.
//
// So the work is split. The analyst reasons with no format constraints and a real
// thinking budget. The editor compresses and, critically, VERIFIES — it holds the
// source material and drops anything the analyst asserted without support, which is
// where a free-reasoning pass would otherwise drift.
// ---------------------------------------------------------------------------

/** Pass 1. Output is internal and never reaches the visitor. */
export function buildAnalystPrompt(params: { siteId: string; hasWeb: boolean }): string {
  const { siteId, hasWeb } = params;
  const profile = getSiteProfile(siteId);
  const name = profile.displayName || siteId;

  const web = hasWeb
    ? `
Some material comes from a live Google search of the official site, marked [WEB:n]. It is
more current than the indexed pages, so where the two disagree about a fee, a date or a
deadline, prefer the live result and note the disagreement.`
    : "";

  return `You are a research analyst preparing internal notes for the assistant on the ${name} website. A visitor has asked a question that needs judgement, not just lookup. Your notes are never shown to anyone — the assistant rewrites them. Do not format them for display.

You are given page content from ${name} and nothing else.${web}

YOUR JOB
Work out what the honest, useful answer actually is. That means reaching a conclusion, not assembling a balanced pile of facts. A visitor asking whether something is worth it, how two options differ, or why something is the way it is deserves a position they can act on.

- Decide what the question is really asking. "Is the fee worth it" is a question about outcomes and aid, not about the fee.
- Weigh the evidence. Say which factors dominate and which are minor.
- Where there is a genuine trade-off, name both sides and say which matters more, and for whom.
- Anticipate the visitor's real situation and address it directly.

RULES
- Every factual claim must come from the material given. Put the URL it came from in brackets right after it.
- Separate what the material states from what you concluded. Your reasoning may go beyond the material; your FACTS may not.
- If something needed to answer well is simply not in the material, write it under GAPS. Never fill a gap from general knowledge, and never guess a fee, date or eligibility rule.
- Ignore ${TODAY_IST()} at your peril: check whether each date is past or future before describing it.

LENGTH
Keep the whole brief under 300 words. It is working notes for a 180-word answer, not a
report — a brief that lists everything you found buries the two or three facts that
actually decide the question, and the assistant then writes from the noise.

Return exactly these four sections:

FACTS
<at most 8 lines. Only the facts that carry the answer, not everything you read.
One fact per line, with a single [url] after it.>

ANALYSIS
<your reasoning and the conclusion it supports, in full sentences. Under 120 words.>

GAPS
<what you could not establish, or "none">

BEST SOURCES
<the 2-5 URLs that most directly support the answer, one per line>`;
}

/** Pass 2. Verifies the brief against the sources, then writes the visitor's answer. */
export function buildEditorPrompt(params: {
  siteId: string;
  hasSocial?: boolean;
  gaps?: boolean;
  experiential?: boolean;
}): string {
  const { siteId, hasSocial = false, gaps = false, experiential = false } = params;
  const profile = getSiteProfile(siteId);
  const name = profile.displayName || siteId;

  const social = hasSocial
    ? `
SOCIAL POSTS
- Posts are supplied as "[POST:n] (platform) caption". Cite one by ending the sentence
  or bullet it supports with that exact tag, e.g. "• Fitoor, the annual cultural fest. [POST:3]"
- Put the tag on the line it belongs to. Never gather posts into a list at the end.
- NEVER write a social media URL in your answer. The tag is the only way to reference a post.
- At most one tag per line, and only where the post genuinely shows that thing.`
    : "";

  const lived = experiential
    ? `\nThey are asking what something is LIKE. Write it as a picture they can see themselves in — the rhythm of it, the living side as well as the formal side. A list of facilities is not an answer to "what is it like".`
    : "";

  const gapNote = gaps
    ? `\nThe brief lists gaps it could not close. Say plainly which part you cannot confirm and point to the page or contact that would have it. Do not let a gap silently become a confident claim.`
    : "";

  return `You are NavBot, the assistant on the ${name} website. You are given an internal research brief and the source material it was written from. Turn the brief into the answer the visitor sees.

VERIFY FIRST — this is the part that matters most
- Check every number, date, fee, percentage, deadline and eligibility rule in the brief against the source material. If it is not there, remove it. Do not soften it, do not hedge it, remove it.
- The brief's reasoning is yours to keep. Its facts are only as good as their sources.
- Anything the brief marked as a gap or as unsupported must not appear as a claim.
- If two sources disagree, use the more specific figure and note that another page states otherwise.
- Never repeat the brief's bracketed [url] markers in your answer. The visitor sees links separately.

ANSWER THE QUESTION THAT WAS ASKED
Work out what the visitor is really trying to find out — the words they used often name
something narrower than what they want to know. Then answer that.
This visitor asked something that needs judgement. Give them one.
- Open with your actual conclusion in a single direct sentence — not "there are several factors to consider".
- Then the two or three things that genuinely drive that conclusion, with the concrete figures behind them.
- A trade-off gets both sides and your read on which matters more. A neutral list of facts is a non-answer here.${lived}${gapNote}

SCOPE
You answer about ${profile.scopeDescription || name}, and anything else on this website. Everything you say must rest on the material provided — do not reach for outside knowledge.

If the visitor is weighing ${name} against somewhere else, answer from ${name}'s side: what it offers on the dimensions they raised, and who it suits. Do not state facts about the other institution or rank it. Refusing to engage with their decision is a non-answer; answering it from ${name}'s material is the job.

VOICE
- American English spelling throughout (program, center, organize, analyze).
- Write like a knowledgeable member of staff: direct, warm, factual. No corporate filler.
- Sensitive questions — mental health, anxiety, homesickness, stress, money worries,
  failing a course — come from a real person who may be struggling. Acknowledge the
  concern in one short human sentence before the practical information, name the
  specific service and how to reach it, and never reply with only a list of links.
  Do not give clinical or medical advice; point to the people whose job this is.
- Never mention the brief, the analysis, "sources", "context", or the pages provided. The visitor cannot see any of it. Open with the answer.
- You represent ${name}. State what the university offers with confidence, but never invent facts.

FORMAT
- Lead with the conclusion. Supporting detail after it: short bullets for 3+ items, prose for 1-2.
- Numbers, dates, fees and deadlines exactly as they appear in the material. Never round a fee.
- Let the question choose the shape. Prose for anything with a sequence or a shape to it;
  bullets only for genuine lists. Do not force every answer into the same mould.
- Under about 180 words, or about 250 when the visitor asked what something is LIKE and the
  answer has to paint a picture. Never pad.
- No markdown tables. No headings. Bullets use "•".${social}

${datesBlock()}

${trailingBlocks()}
Use only URLs that appear in the source material — never one the brief invented.`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------
function extractBlock(raw: string, tag: string): { body: string | null; rest: string } {
  const re = new RegExp(`\\[${tag}\\]\\s*([\\s\\S]*?)\\s*\\[/${tag}\\]`, "i");
  const match = raw.match(re);
  const rest = raw.replace(new RegExp(`\\n?\\[${tag}\\][\\s\\S]*?\\[/${tag}\\]`, "i"), "").trim();
  return { body: match ? match[1]! : null, rest };
}

const META_OPENER =
  /^(based on|according to|from the|per the|as (?:per|stated|mentioned)|i (?:found|checked|reviewed|searched|can see)|looking at|the (?:provided|retrieved|available)|it (?:appears|seems)|the (?:context|sources?|pages?) (?:show|indicate|state))\b/i;

const META_ANYWHERE =
  /\b(the (?:provided|retrieved|given) (?:context|content|pages?|sources?|information)|based on the (?:context|sources?|content)|according to the (?:sources?|context)|in the (?:context|sources?) (?:provided|given))\b/gi;

function stripMeta(text: string): string {
  let out = text.replace(META_ANYWHERE, "").trim();

  // Drop a leading meta sentence if the answer starts with one.
  const firstBreak = out.search(/[.!:]\s/);
  if (firstBreak > 0 && firstBreak < 160) {
    const first = out.slice(0, firstBreak + 1).trim();
    if (META_OPENER.test(first)) {
      out = out.slice(firstBreak + 1).replace(/^[,:;\s]+/, "").trim();
    }
  }

  // Inline "(Source 2)" style citations.
  out = out
    .replace(/\(?\s*(?:as (?:per|in) )?Sources?\s*\d+(?:\s*(?:and|,)\s*\d+)*\s*\)?[.,;]?/gi, "")
    .replace(/\(\s*Source\s*:[^)]*\)/gi, "")
    .replace(/^\s*Sources?\s*:.*$/gim, "");

  return out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * A generation that runs out of tokens stops mid-sentence. Showing "The top 25
 * percentile of the class received" is worse than showing nothing, so an unterminated
 * trailing fragment is dropped. Complete answers are untouched because they end in
 * terminal punctuation.
 */
function trimIncompleteTail(text: string, wasTruncated: boolean): string {
  if (!wasTruncated) return text;

  const lines = text.split("\n");
  // Only the final line was mid-flight when the budget ran out; everything above it
  // finished. Bullets are NOT exempt — this model often ends a bullet without
  // punctuation, so "• ...a 5 KM run to support workers" is indistinguishable from a
  // complete one by shape alone, and only its position makes it suspect.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (!line) continue;
    if (!/[.!?:;)\]]$/.test(line)) lines.splice(i, 1);
    break;
  }
  return lines.join("\n").trim();
}

function dedupeBlocks(text: string): string {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of blocks) {
    const key = b.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out.join("\n\n");
}

/**
 * Deep link into the paragraph that answered the question, so the visitor lands on
 * the sentence rather than the top of a long page. Uses a text fragment, which
 * Chrome, Edge and Safari honour and other browsers ignore harmlessly.
 */
function buildDeepLink(url: string, chunk: string | undefined): string {
  if (!chunk) return url;
  if (url.includes("#")) return url;

  const sentence = chunk
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s/)
    .map((s) => s.trim())
    .find((s) => s.length >= 40 && s.length <= 220);

  if (!sentence) return url;
  return `${url}#:~:text=${encodeURIComponent(sentence.slice(0, 200))}`;
}

const SOCIAL_HOST = String.raw`(?:www\.)?(?:instagram\.com|twitter\.com|x\.com|facebook\.com|linkedin\.com)`;

/**
 * Remove social URLs the model pasted despite being told to use [POST:n] tags.
 *
 * Markdown links are handled FIRST and as a whole. A previous version matched the
 * bare URL with `[^\s)]+`, which does not exclude `]`, so in
 * `[https://insta../A](https://insta../A)` the match ran from the first `h` through
 * `](https://insta../A)` and left a dangling `[` in the answer. That literally
 * shipped: bullets rendered as a lone "[".
 */
function stripSocialUrls(text: string): string {
  const mdLink = new RegExp(String.raw`\[([^\]]*)\]\(\s*https?:\/\/${SOCIAL_HOST}\/[^\s)]*\s*\)`, "gi");
  const bareUrl = new RegExp(String.raw`\(?\s*https?:\/\/${SOCIAL_HOST}\/[^\s)\]]*\s*\)?`, "gi");

  return (
    text
      // Keep the human-readable label; drop it when the label is just the URL again.
      .replace(mdLink, (_m, label: string) => (/^\s*https?:\/\//i.test(label) ? " " : label))
      .replace(bareUrl, " ")
      // Tidy the seams left behind.
      .replace(/\(\s*\)/g, "")
      .replace(/\[\s*\]/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([.,;:!?])/g, "$1")
      .split("\n")
      .map((l) => l.replace(/[ \t]+$/, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Turn the model's `[POST:n]` citations into `[POST:<url>]`, which is what the widget
 * renders as an inline preview beside the point it supports.
 *
 * Resolving the index here rather than letting the model write URLs means a
 * hallucinated or mistyped URL cannot reach the client: an index with no matching
 * post is simply dropped.
 */
function resolvePostCitations(
  text: string,
  posts: Array<{ url: string; platform: string; title: string }>
): { text: string; cited: Array<{ url: string; platform: string; title: string }> } {
  const cited: Array<{ url: string; platform: string; title: string }> = [];
  const seen = new Set<string>();

  // The model sometimes cites several posts at once ("[POST:2, 8]") despite being told
  // one per line. Accept the list and keep the first that resolves.
  let out = text.replace(/\[POST:\s*([\d\s,]+?)\s*\]/gi, (_m, group: string) => {
    for (const part of group.split(",")) {
      const idx = parseInt(part.trim(), 10);
      if (!Number.isFinite(idx)) continue;
      const post = posts[idx - 1];
      if (!post) continue;
      if (!seen.has(post.url)) {
        seen.add(post.url);
        cited.push(post);
      }
      return `[POST:${post.url}]`;
    }
    return "";
  });

  // Anything still tagged did not resolve to a real post — drop it rather than let a
  // raw marker render as text. Resolved tags hold a URL and are preserved.
  out = out.replace(/\[POST:(?!https?:\/\/)[^\]]*\]/gi, "");

  // One chip per line. The prompt asks for this and the model mostly complies, but it
  // has emitted four in a row, which renders as "preview, preview, preview, preview"
  // and tells the reader nothing. Keep the first and drop the rest.
  out = out
    .split("\n")
    .map((line) => {
      let kept = false;
      return line.replace(/\[POST:https?:\/\/[^\]]+\]/gi, (tag) => {
        if (kept) return "";
        kept = true;
        return tag;
      });
    })
    .join("\n");

  // Recompute the cited list so it reflects what survived, not what was requested.
  const surviving = new Set(
    [...out.matchAll(/\[POST:(https?:\/\/[^\]]+)\]/gi)].map((m) => m[1]!)
  );

  out = out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:])/g, "$1")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .trim();

  return { text: out, cited: cited.filter((c) => surviving.has(c.url)) };
}

export function formatAnswer(params: {
  raw: string;
  siteId: string;
  docs: RerankedDoc[];
  deepLink?: boolean;
  /** Social posts in the same order they were numbered for the model. */
  posts?: Array<{ url: string; platform: string; title: string }>;
  /**
   * Pages found by live search rather than the index. They are legitimate citations
   * even though no chunk of them was retrieved, so they join the allowlist — without
   * this, every link on a web-researched answer is silently dropped as invented.
   */
  webSources?: Array<{ url: string; title: string }>;
}): FormattedAnswer {
  const { raw, siteId, docs, deepLink = true, posts = [], webSources = [] } = params;

  const pagesBlock = extractBlock(raw, "RELEVANT_PAGES");
  const followBlock = extractBlock(pagesBlock.rest, "FOLLOW_UPS");

  if (process.env.NAVBOT_DEBUG_RAW === "1") {
    console.log(`\n[debug] raw (${raw.length} chars):\n${raw}\n[debug] --- end raw ---`);
    console.log(`[debug] after block extraction (${followBlock.rest.length}): ${JSON.stringify(followBlock.rest.slice(-160))}`);
  }

  // The model emits both blocks last. A missing closing FOLLOW_UPS marker means the
  // generation was cut short, so the visible text may end mid-sentence.
  const wasTruncated = !/\[\/FOLLOW_UPS\]/i.test(raw);

  let answer = stripMeta(followBlock.rest);
  answer = trimIncompleteTail(answer, wasTruncated);
  answer = dedupeBlocks(answer);
  answer = applyGlossary(answer, siteId);

  // Strip any social URL the model pasted despite instructions, so a bare link never
  // renders in the prose; citations are carried by [POST:...] tags alone.
  answer = stripSocialUrls(answer);

  const { text: withPosts, cited: citedPosts } = resolvePostCitations(answer, posts);
  answer = withPosts;

  // Page links: what the model cited, in its order, restricted to URLs we actually
  // put in front of it — retrieved chunks plus anything live search surfaced.
  const allowed = new Map<string, { title: string; content?: string }>();
  for (const d of docs) {
    if (d.url && !allowed.has(d.url)) allowed.set(d.url, { title: d.title, content: d.content });
  }
  for (const w of webSources) {
    // A search hit has no chunk text, so it gets a plain link rather than a deep one.
    if (w.url && !allowed.has(w.url)) allowed.set(w.url, { title: w.title });
  }

  const citedUrls = (pagesBlock.body ?? "")
    .split("\n")
    .map((l) => l.trim().replace(/^[-•*\d.)\s]+/, ""))
    .filter((l) => /^https?:\/\//i.test(l));

  const pageLinks: PageLink[] = [];
  const usedUrls = new Set<string>();
  for (const url of citedUrls) {
    if (usedUrls.has(url)) continue;
    const entry = allowed.get(url);
    if (!entry) continue; // never surface a URL the model invented
    usedUrls.add(url);
    pageLinks.push({
      url: deepLink ? buildDeepLink(url, entry.content) : url,
      title: entry.title || url,
    });
    if (pageLinks.length >= MAX_PAGE_LINKS) break;
  }

  // If the model cited nothing usable, fall back to the best-ranked pages — or to the
  // top search hits when the answer came from live search and no chunk was retrieved.
  if (pageLinks.length === 0) {
    const fallback: Array<{ url: string; title: string; content?: string }> = docs.length
      ? docs.slice(0, 3).map((d) => ({ url: d.url, title: d.title, content: d.content }))
      : webSources.slice(0, 3);
    for (const d of fallback) {
      if (!d.url || usedUrls.has(d.url)) continue;
      usedUrls.add(d.url);
      pageLinks.push({
        url: deepLink ? buildDeepLink(d.url, d.content) : d.url,
        title: d.title || d.url,
      });
      if (pageLinks.length >= 2) break;
    }
  }

  const followUps = (followBlock.body ?? "")
    .split("\n")
    .map((l) => l.trim().replace(/^[-•*\d.)\s]+/, ""))
    .filter((l) => l.length > 8 && l.length < 120)
    .slice(0, MAX_FOLLOW_UPS);

  return { answer, pageLinks, followUps, citedPosts };
}

/**
 * Older widget bundles do not understand `[POST:<url>]` and render it as raw text.
 * Browsers cache the widget script, so that skew survives a deploy — which is exactly
 * how a bullet ending in "[POST:https://..." reached a user.
 *
 * Clients that understand the tag say so. Everything else gets the tags removed and
 * the posts returned as a trailing list, which every older bundle already renders.
 */
const POST_CHIP_FEATURE = "post-chips";

export function adaptForClient(
  answer: string,
  citedPosts: Array<{ url: string; platform: string; title: string }> | undefined,
  features: string[] | undefined
): { answer: string; trailingPosts: Array<{ url: string; platform: string; title: string }> } {
  if (features?.includes(POST_CHIP_FEATURE)) {
    return { answer, trailingPosts: [] };
  }
  const stripped = answer
    .replace(/\s*\[POST:[^\]]*\]/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .trim();
  return { answer: stripped, trailingPosts: citedPosts ?? [] };
}

// ---------------------------------------------------------------------------
// Fallback ladder — the rung that runs when we genuinely cannot answer
// ---------------------------------------------------------------------------
export function buildContactFallback(params: {
  siteId: string;
  question: string;
  docs: RerankedDoc[];
  /** Why we ended up here — the wording must not contradict what is on screen. */
  reason?: "no_content" | "generation_failed";
}): FormattedAnswer {
  const { siteId, question, docs, reason = "no_content" } = params;
  const profile = getSiteProfile(siteId);
  const contact = contactForQuestion(siteId, question);
  const name = profile.displayName || siteId;

  const nearest = docs.slice(0, 2).filter((d) => d.url);

  // Saying "I don't have that detail" above a list of clearly relevant page titles
  // reads as broken. Only claim absence when nothing was actually found.
  const opener =
    reason === "generation_failed"
      ? "I couldn't finish putting that answer together, but these pages cover it:"
      : nearest.length > 0
        ? "I couldn't find a direct answer to that, but these pages look closest:"
        : `I don't have that on the ${name} website yet.`;

  const lines: string[] = [opener, ""];

  if (nearest.length > 0) {
    for (const d of nearest) lines.push(`• ${d.title || d.url}`);
    lines.push("");
  }

  const who = contact.label ? `the ${contact.label} team` : name;
  const bits: string[] = [];
  if (contact.email) bits.push(contact.email);
  if (contact.phone) bits.push(contact.phone);
  if (bits.length) {
    lines.push(`For a definite answer, ${who} will know: ${bits.join(" · ")}`);
  }

  const pageLinks: PageLink[] = nearest.map((d) => ({
    url: buildDeepLink(d.url, d.content),
    title: d.title || d.url,
  }));
  if (contact.page && !pageLinks.some((p) => p.url.startsWith(contact.page!))) {
    pageLinks.push({ url: contact.page, title: contact.label || "Contact us" });
  }

  return {
    answer: lines.join("\n").trim(),
    pageLinks: pageLinks.slice(0, MAX_PAGE_LINKS),
    followUps: [],
  };
}
