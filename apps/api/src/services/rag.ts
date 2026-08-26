/**
 * NavBot RAG pipeline.
 *
 * Flow:
 *   1. curated answer (site owner's own words) or semantic cache — return immediately
 *   2. plan the query and retrieve a baseline in parallel, so planner latency is hidden
 *   3. retrieve -> strip boilerplate -> rerank
 *   4. generate against a small, high-signal context
 *   5. degrade gracefully rather than ever returning a bare error
 */
import {
  hasSocialIntent,
  searchSocialMedia,
  buildSocialContextString,
  socialProfileLinks,
  type SocialSearchResult,
} from "./social-search";
import { getFaqUserAnswerForQuestion, getRagCache, setRagCache } from "./db";
import { runRetrieval } from "./agentic-retrieval";
import { planQuery, fallbackPlan, type QueryPlan } from "./query-planner";
import {
  buildSystemPrompt,
  buildAnalystPrompt,
  buildEditorPrompt,
  formatAnswer,
  buildContactFallback,
  adaptForClient,
} from "./answer-format";
import { researchWeb, buildWebContextString, type WebResearch } from "./web-research";
import { getSiteProfile, applyGlossary } from "./site-profile";
import type { RerankedDoc } from "./reranker";
import type { ChatHistoryItem, PageLink, SocialLink, ChatAnswer } from "./chat-types";
import {
  withRetry,
  getGeminiApiKey,
  getGoogleGenAI,
  GEMINI_MODELS,
  generateContentText,
  generateContentStream,
} from "./gemini-client";

if (!getGeminiApiKey()) {
  console.warn("GEMINI_API_KEY is not set. Chat, STT, and TTS will not work.");
}

/**
 * Context handed to the model. The old budget was 128,000 characters, which was the
 * dominant cost in time-to-first-token and mostly filled with boilerplate. After
 * dedup and reranking, ~18k of high-signal content answers more questions, faster.
 */
const CONTEXT_BUDGET_CHARS = 18_000;
const MAX_CHARS_PER_CHUNK = 1_800;
const ANSWER_MAX_TOKENS = 1_100;
/**
 * The analyst reasons without format constraints, but not without a length limit.
 * Measured on this pipeline: latency here tracks OUTPUT length, not thinking depth —
 * "low" and "high" reasoning both took ~17s when the brief ran to its old 1,500-token
 * cap. Capping the brief is therefore the only lever that actually buys time back,
 * and a shorter brief also speeds the editor pass that has to read it.
 */
const ANALYST_MAX_TOKENS = 1_000;
const EDITOR_MAX_TOKENS = 1_100;

/**
 * When to spend a live search on a question.
 *
 *   "analytical" (default) — judgement questions, plus anything the index answered
 *       weakly. These are the two cases where a stale or incomplete crawl actually
 *       changes the answer.
 *   "weak"   — only when retrieval came back weak or empty.
 *   "always" — every question. Most consistent, slowest, one search credit per turn.
 *   "off"    — never; the pipeline behaves exactly as it did before.
 */
type WebMode = "analytical" | "weak" | "always" | "off";

function webMode(): WebMode {
  const raw = process.env.NAVBOT_WEB_MODE?.trim().toLowerCase();
  if (raw === "weak" || raw === "always" || raw === "off") return raw;
  return "analytical";
}

/**
 * Two-pass reasoning is orthogonal to search: it is about how the answer is written,
 * not where the facts came from. "off" restores the previous single-call behaviour.
 */
function reasoningEnabled(): boolean {
  return process.env.NAVBOT_REASONING?.trim().toLowerCase() !== "off";
}

/**
 * Benchmarks must exercise the real pipeline, not replay answers a previous run
 * cached. Set NAVBOT_DISABLE_CACHE=1 when measuring.
 */
const CACHE_DISABLED = process.env.NAVBOT_DISABLE_CACHE === "1";

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------
function titleFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    const last = path.split("/").filter(Boolean).pop();
    if (!last) return url;
    return last.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return url;
  }
}

