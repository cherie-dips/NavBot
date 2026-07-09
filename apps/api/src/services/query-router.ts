import {
  getKnowledgeIndex,
  getKnowledgeTopicsBySlugs,
  getKnowledgeTopics,
  getRelatedTopics,
  type KnowledgeTopicRow,
} from "./db";
import { generateContentText, GEMINI_MODELS, getGeminiApiKey } from "./gemini-client";

const indexCache = new Map<string, { content: string; ts: number }>();
const INDEX_CACHE_TTL = 5 * 60 * 1000;

async function getCachedIndex(siteId: string): Promise<string | null> {
  const cached = indexCache.get(siteId);
  if (cached && Date.now() - cached.ts < INDEX_CACHE_TTL) return cached.content;

  const idx = await getKnowledgeIndex(siteId);
  if (!idx) return null;

  indexCache.set(siteId, { content: idx.indexContent, ts: Date.now() });
  return idx.indexContent;
}

export function invalidateIndexCache(siteId: string): void {
  indexCache.delete(siteId);
}

interface TopicMatch {
  slug: string;
  score: number;
}

const KEYWORD_PATTERNS: Array<{ pattern: RegExp; slugs: string[] }> = [
  {
    pattern: /\b(deadline|admission|admit|apply|application|eligibility|criteria|requirement|enrol|transfer\s*admission)/i,
    slugs: ["admissions"],
  },
  {
    pattern: /\b(fee|tuition|scholarship|financial.?aid|funding|stipend|loan|waiver|cost|price|bharti\s*scholar|income|lakh|financial\s*constraint|need.?based|merit\s*scholar|sp\s*dutt)/i,
    slugs: ["fees-financial-aid"],
  },
  {
    pattern: /\b(b\.?tech|undergraduate|ug\b|freshmore|btech|major|cs\b|computer science|data science|robotics|biological|dseb)/i,
    slugs: ["undergraduate-programs"],
  },
  {
    pattern: /\b(program|course|degree|curriculum|syllabus|what.*offer|academic|elective|credit|prerequisite|math|grading|first.?year\s*student)/i,
    slugs: ["undergraduate-programs", "graduate-programs"],
  },
  {
    pattern: /\b(phd|doctoral|m\.?s\.?\s*in\s*ai|master|postgrad|tech\s*leaders?\s*fellowship|tlf|research\s*fellowship)/i,
    slugs: ["graduate-programs"],
  },
  {
    pattern: /\b(contact|email|phone|address|office hours|directions?|location|reach\s*us|call)\b/i,
    slugs: ["contact"],
  },
  {
    pattern: /\b(faculty|professor|prof\.?|teacher|instructor|who\s*is.*(?:dr|prof)|which\s*(?:faculty|prof)|phd\s*from|doctorate)/i,
    slugs: ["faculty", "faculty-profiles"],
  },
  {
    pattern: /\b(placement|recruit|hiring|companies|career outcome|job|package|salary|ctc|internship)/i,
    slugs: ["placements-careers"],
  },
  {
    pattern: /\b(hostel|accommodation|mess|dining|residence|dorm|campus\s*hous|well.?being|counseling|mental\s*health|thrive|introvert|exposure|anxiety|homesick|moving\s*away|student\s*experience|adjust|college\s*life|typical\s*week|outside\s*class|balance\s*academic|sports|hackathon|student\s*club)/i,
    slugs: ["campus-life"],
  },
  {
    pattern: /\b(fest|club|society|extracurricular|campus\s*life|student\s*life|student\s*activit|event|happening)/i,
    slugs: ["campus-life", "blog"],
  },
  {
    pattern: /\b(research|lab|center\s*for|innovation|clean\s*energy|water\s*security|agriculture|health\s*center|iot\s*lab|robotics\s*lab|ark\s*foundation|dixon|anthem|finhub|jefferies|hpc|makerspace)/i,
    slugs: ["research"],
  },
  {
    pattern: /\b(partner|collaborat|exchange|semester\s*abroad|global|international|mou\b|4\+1|penn|purdue|berkeley|cornell|harvard|cambridge|johns\s*hopkins|wisconsin|maryland)/i,
    slugs: ["partnerships-global"],
  },
  {
    pattern: /\b(founder|donor|trustee|founding\s*group|philanthrop)/i,
    slugs: ["founders"],
  },
  {
    pattern: /\b(advisory\s*board|aab\b)/i,
    slugs: ["academic-advisory-board"],
  },
  {
    pattern: /\b(yts|young\s*tech|summer\s*program|high\s*school)/i,
    slugs: ["summer-programs"],
  },
  {
    pattern: /\b(work\s*at|career\s*at|job\s*open|hiring\s*at|faculty\s*recruit|open\s*position|teach\s*fellow)/i,
    slugs: ["work-at-plaksha"],
  },
  {
    pattern: /\b(entrepreneur|incubat|startup|venture|alchemy|plaksha\s*incubation|minor\s*in\s*tech|start\s*a\s*company|build\s*startup|student\s*founder)/i,
    slugs: ["entrepreneurship"],
  },
  {
    pattern: /\b(blog|news|article|story|stories|press|update|newsletter)/i,
    slugs: ["blog"],
  },
  {
    pattern: /\b(statement|press\s*release|announcement|mou\b|inaugurat)/i,
    slugs: ["statements"],
  },
  {
    pattern: /\b(about|history|mission|vision|pillar|overview|who\s*is\s*plaksha|tell\s*me\s*about\s*plaksha|wrong\s*choice|right\s*(?:choice|for\s*me|place|college)|judge.*objectively|good\s*at\s*marketing|why\s*(?:plaksha|choose)|traditional.*(?:engineering|education)|intentionally\s*chosen|different\s*from\s*other|what\s*makes\s*plaksha)/i,
    slugs: ["about"],
  },
  {
    pattern: /\b(regulat|ugc|disclosure|accredit|governance|statutory|compliance)/i,
    slugs: ["general"],
  },
  {
    pattern: /\b(donat|giving|philanthrop|annual\s*report)\b/i,
    slugs: ["giving"],
  },
  {
    pattern: /\b(ctlc|ilgc|grand\s*challenge|communication\s*center|springer|museum\s*of\s*innovation)/i,
    slugs: ["research", "miscellaneous"],
  },
  {
    pattern: /\b(ds\s*brar|women\s*in\s*stem|she\s*innovates|gender\s*gap)/i,
    slugs: ["campus-life"],
  },
  {
    pattern: /\b(binny\s*bansal|institute\s*for\s*inventing)/i,
    slugs: ["research", "founders"],
  },
  {
    pattern: /\b(flexible|explore\s*different|change.*goal|switch.*major|change.*path)/i,
    slugs: ["undergraduate-programs", "campus-life"],
  },
  {
    pattern: /\b(product\s*manager|software\s*engineer|career\s*path|career\s*roadmap|four.?year\s*roadmap|roadmap)/i,
    slugs: ["undergraduate-programs", "placements-careers"],
  },
  {
    pattern: /\b(below\s*average|average\s*student|help\s*me\s*become|become\s*better|improve)/i,
    slugs: ["undergraduate-programs", "campus-life"],
  },
];

