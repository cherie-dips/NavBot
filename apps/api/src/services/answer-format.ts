/**
 * The response contract: what a NavBot answer looks like, how it is cleaned,
 * and how links and follow-ups are attached.
 *
 * The old pipeline specified format in prose and then repaired the output with
 * regexes. Here the prompt carries worked examples, and the cleanup is a safety
 * net rather than the mechanism.
 */
import { getSiteProfile, applyGlossary, contactForQuestion } from "./site-profile";
import type { PageLink } from "./chat-types";
import type { RerankedDoc } from "./reranker";

export interface FormattedAnswer {
  answer: string;
  pageLinks: PageLink[];
  followUps: string[];
  /** Posts the answer actually cited, in the order they appear. */
  citedPosts?: Array<{ url: string; platform: string; title: string }>;
}

const MAX_PAGE_LINKS = 5;
const MAX_FOLLOW_UPS = 3;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------
export function buildSystemPrompt(params: {
  siteId: string;
  confidence: "strong" | "weak";
  exhaustive: boolean;
  hasSocial?: boolean;
}): string {
  const { siteId, confidence, exhaustive, hasSocial = false } = params;
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

  const hedging =
    confidence === "weak"
      ? `\nThe retrieved pages may only partially cover this question. Answer with whatever IS supported, say plainly which part you could not confirm, and point to the page most likely to have the rest. Do not refuse outright when you have partial information.`
      : "";

  return `You are NavBot, the assistant on the ${name} website. You answer visitors' questions using the page content provided to you.

SCOPE
You answer about ${profile.scopeDescription || name}. For anything outside that, say briefly that you only cover ${name} and offer what you can help with instead — do not answer from outside knowledge, and do not compare ${name} against other institutions using facts that are not on these pages.

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
- Then supporting detail: short bullets for 3+ items, prose for 1-2.
- Numbers, dates, fees and deadlines exactly as they appear on the page. Never round or approximate a fee.
- Keep it under about 150 words unless the question genuinely needs more. This is a chat widget.
- No markdown tables. No headings. Bullets use "•".

DATES — today is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata" })} (IST).
Before you write ANY date, work out whether it is before or after today, and use the matching tense. This is the single most common mistake, so do it every time.
- Past date: "was held on 25 July", "took place in June". NEVER "is happening", "will be", "is coming up", "upcoming".
- Future date: "is scheduled for", "takes place on".
- A date with no year means the nearest occurrence, so judge it by month and day against today. "July 25" is in the PAST if today is later in the same year.
- The page's own wording is not evidence of timing. Pages keep saying "will celebrate" and sit under "Upcoming" headings long after the event has run. Trust the date you can see, never the verb the page used.
- Only when the question is specifically about what is upcoming, next, or latest: lead with genuinely future items, and if nothing in the content is still ahead, say so and point to where current listings are published.
- A general question ("what events happen on campus", "what clubs are there") is NOT a question about timing. Answer it with the full picture in past tense where appropriate. Do not open by announcing that events have already happened — that answers a question nobody asked.

ACCURACY
- Use only the page content given. If two pages disagree, give the more specific figure and note the other.
- Combine facts across pages into one answer — the answer to a question is often split across several pages.
- If a fact is genuinely absent, say what you do know, then name the exact page or contact that has the rest.
- Never state a fee, deadline, or eligibility rule that is not written in the content.${completeness}${hedging}${social}

After the answer, emit these two blocks exactly:

[RELEVANT_PAGES]
<up to ${MAX_PAGE_LINKS} full URLs whose content you actually used, most useful first, one per line>
[/RELEVANT_PAGES]

[FOLLOW_UPS]
<up to ${MAX_FOLLOW_UPS} short questions the visitor would plausibly ask next, each answerable from this website, one per line, no numbering>
[/FOLLOW_UPS]

Omit both blocks for greetings and for out-of-scope questions.

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
export function buildDeepLink(url: string, chunk: string | undefined): string {
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
}): FormattedAnswer {
  const { raw, siteId, docs, deepLink = true, posts = [] } = params;

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

  // Page links: what the model cited, in its order, restricted to real retrieved URLs.
  const retrievedByUrl = new Map<string, RerankedDoc>();
  for (const d of docs) {
    if (d.url && !retrievedByUrl.has(d.url)) retrievedByUrl.set(d.url, d);
  }

  const citedUrls = (pagesBlock.body ?? "")
    .split("\n")
    .map((l) => l.trim().replace(/^[-•*\d.)\s]+/, ""))
    .filter((l) => /^https?:\/\//i.test(l));

  const pageLinks: PageLink[] = [];
  const usedUrls = new Set<string>();
  for (const url of citedUrls) {
    if (usedUrls.has(url)) continue;
    const doc = retrievedByUrl.get(url);
    if (!doc) continue; // never surface a URL the model invented
    usedUrls.add(url);
    pageLinks.push({
      url: deepLink ? buildDeepLink(url, doc.content) : url,
      title: doc.title || url,
    });
    if (pageLinks.length >= MAX_PAGE_LINKS) break;
  }

  // If the model cited nothing usable, fall back to the best-ranked pages.
  if (pageLinks.length === 0) {
    for (const d of docs.slice(0, 3)) {
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
export const POST_CHIP_FEATURE = "post-chips";

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