/**
 * Many Plaksha pages carry the site-wide title ("Welcome To Plaksha"), which tells
 * the model nothing about which page it is reading. Fall back to the URL slug.
 */
function resolveTitle(title: string, url: string, siteId: string): string {
  if (!title) return titleFromUrl(url);
  const norm = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const site = siteId.replace(/\./g, " ").toLowerCase();
  const generic =
    norm.length < 4 ||
    norm === "home" ||
    norm === "homepage" ||
    norm.startsWith("welcome") ||
    norm === site ||
    norm === `welcome to ${site}` ||
    norm.includes("reimagining tech education");
  return generic ? titleFromUrl(url) : title;
}

/**
 * Assemble the context, and report what would not fit.
 *
 * This used to drop overflowing pages with a bare `break`, which is how a faculty list
 * stopped at "M" with nothing anywhere saying a third of the evidence had been cut.
 * The count travels with the context so the answer can admit the gap.
 */
function buildContextWithCoverage(
  docs: RerankedDoc[],
  siteId: string
): { context: string; includedPages: number; droppedPages: number } {
  const byUrl = new Map<string, { title: string; url: string; chunks: string[] }>();
  for (const d of docs) {
    const key = d.url || d.id;
    const entry = byUrl.get(key) ?? {
      title: resolveTitle(d.title, d.url, siteId),
      url: d.url,
      chunks: [],
    };
    entry.chunks.push(d.content.slice(0, MAX_CHARS_PER_CHUNK).trim());
    byUrl.set(key, entry);
  }

  const blocks: string[] = [];
  let total = 0;
  let dropped = 0;
  for (const { title, url, chunks } of byUrl.values()) {
    const block = `## ${title}\n${url}\n\n${chunks.join("\n\n")}`;
    if (total + block.length > CONTEXT_BUDGET_CHARS && blocks.length > 0) {
      dropped++;
      continue; // keep counting, so the answer knows how much it could not see
    }
    blocks.push(block);
    total += block.length;
  }

  return { context: blocks.join("\n\n---\n\n"), includedPages: blocks.length, droppedPages: dropped };
}

/** Most callers only want the text. */
function buildContext(docs: RerankedDoc[], siteId: string): string {
  return buildContextWithCoverage(docs, siteId).context;
}

/**
 * Live results are labelled rather than blended into the page context. The model has
 * to be able to tell them apart: when the index and the live site disagree about a
 * fee, the live one wins, and it cannot apply that rule if both look the same.
 */
function buildWebSection(research: WebResearch | null): string {
  if (!research || research.provider === "none") return "";
  const body = buildWebContextString(research);
  if (!body) return "";
  return `${body}\n\n(These came from a Google search of the official site just now, so where they disagree with the page content above, they are more current.)`;
}

function dedupeSources(docs: RerankedDoc[], siteId: string) {
  const seen = new Map<string, { url: string; title: string; distance?: number }>();
  for (const d of docs) {
    if (d.url && !seen.has(d.url)) {
      seen.set(d.url, {
        url: d.url,
        title: resolveTitle(d.title, d.url, siteId),
        distance: d.distance,
      });
    }
  }
  return [...seen.values()];
}

function buildContents(params: {
  context: string;
  socialContext: string;
  history: ChatHistoryItem[];
  message: string;
  webContext?: string;
}) {
  const { context, socialContext, history, message, webContext = "" } = params;

  let contextMessage = `Page content from the website:\n\n${context}`;
  if (webContext) {
    contextMessage += `\n\n---\n\n${webContext}`;
  }
  if (socialContext) {
    contextMessage += `\n\n---\n\nRecent social media posts:\n\n${socialContext}`;
  }

  const recent = history.slice(-6);
  while (recent.length > 0 && recent[0]!.role !== "user") recent.shift();

  return [
    { role: "user" as const, parts: [{ text: contextMessage }] },
    { role: "model" as const, parts: [{ text: "Understood — I'll answer from these pages." }] },
    ...recent.map((h) => ({
      role: h.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: h.content }],
    })),
    { role: "user" as const, parts: [{ text: message }] },
  ];
}


