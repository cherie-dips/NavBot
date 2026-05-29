import { getTrackedUrls } from "./db";
import { getDocsForUrls, type RetrievedDoc } from "./vectorstore";

const EXHAUSTIVE_PATTERN =
  /\b(list|all|every|each|how many|name all|what are the|enumerate|complete list|full list|overview of all)\b/i;
const PLURAL_ENTITY =
  /\b(programs?|courses?|departments?|facult(?:y|ies)|events?|clubs?|hostels?|scholarships?|placements?|companies|labs?|centres?|centers?|projects?|alumni)\b/i;

export function isExhaustiveListQuestion(message: string): boolean {
  if (EXHAUSTIVE_PATTERN.test(message)) return true;
  if (PLURAL_ENTITY.test(message) && /\b(what|which|how|tell|give|show)\b/i.test(message)) return true;
  return false;
}

interface PathPrefix {
  origin: string;
  /** Match any path under /{firstSegment}/ (same site section as a seed page). */
  firstSegment: string;
}

function pathPrefixesFromSeeds(seedUrls: string[]): PathPrefix[] {
  const uniq = new Map<string, PathPrefix>();
  for (const u of seedUrls) {
    try {
      const parsed = new URL(u);
      const segs = parsed.pathname.split("/").filter(Boolean);
      if (segs.length >= 1) {
        const firstSegment = segs[0]!;
        const k = `${parsed.origin}|${firstSegment}`;
        if (!uniq.has(k)) uniq.set(k, { origin: parsed.origin, firstSegment });
      }
    } catch {
      /* ignore */
    }
  }
  return [...uniq.values()];
}

function pathnameMatchesSeedPrefix(pathname: string, p: PathPrefix): boolean {
  const segs = pathname.split("/").filter(Boolean);
  return segs[0] === p.firstSegment;
}

interface TopicMatch {
  queryPattern: RegExp;
  pathPattern: RegExp;
}

const TOPIC_MATCHERS: TopicMatch[] = [
  { queryPattern: /\b(event|workshop|seminar|talk|session|meetup|webinar|hackathon|bootcamp|fest|conference)\b/i, pathPattern: /\/events?(\/|$)/i },
  { queryPattern: /\bprojects?\b/i, pathPattern: /\/projects?(\/|$)/i },
  { queryPattern: /\b(faculty|professor|teacher|researcher|staff|supervisor|academic|instructor|dean)\b/i, pathPattern: /\/(faculty|people|team|staff)(\/|$)/i },
  { queryPattern: /\b(placement|recruit|hiring|company|companies|career|job|internship)\b/i, pathPattern: /\/(placement|careers?|recruiting)(\/|$)/i },
  { queryPattern: /\b(alumni|alumnus|alumna|graduate|batch)\b/i, pathPattern: /\/alumni(\/|$)/i },
  { queryPattern: /\b(admission|apply|application|eligibility)\b/i, pathPattern: /\/(admission|apply|application)(\/|$)/i },
  { queryPattern: /\b(program|course|degree|curriculum|department|major|specialization)\b/i, pathPattern: /\/(program|course|academics?|department|curriculum)(\/|$)/i },
  { queryPattern: /\b(hostel|accommodation|housing|residence|dorm|campus life)\b/i, pathPattern: /\/(hostel|accommodation|campus-life|residence|student-life)(\/|$)/i },
  { queryPattern: /\b(research|lab|publication|innovation|centre|center)\b/i, pathPattern: /\/(research|labs?|innovation|centres?|centers?)(\/|$)/i },
  { queryPattern: /\b(scholarship|financial aid|fee|tuition|funding)\b/i, pathPattern: /\/(scholarship|financial-aid|fee|tuition)(\/|$)/i },
];

function buildTopicPathPatterns(userMessage: string): RegExp[] {
  return TOPIC_MATCHERS
    .filter((m) => m.queryPattern.test(userMessage))
    .map((m) => m.pathPattern);
}

/**
 * From tracked pages, pick URLs under the same site sections as seeds
 * or matching topic-based path patterns derived from the user's query.
 */