function tier1KeywordMatch(
  query: string,
  topics: Array<{ slug: string; name: string; description: string }>
): TopicMatch[] {
  const queryLower = query.toLowerCase();
  const queryWords = new Set(queryLower.split(/\s+/).filter((w) => w.length > 2));
  const slugScores = new Map<string, number>();
  const validSlugs = new Set(topics.map((t) => t.slug));

  for (const pattern of KEYWORD_PATTERNS) {
    if (pattern.pattern.test(query)) {
      for (const slug of pattern.slugs) {
        if (validSlugs.has(slug)) {
          slugScores.set(slug, (slugScores.get(slug) || 0) + 5);
        }
      }
    }
  }

  for (const topic of topics) {
    const topicText = `${topic.slug} ${topic.name} ${topic.description}`.toLowerCase();
    const topicWords = new Set(topicText.split(/\s+/).filter((w) => w.length > 2));

    let wordScore = 0;
    for (const qw of queryWords) {
      if (topicWords.has(qw)) wordScore += 2;
      else if (topicText.includes(qw)) wordScore += 1;
    }

    if (wordScore > 0) {
      slugScores.set(topic.slug, (slugScores.get(topic.slug) || 0) + wordScore);
    }
  }

  const matches: TopicMatch[] = [];
  for (const [slug, score] of slugScores) {
    matches.push({ slug, score });
  }

  return matches.sort((a, b) => b.score - a.score);
}