// ---------------------------------------------------------------------------
// Two-pass reasoning
// ---------------------------------------------------------------------------
/** Whether a live search is worth running before retrieval has reported back. */
function wantsWebUpFront(plan: QueryPlan): boolean {
  const mode = webMode();
  if (mode === "off") return false;
  if (mode === "always") return true;
  return mode === "analytical" && plan.analytical;
}

/**
 * The weak-retrieval trigger can only fire after reranking, so unlike the analytical
 * trigger it cannot be overlapped with retrieval and costs its latency in full. That
 * is the right trade: a weak result means the index probably cannot answer, and a
 * slow correct answer beats a fast wrong one.
 */
function wantsWebAfterRetrieval(confidence: "strong" | "weak" | "none"): boolean {
  const mode = webMode();
  if (mode === "off" || mode === "always") return false;
  return confidence !== "strong";
}

function searchFor(siteId: string, plan: QueryPlan): Promise<WebResearch | null> {
  return researchWeb({
    siteId,
    question: plan.standalone,
    subQueries: plan.subQueries,
  }).catch((err) => {
    console.warn(
      "[rag] web research failed:",
      err instanceof Error ? err.message.slice(0, 160) : err
    );
    return null;
  });
}

/**
 * True when the brief admits to something it could not establish, which switches the
 * editor into saying so rather than quietly dropping it.
 *
 * Scanned line by line rather than matched with one regex: the obvious pattern needs
 * an end-of-input anchor to handle a brief truncated before BEST SOURCES, and
 * JavaScript has no \Z — it parses as a literal "Z" and silently never matches, so a
 * truncated brief would report no gaps at exactly the moment it has the most.
 */
function briefHasGaps(brief: string): boolean {
  const lines = brief.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*GAPS\s*:?\s*$/i.test(l));
  if (start === -1) return false;

  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*BEST SOURCES\s*:?\s*$/i.test(lines[i]!)) break;
    body.push(lines[i]!);
  }

  const text = body.join(" ").trim();
  return text.length > 0 && !/^(none|n\/a|nothing|not applicable|-|—)\.?$/i.test(text);
}

async function runAnalyst(params: {
  siteId: string;
  context: string;
  webContext: string;
  socialContext: string;
  history: ChatHistoryItem[];
  message: string;
}): Promise<{ brief: string; hasGaps: boolean } | null> {
  const { siteId, context, webContext, socialContext, history, message } = params;
  const t0 = Date.now();
  try {
    const brief = await generateContentText({
      model: GEMINI_MODELS.chat,
      contents: buildContents({ context, webContext, socialContext, history, message }),
      config: {
        systemInstruction: buildAnalystPrompt({ siteId, hasWeb: Boolean(webContext) }),
        // Reasoning, not recall. This is the one call in the pipeline that is allowed
        // a real thinking budget, and the only reason the analytical path exists.
        temperature: 0.3,
        maxOutputTokens: ANALYST_MAX_TOKENS,
        thinkingLevel: "high",
      },
    });
    if (!brief.trim()) return null;
    const hasGaps = briefHasGaps(brief);
    console.log(
      `[reasoning] analyst site=${siteId} ${Date.now() - t0}ms brief=${brief.length}ch gaps=${hasGaps} web=${webContext ? "yes" : "no"}`
    );
    return { brief, hasGaps };
  } catch (err) {
    console.warn(
      "[rag] analyst pass failed:",
      err instanceof Error ? err.message.slice(0, 160) : err
    );
    return null;
  }
}

/**
 * The editor turn. The brief rides in as the final user message so the source material
 * stays in the cacheable prefix, and so the model reads the evidence before the claims
 * it is being asked to check.
 */