export function pickTrackedUrlsForExpansion(
  seedUrls: string[],
  userMessage: string,
  tracked: Set<string>,
  maxUrls: number
): string[] {
  const seen = new Set(seedUrls.filter(Boolean));
  const prefixes = pathPrefixesFromSeeds(seedUrls);

  const topicPathPatterns = buildTopicPathPatterns(userMessage);

  const candidates: string[] = [];
  for (const t of tracked) {
    if (seen.has(t)) continue;
    let add = false;
    try {
      const u = new URL(t);
      const path = u.pathname;
      for (const p of prefixes) {
        if (u.origin !== p.origin) continue;
        if (pathnameMatchesSeedPrefix(path, p)) {
          add = true;
          break;
        }
      }
      if (!add) {
        for (const tp of topicPathPatterns) {
          if (tp.test(path)) { add = true; break; }
        }
      }
    } catch {
      /* skip bad URL */
    }
    if (add) candidates.push(t);
  }

  candidates.sort();
  return candidates.slice(0, maxUrls);
}

function mergeDedupeById(primary: RetrievedDoc[], extra: RetrievedDoc[]): RetrievedDoc[] {
  const seen = new Set(primary.map((d) => d.id));
  const out = [...primary];
  for (const d of extra) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
  }
  return out;
}

/**
 * For "list all …" answers, pure distance sort buries section pages (e.g. /events/…) that were
 * merged in with a fixed supplementary distance. Put relevant path sections first, then distance.
 */
export function sortDocsForExhaustiveAnswer(docs: RetrievedDoc[], userMessage: string): RetrievedDoc[] {
  const topicPathPatterns = buildTopicPathPatterns(userMessage);

  const sectionTier = (d: RetrievedDoc): number => {
    const u = d.url || "";
    for (const tp of topicPathPatterns) {
      if (tp.test(u)) return 0;
    }
    return 1;
  };

  return [...docs].sort((a, b) => {
    const ta = sectionTier(a);
    const tb = sectionTier(b);
    if (ta !== tb) return ta - tb;
    return (a.distance ?? 1) - (b.distance ?? 1);
  });
}

/**
 * After semantic retrieval, load chunks from other tracked pages in the same
 * sections (e.g. all `/events/...` URLs) so list answers do not miss pages.
 */
export async function expandRetrievalAcrossTrackedPages(
  siteId: string,
  semanticDocs: RetrievedDoc[],
  userMessage: string
): Promise<RetrievedDoc[]> {
  if (!isExhaustiveListQuestion(userMessage)) return semanticDocs;

  const seeds = [...new Set(semanticDocs.map((d) => d.url).filter(Boolean))];
  const tracked = await getTrackedUrls(siteId).catch(() => new Set<string>());
  if (tracked.size === 0) {
    console.log(`[multipage] no tracked URLs in DB for site "${siteId}" — skip expansion`);
    return sortDocsForExhaustiveAnswer(semanticDocs, userMessage);
  }

  const extraUrls = pickTrackedUrlsForExpansion(seeds, userMessage, tracked, 52);
  const newUrls = extraUrls.filter((u) => !seeds.includes(u));
  if (newUrls.length === 0) {
    console.log(`[multipage] no additional tracked URLs beyond ${seeds.length} seed page(s)`);
    return sortDocsForExhaustiveAnswer(semanticDocs, userMessage);
  }

  const extraDocs = await getDocsForUrls(siteId, newUrls, {
    maxTotal: 88,
    maxPerUrl: 5,
    supplementaryDistance: 0.72,
  });

  const merged = mergeDedupeById(semanticDocs, extraDocs);
  const ordered = sortDocsForExhaustiveAnswer(merged, userMessage);
  const cap = 96;
  const trimmed = ordered.slice(0, cap);

  console.log(
    `[multipage] expanded +${newUrls.length} URLs, +${extraDocs.length} chunks → ${trimmed.length} total (cap ${cap})`
  );
  return trimmed;
}
