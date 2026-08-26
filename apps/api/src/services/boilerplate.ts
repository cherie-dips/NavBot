/**
 * Cross-page boilerplate removal.
 *
 * The crawler indexes whole-page text, so every page's navigation menu, mega-menu
 * and footer became its own chunk. Measured on plaksha.edu.in: a single nav chunk
 * is present on 49 distinct URLs, and ~53% of all retrieved chunks were cross-page
 * duplicates. That filled the model's context with menus instead of content.
 *
 * This runs at query time on the retrieved set, so it needs no re-crawl:
 *   1. Chunks with identical normalised text on 2+ URLs collapse to one instance.
 *   2. Instances that also look like navigation are dropped outright.
 *
 * Collapsing is always safe (no information is lost). Dropping is gated on the
 * navigation shape test so a legitimately repeated fee table survives as one copy.
 */
import crypto from "crypto";
import type { RetrievedDoc } from "./vectorstore";
import { getSiteProfile } from "./site-profile";

/** The indexer prefixes chunks with "Page: <title> URL: <url> Section: <breadcrumb>". */
const CHUNK_PREAMBLE = /^\s*Page:\s*.*?\s*URL:\s*\S+\s*(?:Section:\s*)?/is;
const SECTION_COUNTER = /\(\d+\/\d+\)/g;

/** Strip indexer scaffolding so the model reads content, not our own metadata. */
function stripChunkPreamble(content: string): string {
  return content.replace(CHUNK_PREAMBLE, "").replace(SECTION_COUNTER, "").trim();
}

function normalise(content: string): string {
  return stripChunkPreamble(content).replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Fingerprint the opening of a chunk. Menus are byte-identical across pages, but
 * the tail can differ where a page name is interpolated, so only the head is hashed.
 */
function fingerprint(content: string): string {
  const n = normalise(content);
  if (n.length < 40) return `short:${n}`;
  return crypto.createHash("sha1").update(n.slice(0, 400)).digest("hex").slice(0, 16);
}

/**
 * Navigation text is a run of short link labels: many capitalised phrases, almost
 * no sentence punctuation, and a high hit rate against the site's known menu labels.
 */
function looksLikeNavigation(content: string, siteId: string): boolean {
  const text = stripChunkPreamble(content);
  if (text.length < 120) return false;

  const sentences = (text.match(/[.!?](?:\s|$)/g) ?? []).length;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 15) return false;

  const sentenceDensity = sentences / (words.length / 100); // sentences per 100 words
  const commaDensity = (text.match(/,/g) ?? []).length / (words.length / 100);

  const navTerms = getSiteProfile(siteId).navigationLabels;
  const lower = text.toLowerCase();
  let navHits = 0;
  for (const t of navTerms) {
    if (lower.includes(t)) navHits++;
  }

  // Prose runs ~5-8 sentences per 100 words. A menu runs near zero.
  const isProse = sentenceDensity >= 3 || commaDensity >= 6;
  if (isProse) return false;

  return navHits >= 3 || (navHits >= 2 && sentenceDensity < 1);
}

export interface BoilerplateStats {
  input: number;
  collapsed: number;
  navDropped: number;
  output: number;
}

/**
 * Prefer the canonical URL when the same text lives at several addresses
 * (plaksha.edu.in serves the same financial-aid page at /financial-aid and /scholarship).
 */
function preferUrl(a: RetrievedDoc, b: RetrievedDoc, siteId: string): RetrievedDoc {
  const profile = getSiteProfile(siteId);
  const rank = (d: RetrievedDoc): number => {
    const idx = profile.canonicalPreference.findIndex((p) => {
      try {
        return new URL(d.url).pathname.replace(/\/+$/, "") === p;
      } catch {
        return false;
      }
    });
    return idx === -1 ? 999 : idx;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra < rb ? a : b;
  // Otherwise the better-scoring chunk, then the shorter path.
  const da = a.distance ?? 1;
  const db = b.distance ?? 1;
  if (Math.abs(da - db) > 0.001) return da < db ? a : b;
  return (a.url?.length ?? 0) <= (b.url?.length ?? 0) ? a : b;
}

/**
 * Collapse cross-page duplicates and drop navigation chunks.
 * Returns docs with `content` cleaned of indexer scaffolding.
 */
export function removeBoilerplate(
  docs: RetrievedDoc[],
  siteId: string,
  /**
   * Pages exempt from the navigation drop.
   *
   * A roster page — every adjunct professor, every research center — is a run of short
   * capitalised phrases with almost no sentence punctuation, which is precisely the
   * shape this module treats as a menu. On "list all faculty" that dropped 44 of 68
   * candidates including the four pages that answer the question. Duplicate collapsing
   * and preamble stripping still apply; only the nav test is skipped.
   */
  protectedUrls?: Set<string>
): { docs: RetrievedDoc[]; stats: BoilerplateStats } {
  const isProtected = (d: RetrievedDoc) => protectedUrls?.has(d.url) ?? false;
  const groups = new Map<string, RetrievedDoc[]>();
  for (const d of docs) {
    // Roster pages are keyed by URL as well as content. Four faculty listings that open
    // with the same section header fingerprint identically — only the first 400 chars are
    // hashed — so a plain content key collapsed all four into one and lost three whole
    // rosters. Identical chunks within a single page still collapse.
    const fp = isProtected(d) ? `${d.url}|${fingerprint(d.content)}` : fingerprint(d.content);
    const g = groups.get(fp) ?? [];
    g.push(d);
    groups.set(fp, g);
  }

  const kept: RetrievedDoc[] = [];
  let collapsed = 0;
  let navDropped = 0;

  for (const group of groups.values()) {
    const distinctUrls = new Set(group.map((d) => d.url)).size;
    const representative = group.reduce((best, d) => preferUrl(best, d, siteId));

    if (
      distinctUrls >= 2 &&
      !isProtected(representative) &&
      looksLikeNavigation(representative.content, siteId)
    ) {
      navDropped += group.length;
      continue;
    }

    collapsed += group.length - 1;
    kept.push({
      ...representative,
      content: stripChunkPreamble(representative.content),
    });
  }

  // A nav chunk can also surface alone (only one of its 49 pages retrieved).
  const final = kept.filter((d) => {
    if (!isProtected(d) && looksLikeNavigation(d.content, siteId)) {
      navDropped++;
      return false;
    }
    return true;
  });

  final.sort((a, b) => (a.distance ?? 1) - (b.distance ?? 1));

  return {
    docs: final,
    stats: { input: docs.length, collapsed, navDropped, output: final.length },
  };
}