function buildEditorTurn(params: {
  siteId: string;
  brief: string;
  hasGaps: boolean;
  hasSocial: boolean;
  experiential: boolean;
  context: string;
  webContext: string;
  socialContext: string;
  history: ChatHistoryItem[];
  message: string;
}) {
  const { siteId, brief, hasGaps, hasSocial, experiential, context, webContext, socialContext, history, message } =
    params;

  return {
    systemPrompt: buildEditorPrompt({ siteId, hasSocial, gaps: hasGaps, experiential }),
    contents: buildContents({
      context,
      webContext,
      socialContext,
      history,
      message:
        `RESEARCH BRIEF — internal notes. Never quote them, mention them, or reproduce their ` +
        `section headings or [url] markers.\n\n${brief}\n\n---\n\n` +
        `The visitor asked: ${message}\n\nCheck the brief against the material above, then write the answer they see.`,
    }),
  };
}

/**
 * When the answer actually cites social posts, "For More Info" should point at the
 * official accounts rather than website pages — the visitor is being shown reels, so
 * the useful next step is the feed they came from, not a prospectus page.
 */
function resolveMoreInfoLinks(params: {
  citedPosts: Array<{ url: string }> | undefined;
  socialResults: SocialSearchResult[];
  pageLinks: PageLink[];
}): PageLink[] {
  const { citedPosts, socialResults, pageLinks } = params;
  if (!citedPosts?.length) return pageLinks;
  const profiles = socialProfileLinks(socialResults);
  return profiles.length
    ? profiles.map((p) => ({ url: p.url, title: p.title }))
    : pageLinks;
}

// ---------------------------------------------------------------------------
// Canned replies that need no retrieval
// ---------------------------------------------------------------------------
function greetingAnswer(siteId: string): ChatAnswer {
  const profile = getSiteProfile(siteId);
  const name = profile.displayName || siteId;
  const canHelp = profile.capabilities ? ` I can help with ${profile.capabilities}.` : "";
  return {
    answer: `Hello! I'm NavBot, the assistant for the ${name} website.${canHelp} What would you like to know?`,
    sources: [],
    pageLinks: [],
    socialLinks: [],
    followUps: profile.suggestedQuestions.slice(0, 3),
    path: "greeting",
  };
}

function outOfScopeAnswer(siteId: string): ChatAnswer {
  const profile = getSiteProfile(siteId);
  const name = profile.displayName || siteId;
  const scope = profile.capabilities ? ` — ${profile.capabilities}, and anything else about it` : "";
  return {
    answer: `That one's outside what I can help with, but I can tell you about ${name}${scope}. What would you like to know?`,
    sources: [],
    pageLinks: [],
    socialLinks: [],
    followUps: profile.suggestedQuestions.slice(0, 3),
    path: "out_of_scope",
  };
}

// ---------------------------------------------------------------------------
// The pipeline
//
// There is exactly one implementation, and it is a generator. The non-streaming
// entry point below is a view of it that drains the events and keeps the last one.
//
// It was previously written twice, and the two copies drifted every time either was
// touched: the streaming path silently lost social search (documented in this file),
// never read or wrote the semantic cache, and had no reduced-context retry — while
// the widget streams by default, so production was running the weaker of the two.
// Collapsing them is what stops that recurring.
// ---------------------------------------------------------------------------
export type StreamEvent =
  | {
      type: "status";
      stage: "planning" | "searching" | "researching" | "reading" | "reasoning" | "writing";
      detail?: string;
    }
  | { type: "delta"; text: string }
  | { type: "done"; answer: ChatAnswer };