async function tier2LlmRoute(
  query: string,
  indexContent: string
): Promise<string[]> {
  if (!getGeminiApiKey()) return [];

  const prompt = `Given this knowledge index:
${indexContent}

User question: "${query}"

Which 1-3 topic slugs should be loaded to answer this question?
Return ONLY a JSON array of slug strings, e.g. ["admissions","fees"].
If no topic matches, return [].`;

  try {
    const raw = await generateContentText({
      model: GEMINI_MODELS.chat,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        maxOutputTokens: 256,
        responseMimeType: "application/json",
      },
    });

    const jsonMatch = raw.trim().match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];
    const slugs = JSON.parse(jsonMatch[0]) as string[];
    return Array.isArray(slugs) ? slugs.filter((s) => typeof s === "string") : [];
  } catch (err) {
    console.error("[router] LLM routing failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export interface RouteResult {
  topics: KnowledgeTopicRow[];
  routingMethod: "tier1" | "tier2" | "fallback";
  slugsUsed: string[];
}

export async function routeQuery(siteId: string, query: string): Promise<RouteResult> {
  const allTopics = await getKnowledgeTopics(siteId);
  if (allTopics.length === 0) {
    return { topics: [], routingMethod: "fallback", slugsUsed: [] };
  }

  const topicSummaries = allTopics.map((t) => ({
    slug: t.slug,
    name: t.name,
    description: t.description,
  }));

  const tier1Matches = tier1KeywordMatch(query, topicSummaries);
  const goodMatches = tier1Matches.filter((m) => m.score >= 3);

  let selectedSlugs: string[];
  let method: "tier1" | "tier2" | "fallback";

  if (goodMatches.length >= 1) {
    selectedSlugs = goodMatches.slice(0, 3).map((m) => m.slug);
    method = "tier1";
  } else {
    const indexContent = await getCachedIndex(siteId);
    if (indexContent) {
      const llmSlugs = await tier2LlmRoute(query, indexContent);
      if (llmSlugs.length > 0) {
        selectedSlugs = llmSlugs.slice(0, 3);
        method = "tier2";
      } else {
        const general = allTopics.find((t) => t.slug === "general");
        selectedSlugs = general ? ["general"] : [allTopics[0]!.slug];
        method = "fallback";
      }
    } else {
      if (tier1Matches.length > 0) {
        selectedSlugs = tier1Matches.slice(0, 3).map((m) => m.slug);
        method = "tier1";
      } else {
        const general = allTopics.find((t) => t.slug === "general");
        selectedSlugs = general ? ["general"] : [allTopics[0]!.slug];
        method = "fallback";
      }
    }
  }

  const relatedSlugs = new Set<string>();
  for (const slug of selectedSlugs) {
    const related = await getRelatedTopics(siteId, slug);
    for (const r of related) {
      if (!selectedSlugs.includes(r)) relatedSlugs.add(r);
    }
  }

  const allSlugs = [...selectedSlugs];
  if (relatedSlugs.size > 0 && allSlugs.length < 3) {
    for (const r of relatedSlugs) {
      allSlugs.push(r);
      if (allSlugs.length >= 3) break;
    }
  }

  const topics = await getKnowledgeTopicsBySlugs(siteId, allSlugs);

  console.log(
    `[router] ${method} routing for "${query.slice(0, 60)}": ${allSlugs.join(", ")}`
  );

  return { topics, routingMethod: method, slugsUsed: allSlugs };
}
