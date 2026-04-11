import { getTrackedUrls } from "./db";
import { getDocsForUrls, type RetrievedDoc } from "./vectorstore";

/**
 * Questions that need breadth across many URLs (not just the single best-matching page).
 */
export function isExhaustiveListQuestion(message: string): boolean {
  return /\b(list|all|every|enumerate|complete|entire|full list|name all|count (all |the )?|how many\b|each\b|what are (all|the)\b|gather\b|catalog\b)\b/i.test(
    message
  );
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

/**
 * From SQLite-tracked pages, pick URLs under the same site sections as seeds
 * (same origin + first path segment, e.g. all `/events/...`) or topical hints (/events/, /projects/, …).
 */
export function pickTrackedUrlsForExpansion(
  seedUrls: string[],
  userMessage: string,
  tracked: Set<string>,
  maxUrls: number
): string[] {
  const seen = new Set(seedUrls.filter(Boolean));
  const prefixes = pathPrefixesFromSeeds(seedUrls);

  const wantsEvents = /workshop|event|seminar|talk|session|meetup|webinar|hackathon|bootcamp/i.test(
    userMessage
  );
  const wantsProjects = /\bprojects?\b/i.test(userMessage);

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
      if (!add && wantsEvents && /\/events(\/|$)/i.test(path)) add = true;
      if (!add && wantsProjects && /\/projects?(\/|$)/i.test(path)) add = true;
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
  const wantsEvents = /workshop|events?\b|seminar|talk|session|meetup|webinar|hackathon|bootcamp/i.test(
    userMessage
  );
  const wantsProjects = /\bprojects?\b/i.test(userMessage);

  const sectionTier = (d: RetrievedDoc): number => {
    const u = d.url || "";
    if (wantsEvents && /\/events(\/|$)/i.test(u)) return 0;
    if (wantsProjects && /\/projects?(\/|$)/i.test(u)) return 0;
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
  const tracked = await getTrackedUrls(siteId);
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