export async function* answerQuestionStreaming(params: {
  siteId: string;
  message: string;
  history: ChatHistoryItem[];
  /** Rendering capabilities the client advertises, e.g. ["post-chips"]. */
  features?: string[];
}): AsyncGenerator<StreamEvent, void, unknown> {
  const { siteId, message, history, features } = params;

  // 1. A curated answer written by the site owner always wins.
  const curated = CACHE_DISABLED
    ? null
    : await getFaqUserAnswerForQuestion(siteId, message).catch(() => null);
  if (curated && !curated.stale) {
    const answer = applyGlossary(curated.answer.trim(), siteId);
    yield { type: "delta", text: answer };
    yield {
      type: "done",
      answer: { answer, sources: [], pageLinks: [], socialLinks: [], followUps: [], path: "faq" },
    };
    return;
  }

  // 2. Semantic cache. First turn only, because a follow-up depends on the history
  //    that produced it and the cache key is the question alone.
  const isFirstTurn = history.length === 0;
  if (isFirstTurn && !CACHE_DISABLED) {
    const cached = await getRagCache(siteId, message).catch(() => null);
    if (cached) {
      yield { type: "delta", text: cached.answer };
      yield {
        type: "done",
        answer: {
          answer: cached.answer,
          sources: cached.sources,
          pageLinks: cached.pageLinks as PageLink[],
          socialLinks: [],
          followUps: [],
          path: "cache",
        },
      };
      return;
    }
  }

  yield { type: "status", stage: "planning" };

  // 3. Kicked off before planning so the Serper round trip overlaps retrieval
  //    instead of adding to it.
  const socialPromise = hasSocialIntent(message)
    ? searchSocialMedia(siteId, message).catch(() => [] as SocialSearchResult[])
    : Promise.resolve([] as SocialSearchResult[]);

  let plan: QueryPlan;
  try {
    plan = await planQuery({ siteId, message, history });
  } catch {
    plan = fallbackPlan(message, history);
  }

  if (plan.intent === "greeting" || plan.intent === "out_of_scope") {
    const canned = plan.intent === "greeting" ? greetingAnswer(siteId) : outOfScopeAnswer(siteId);
    yield { type: "delta", text: canned.answer };
    yield { type: "done", answer: canned };
    return;
  }

  // 4. Retrieve, with a live search alongside it when the question warrants one.
  const webPromise: Promise<WebResearch | null> = wantsWebUpFront(plan)
    ? searchFor(siteId, plan)
    : Promise.resolve(null);

  yield { type: "status", stage: "searching" };
  const retrieval = await runRetrieval({ siteId, plan });
  const socialResults = await socialPromise;

  let research = await webPromise;
  if (!research && wantsWebAfterRetrieval(retrieval.meta.confidence)) {
    yield { type: "status", stage: "researching" };
    research = await searchFor(siteId, plan);
  }

  // Only bail out when there is genuinely nothing to read. A low rerank score on
  // real pages means the phrasing is unusual, not that the answer is missing, so the
  // model gets to see the pages and decide.
  const webSources = research?.sources ?? [];
  if (retrieval.docs.length === 0 && socialResults.length === 0 && webSources.length === 0) {
    console.warn(`[rag] retrieved nothing for "${plan.standalone.slice(0, 70)}"`);
    const fb = buildContactFallback({ siteId, question: plan.standalone, docs: [] });
    yield { type: "delta", text: fb.answer };
    yield {
      type: "done",
      answer: { ...fb, sources: [], socialLinks: [], path: "contact_fallback" },
    };
    return;
  }

  const pageCount = new Set([
    ...retrieval.docs.map((d) => d.url),
    ...webSources.map((w) => w.url),
  ]).size;
  yield { type: "status", stage: "reading", detail: `${pageCount} page${pageCount === 1 ? "" : "s"}` };

  const built = buildContextWithCoverage(retrieval.docs, siteId);
  const context = built.context;
  const webContext = buildWebSection(research);
  const socialContext = buildSocialContextString(socialResults);

  // What the site holds on this subject against what actually fitted. Either the section
  // has more pages than we retrieved, or the budget dropped some of what we did.
  const sectionCoverage = retrieval.meta.coverage;
  const coverage = sectionCoverage
    ? {
        label: sectionCoverage.label,
        matchingPages: sectionCoverage.matchingPages,
        includedPages: built.includedPages,
        listingUrls: sectionCoverage.listingUrls,
      }
    : built.droppedPages > 0
      ? {
          label: "",
          matchingPages: built.includedPages + built.droppedPages,
          includedPages: built.includedPages,
          listingUrls: [],
        }
      : null;

  if (coverage && coverage.matchingPages > coverage.includedPages + 2) {
    console.log(
      `[coverage] site=${siteId} section="${coverage.label}" showing ${coverage.includedPages}/${coverage.matchingPages} pages` +
        (coverage.listingUrls.length ? ` -> ${coverage.listingUrls[0]}` : "")
    );
  }

  // 5. Judgement questions reason first. The analyst does not stream — its notes are
  //    internal — so the visitor waits on it, which is what the status stage is for.
  let analysis: { brief: string; hasGaps: boolean } | null = null;
  if (reasoningEnabled() && plan.analytical) {
    yield { type: "status", stage: "reasoning" };
    analysis = await runAnalyst({ siteId, context, webContext, socialContext, history, message });
  }

  const answererPrompt = buildSystemPrompt({
    siteId,
    confidence: retrieval.meta.confidence === "strong" ? "strong" : "weak",
    exhaustive: plan.exhaustive,
    hasSocial: socialResults.length > 0,
    experiential: plan.experiential,
    coverage,
  });

  const turn = analysis
    ? buildEditorTurn({
        siteId,
        brief: analysis.brief,
        hasGaps: analysis.hasGaps,
        hasSocial: socialResults.length > 0,
        experiential: plan.experiential,
        context,
        webContext,
        socialContext,
        history,
        message,
      })
    : {
        systemPrompt: answererPrompt,
        contents: buildContents({ context, webContext, socialContext, history, message }),
      };

  yield { type: "status", stage: "writing" };

  // 6. Stream the prose, hide the trailing metadata blocks.
  //
  // The stream must be consumed to the END even after the first marker appears:
  // [RELEVANT_PAGES] and [FOLLOW_UPS] are emitted last, so bailing out at the opening
  // marker loses every page link and follow-up, and leaves the raw text holding an
  // unclosed tag that the block parser then cannot strip.
  //
  // What is displayed is recomputed from the whole buffer each tick rather than
  // tracked incrementally. Incremental bookkeeping leaked "[POST:1" whenever a tag
  // straddled a chunk boundary; deriving the visible text from scratch cannot, because
  // stripping is deterministic and the visible prefix only ever grows.
  let raw = "";
  let emitted = 0;
  let markerSeen = false;
  let path: ChatAnswer["path"] = analysis ? "reasoned" : "answered";
  // Hold back a little tail so a marker split across two chunks is never displayed.
  const MARKER_LOOKAHEAD = 24;

  const visibleText = (upTo: string): string =>
    upTo
      .replace(/\s*\[POST:[^\]]*\]/gi, "") // complete citation tags
      .replace(/\s*\[POST:[^\]]*$/i, ""); // a tag still arriving

  for await (const delta of generateContentStream({
    model: GEMINI_MODELS.chat,
    contents: turn.contents,
    config: {
      systemInstruction: turn.systemPrompt,
      temperature: 0.2,
      maxOutputTokens: analysis ? EDITOR_MAX_TOKENS : ANSWER_MAX_TOKENS,
      thinkingLevel: "low",
    },
  })) {
    raw += delta;
    if (markerSeen) continue; // keep collecting, stop displaying

    const markerAt = raw.indexOf("[RELEVANT_PAGES]");
    if (markerAt >= 0) markerSeen = true;

    const limit = markerAt >= 0 ? markerAt : Math.max(0, raw.length - MARKER_LOOKAHEAD);
    const visible = visibleText(raw.slice(0, limit));
    if (visible.length > emitted) {
      yield { type: "delta", text: visible.slice(emitted) };
      emitted = visible.length;
    }
  }

  // 7. Rung two: one non-streamed retry on a reduced context, which also dodges
  //    token-limit failures. Nothing has been shown to the visitor yet if we are
  //    here, so emitting the retry as a single delta is safe.
  if (!raw.trim() && retrieval.docs.length > 0) {
    console.warn("[rag] stream produced nothing — retrying with reduced context");
    try {
      raw = await generateContentText({
        model: GEMINI_MODELS.chat,
        contents: buildContents({
          context: buildContext(retrieval.docs.slice(0, 5), siteId),
          webContext,
          socialContext: "",
          history: [],
          message,
        }),
        config: {
          systemInstruction: answererPrompt,
          temperature: 0.2,
          maxOutputTokens: ANSWER_MAX_TOKENS,
          thinkingLevel: "low",
        },
      });
      path = "retry";
      const visible = visibleText(raw.split("[RELEVANT_PAGES]")[0] ?? "");
      if (visible.trim()) yield { type: "delta", text: visible.slice(emitted) };
    } catch (err) {
      console.error(
        "[rag] generation failed twice:",
        err instanceof Error ? err.message.slice(0, 160) : err
      );
    }
  }

  // 8. Rungs three and four: partial answer with pages, else the contact block.
  if (!raw.trim()) {
    const fb = buildContactFallback({
      siteId,
      question: plan.standalone,
      docs: retrieval.docs,
      reason: "generation_failed",
    });
    yield { type: "delta", text: fb.answer };
    yield {
      type: "done",
      answer: {
        ...fb,
        sources: dedupeSources(retrieval.docs, siteId),
        socialLinks: [],
        path: "contact_fallback",
      },
    };
    return;
  }

  // 9. Parse, attach links, assemble.
  //
  // No correction delta here: `emitted` indexes the RAW stream while `formatted.answer`
  // is the cleaned text, so slicing one by the other duplicates or garbles the tail.
  // The `done` event carries the authoritative answer and the client renders that.
  const formatted = formatAnswer({
    raw,
    siteId,
    docs: retrieval.docs,
    posts: socialResults,
    webSources,
  });

  const sources = dedupeSources(retrieval.docs, siteId);
  for (const w of webSources) {
    if (!sources.some((x) => x.url === w.url)) sources.push({ url: w.url, title: w.title || w.url });
  }
  for (const sr of socialResults) {
    if (!sources.some((x) => x.url === sr.url)) {
      sources.push({ url: sr.url, title: `${sr.platform}: ${sr.title}` });
    }
  }

  const adapted = adaptForClient(formatted.answer, formatted.citedPosts, features);
  const answer: ChatAnswer = {
    answer: adapted.answer,
    sources,
    pageLinks: resolveMoreInfoLinks({
      citedPosts: formatted.citedPosts,
      socialResults,
      pageLinks: formatted.pageLinks,
    }),
    // Empty for clients that render inline chips; older bundles get the list back.
    socialLinks: adapted.trailingPosts.map((p) => ({
      platform: p.platform,
      title: p.title,
      url: p.url,
    })),
    followUps: formatted.followUps,
    path,
  };

  // 10. Only cache confident, first-turn answers that actually said something.
  const declined = /I don'?t have that specific detail|I only cover/i.test(answer.answer);
  if (isFirstTurn && !CACHE_DISABLED && retrieval.meta.confidence === "strong" && !declined) {
    setRagCache(siteId, message, {
      answer: answer.answer,
      sources: sources.map((s) => ({ url: s.url, title: s.title })),
      pageLinks: answer.pageLinks,
    }).catch(() => {});
  }

  yield { type: "done", answer };
}

// ---------------------------------------------------------------------------
// Non-streaming entry point — a view of the generator above, never a second copy
// ---------------------------------------------------------------------------
export async function answerQuestionWithRag(params: {
  siteId: string;
  message: string;
  history: ChatHistoryItem[];
  features?: string[];
}): Promise<ChatAnswer> {
  for await (const ev of answerQuestionStreaming(params)) {
    if (ev.type === "done") return ev.answer;
  }
  // Every terminating path above yields `done`, so this is unreachable in practice.
  // It exists so the failure is loud rather than an undefined answer reaching a caller.
  throw new Error("answerQuestionStreaming ended without emitting a done event");
}

// ---------------------------------------------------------------------------
// Speech-to-text
// ---------------------------------------------------------------------------
async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const ai = getGoogleGenAI();
  const audioBase64 = audioBuffer.toString("base64");

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODELS.stt,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: audioBase64 } },
              { text: "Transcribe this audio exactly. Return only the transcript text, no explanations." },
            ],
          },
        ],
        config: { temperature: 0.0, maxOutputTokens: 1024 },
      }),
    { maxAttempts: 3, baseDelayMs: 800, label: "STT" }
  );

  const transcript = (response.text ?? "").trim();
  if (!transcript) throw new Error("Gemini STT returned an empty transcript.");
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
        "I couldn't make out that voice message. Please try again, or type your question instead.",
      sources: [],
      pageLinks: [] as PageLink[],
      socialLinks: [] as SocialLink[],
      followUps: [] as string[],
      error: msg,
    };
  }

  const result = await answerQuestionWithRag({ siteId, message: transcript, history });
  return { transcript, ...result };
}

// ---------------------------------------------------------------------------
// Text-to-speech
// ---------------------------------------------------------------------------
const MAX_TTS_CHARS = 1000;
const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE?.trim() || "Kore";

export async function synthesizeSpeech(text: string): Promise<string> {
  const ai = getGoogleGenAI();
  const truncated = text.length > MAX_TTS_CHARS ? text.slice(0, MAX_TTS_CHARS) + "…" : text;

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODELS.tts,
        contents: [{ role: "user", parts: [{ text: `Read this text aloud:\n\n${truncated}` }] }],
        config: {
          responseModalities: ["audio"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE } },
          },
        },
      }),
    { maxAttempts: 3, baseDelayMs: 1000, label: "TTS" }
  );

  const parts = (response.candidates ?? [])[0]?.content?.parts ?? [];
  const audioPart = parts.find((p) => "inlineData" in p && p.inlineData != null);
  const inlineData = (audioPart as
    | { inlineData?: { data?: string; mimeType?: string } }
    | undefined)?.inlineData;
  if (!inlineData?.data) throw new Error("Gemini TTS returned no audio data.");

  return pcmToWavBase64(inlineData.data, inlineData.mimeType);
}

/**
 * Gemini returns raw little-endian PCM ("audio/l16; rate=24000; channels=1"), not a
 * playable container. The widget hands the payload straight to `new Audio()` as
 * `data:audio/wav;base64,...`, and a bare PCM stream under a WAV media type decodes
 * to nothing — so read-aloud stayed silent even once the model ID was valid.
 *
 * Prepending the 44-byte RIFF/WAVE header is the whole fix, and it keeps the client
 * contract exactly as it is: still base64, still audio/wav.
 */
function pcmToWavBase64(base64Pcm: string, mimeType?: string): string {
  const pcm = Buffer.from(base64Pcm, "base64");

  // Trust the response's own parameters; fall back to Gemini's documented defaults.
  const rate = Number(/rate=(\d+)/i.exec(mimeType ?? "")?.[1]) || 24_000;
  const channels = Number(/channels=(\d+)/i.exec(mimeType ?? "")?.[1]) || 1;
  const bitsPerSample = Number(/l(\d+)/i.exec(mimeType ?? "")?.[1]) || 16;

  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = rate * blockAlign;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audioFormat = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]).toString("base64");
}
