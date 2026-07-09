import type { CrawledPage } from "./crawler";
import {
  upsertKnowledgeTopic,
  upsertKnowledgeIndex,
  upsertGraphEdges,
  deleteKnowledgeForSite,
  type GraphEdge,
} from "./db";
import { generateContentText, GEMINI_MODELS, getGeminiApiKey } from "./gemini-client";

interface TopicDefinition {
  slug: string;
  name: string;
  description: string;
  sourceUrls: string[];
}

interface CompilationResult {
  topicCount: number;
  totalChars: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function identifyTopics(
  pages: CrawledPage[],
  siteUrl: string
): Promise<TopicDefinition[]> {
  const pageSummaries = pages.map((p) => ({
    url: p.url,
    title: p.title,
    summary: p.content.slice(0, 500),
  }));

  const prompt = `You are analyzing ${pages.length} web pages from ${siteUrl} to identify distinct knowledge topics.

PAGE SUMMARIES:
${pageSummaries.map((p, i) => `[${i + 1}] URL: ${p.url}\nTitle: ${p.title}\n${p.summary}`).join("\n\n")}

INSTRUCTIONS:
1. Identify 5-30 distinct topics that group this content
2. Each topic should have a clear, specific focus
3. Topics must cover ALL pages — every page should belong to at least one topic
4. A page may belong to multiple topics
5. Include a "general" catch-all topic for content that doesn't fit elsewhere

Return ONLY a valid JSON array:
[{"slug":"admissions","name":"Admissions & Applications","description":"Application process, deadlines, eligibility criteria","sourceUrls":["url1","url2"]},...]`;

  const raw = await generateContentText({
    model: GEMINI_MODELS.chat,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const jsonMatch = raw.trim().match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Topic identification returned no JSON array");

  const topics = JSON.parse(jsonMatch[0]) as TopicDefinition[];
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new Error("Topic identification returned empty array");
  }
  return topics;
}

async function compileTopicFile(
  topic: TopicDefinition,
  pages: CrawledPage[],
  siteUrl: string
): Promise<string> {
  const relevantPages = pages.filter((p) => topic.sourceUrls.includes(p.url));
  if (relevantPages.length === 0) return `# ${topic.name}\n\nNo content available.`;

  const pageContents = relevantPages
    .map((p) => `--- PAGE: ${p.title} (${p.url}) ---\n${p.content}`)
    .join("\n\n");

  const prompt = `You are compiling a comprehensive knowledge file about "${topic.name}" for the website ${siteUrl}.

Below is ALL content from pages related to this topic.

PAGE CONTENT:
${pageContents}

INSTRUCTIONS:
- Create a comprehensive, well-organized Markdown document
- Include EVERY piece of information about this topic from ALL provided pages
- Structure with clear headings (## and ###)
- Include specific details: dates, names, numbers, URLs, requirements
- Do NOT summarize — include everything
- Do NOT add information that is not in the provided pages
- At the end, add a "## Source Pages" section listing the URLs this info came from

Write the knowledge file now:`;

  return await generateContentText({
    model: GEMINI_MODELS.chat,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.1, maxOutputTokens: 16384 },
  });
}

function buildIndexContent(topics: TopicDefinition[], siteUrl: string): string {
  const lines = topics.map(
    (t) => `- **${t.slug}** — ${t.name}: ${t.description}`
  );
  return `# Knowledge Index for ${siteUrl}\n\n${lines.join("\n")}`;
}

async function generateGraphEdges(
  topics: TopicDefinition[]
): Promise<GraphEdge[]> {
  const slugs = topics.map((t) => `${t.slug}: ${t.name}`).join("\n");

  const prompt = `Given these knowledge topics:
${slugs}

Identify which topics are related to each other. Return a JSON array of edges:
[{"fromSlug":"admissions","toSlug":"fees","relationship":"related"},...]

Only include strong relationships. Return ONLY valid JSON.`;

  try {
    const raw = await generateContentText({
      model: GEMINI_MODELS.chat,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    });

    const jsonMatch = raw.trim().match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]) as GraphEdge[];
  } catch {
    return [];
  }
}

export async function compileSiteKnowledge(
  siteId: string,
  pages: CrawledPage[],
  siteUrl: string
): Promise<CompilationResult> {
  if (pages.length === 0) return { topicCount: 0, totalChars: 0 };

  if (!getGeminiApiKey()) {
    throw new Error("GEMINI_API_KEY is required for knowledge compilation");
  }

  console.log(`[knowledge] Compiling knowledge for "${siteId}" from ${pages.length} pages`);

  await deleteKnowledgeForSite(siteId);

  const topics = await identifyTopics(pages, siteUrl);
  console.log(`[knowledge] Identified ${topics.length} topics`);

  let totalChars = 0;

  for (const topic of topics) {
    console.log(`[knowledge] Compiling topic: ${topic.slug}`);
    const content = await compileTopicFile(topic, pages, siteUrl);
    totalChars += content.length;

    await upsertKnowledgeTopic({
      siteId,
      slug: topic.slug,
      name: topic.name,
      description: topic.description,
      content,
      sourceUrls: topic.sourceUrls,
      tokenEstimate: estimateTokens(content),
    });
  }

  const indexContent = buildIndexContent(topics, siteUrl);
  await upsertKnowledgeIndex(siteId, indexContent, topics.length);

  const edges = await generateGraphEdges(topics);
  if (edges.length > 0) {
    await upsertGraphEdges(siteId, edges);
    console.log(`[knowledge] Stored ${edges.length} graph edges`);
  }

  console.log(
    `[knowledge] Compilation complete: ${topics.length} topics, ${totalChars} chars total`
  );

  return { topicCount: topics.length, totalChars };
}

async function patchTopicWithChanges(
  existingContent: string,
  topicName: string,
  changedPages: CrawledPage[],
  siteUrl: string
): Promise<string> {
  const changedContent = changedPages
    .map((p) => `--- PAGE: ${p.title} (${p.url}) ---\n${p.content}`)
    .join("\n\n");

  const prompt = `You are updating an existing knowledge file for "${topicName}" on ${siteUrl}.

CURRENT KNOWLEDGE FILE:
${existingContent}

UPDATED SOURCE PAGES (these pages have changed since the knowledge file was last compiled):
${changedContent}

INSTRUCTIONS:
- Update the knowledge file to reflect any new or changed information from the updated pages
- PRESERVE the existing structure, formatting, headings, and organization
- ADD new information in the appropriate existing sections
- UPDATE any outdated information (dates, numbers, names, deadlines)
- If a piece of information in the knowledge file is contradicted by the updated pages, use the newer version from the updated pages
- Do NOT remove information that may come from other source pages not shown here
- Do NOT add commentary about what changed — just output the updated knowledge file
- Keep the same quality, detail level, and writing style as the existing file
- If nothing relevant changed for this topic, return the existing file unchanged

Output the complete updated knowledge file:`;

  return await generateContentText({
    model: GEMINI_MODELS.chat,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.1, maxOutputTokens: 16384 },
  });
}

function matchesTopicByKeyword(
  topic: { slug: string; name: string; description: string },
  page: CrawledPage
): boolean {
  const topicKeywords = `${topic.slug} ${topic.name} ${topic.description}`.toLowerCase();
  const pageText = `${page.title} ${page.url} ${page.content.slice(0, 500)}`.toLowerCase();
  const overlap = topicKeywords
    .split(/\s+/)
    .filter((w) => w.length > 3 && pageText.includes(w));
  return overlap.length >= 2;
}

async function reviewNeighborTopic(
  existingContent: string,
  topicName: string,
  changeSummary: string,
  siteUrl: string
): Promise<string | null> {
  const prompt = `A connected knowledge topic has been updated on ${siteUrl}. Review whether this topic also needs changes.

THIS TOPIC: "${topicName}"
CURRENT CONTENT:
${existingContent}

SUMMARY OF CHANGES IN CONNECTED TOPICS:
${changeSummary}

INSTRUCTIONS:
- If the changes in connected topics affect information in THIS topic, update it
- For example: if a new faculty member was added to the "Faculty" topic and this topic references faculty lists, update accordingly
- If a new program or center was announced and this topic mentions programs/centers, add it
- If nothing in the connected changes is relevant to this topic, respond with exactly: NO_CHANGES_NEEDED
- Do NOT remove existing information
- PRESERVE the existing structure and formatting
- Only output the updated knowledge file (or NO_CHANGES_NEEDED)`;

  const result = await generateContentText({
    model: GEMINI_MODELS.chat,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.1, maxOutputTokens: 16384 },
  });

  if (result.trim() === "NO_CHANGES_NEEDED") return null;
  return result;
}

async function reviewAndUpdateEdges(
  siteId: string,
  patchedSlugs: string[]
): Promise<void> {
  const {
    getKnowledgeTopics,
    getRelatedTopics,
    upsertGraphEdges: upsertEdges,
  } = await import("./db");

  const allTopics = await getKnowledgeTopics(siteId);
  const topicList = allTopics
    .map((t) => `- ${t.slug}: ${t.name} — ${t.description}`)
    .join("\n");

  const existingEdgeMap = new Map<string, string[]>();
  for (const t of allTopics) {
    const related = await getRelatedTopics(siteId, t.slug);
    if (related.length > 0) existingEdgeMap.set(t.slug, related);
  }

  const existingEdgesStr = [...existingEdgeMap.entries()]
    .map(([from, tos]) => tos.map((to) => `${from} ↔ ${to}`).join("\n"))
    .join("\n");

  const prompt = `Review the knowledge graph edges for a website. Some topics were just updated: ${patchedSlugs.join(", ")}

ALL TOPICS:
${topicList}

CURRENT EDGES:
${existingEdgesStr || "(none)"}

INSTRUCTIONS:
- Review whether the updated topics need NEW edges to other topics
- Check if any existing edges should be REMOVED because the relationship no longer exists
- Consider both direct and indirect relationships (e.g., if "research" mentions a faculty member, it should connect to "faculty")
- Return the COMPLETE set of edges (not just changes)
- Return ONLY a JSON array: [{"fromSlug":"a","toSlug":"b","relationship":"why related"},...]`;

  try {
    const raw = await generateContentText({
      model: GEMINI_MODELS.chat,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    const jsonMatch = raw.trim().match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const edges = JSON.parse(jsonMatch[0]) as GraphEdge[];
    if (Array.isArray(edges) && edges.length > 0) {
      const validSlugs = new Set(allTopics.map((t) => t.slug));
      const validEdges = edges.filter(
        (e) => validSlugs.has(e.fromSlug) && validSlugs.has(e.toSlug) && e.fromSlug !== e.toSlug
      );
      await upsertEdges(siteId, validEdges);
      console.log(`[knowledge] Graph edges updated: ${validEdges.length} edges`);
    }
  } catch (err) {
    console.error(`[knowledge] Edge review failed:`, err instanceof Error ? err.message : err);
  }
}

export async function recompileTopicsForUrls(
  siteId: string,
  changedUrls: string[],
  allPages: CrawledPage[],
  siteUrl: string
): Promise<void> {
  const { getTopicsForSourceUrl, getKnowledgeTopics } = await import("./db");
  const affectedSlugs = new Set<string>();

  // --- Phase 1: Identify directly affected topics ---
  for (const url of changedUrls) {
    const topics = await getTopicsForSourceUrl(siteId, url);
    for (const t of topics) affectedSlugs.add(t.slug);
  }

  if (affectedSlugs.size === 0) {
    const allTopics = await getKnowledgeTopics(siteId);
    if (allTopics.length === 0) {
      console.log(`[knowledge] No topics exist — running full compilation`);
      await compileSiteKnowledge(siteId, allPages, siteUrl);
      return;
    }

    console.log(`[knowledge] Changed URLs don't match sourceUrls — broadening via keyword match`);
    const changedPages = allPages.filter((p) => changedUrls.includes(p.url));
    if (changedPages.length === 0) return;

    for (const topic of allTopics) {
      for (const page of changedPages) {
        if (matchesTopicByKeyword(topic, page)) {
          affectedSlugs.add(topic.slug);
          break;
        }
      }
    }

    if (affectedSlugs.size === 0) {
      console.log(`[knowledge] No topics matched changed pages — skipping`);
      return;
    }
  }

  // --- Phase 2: Patch directly affected topics ---
  console.log(`[knowledge] Phase 1: Patching ${affectedSlugs.size} affected topics: ${[...affectedSlugs].join(", ")}`);

  const { getKnowledgeTopicsBySlugs, getRelatedTopics } = await import("./db");
  const existingTopics = await getKnowledgeTopicsBySlugs(siteId, [...affectedSlugs]);
  const changedPages = allPages.filter((p) => changedUrls.includes(p.url));

  const patchedSlugs: string[] = [];
  const changeSummaries: string[] = [];

  for (const existing of existingTopics) {
    const relevantPages = changedPages.filter((p) => {
      if (existing.source_urls?.includes(p.url)) return true;
      return matchesTopicByKeyword(existing, p);
    });

    if (relevantPages.length === 0) {
      console.log(`[knowledge]   ${existing.slug}: no relevant changed pages — skipping`);
      continue;
    }

    console.log(`[knowledge]   ${existing.slug}: patching with ${relevantPages.length} changed pages`);
    const content = await patchTopicWithChanges(
      existing.content,
      existing.name,
      relevantPages,
      siteUrl
    );

    await upsertKnowledgeTopic({
      siteId,
      slug: existing.slug,
      name: existing.name,
      description: existing.description,
      content,
      sourceUrls: existing.source_urls || [],
      tokenEstimate: estimateTokens(content),
    });

    patchedSlugs.push(existing.slug);
    changeSummaries.push(
      `Topic "${existing.name}" (${existing.slug}) was updated from pages: ${relevantPages.map((p) => p.title).join(", ")}`
    );
  }

  if (patchedSlugs.length === 0) {
    console.log(`[knowledge] No topics were actually patched — skipping propagation`);
    return;
  }

  // --- Phase 3: Propagate to connected neighbor topics ---
  const neighborSlugs = new Set<string>();
  for (const slug of patchedSlugs) {
    const related = await getRelatedTopics(siteId, slug);
    for (const r of related) {
      if (!patchedSlugs.includes(r)) neighborSlugs.add(r);
    }
  }

  if (neighborSlugs.size > 0) {
    console.log(`[knowledge] Phase 2: Reviewing ${neighborSlugs.size} connected topics: ${[...neighborSlugs].join(", ")}`);

    const neighborTopics = await getKnowledgeTopicsBySlugs(siteId, [...neighborSlugs]);
    const changeSummary = changeSummaries.join("\n");

    for (const neighbor of neighborTopics) {
      console.log(`[knowledge]   ${neighbor.slug}: reviewing for ripple effects...`);
      const updatedContent = await reviewNeighborTopic(
        neighbor.content,
        neighbor.name,
        changeSummary,
        siteUrl
      );

      if (updatedContent) {
        console.log(`[knowledge]   ${neighbor.slug}: updated with propagated changes`);
        await upsertKnowledgeTopic({
          siteId,
          slug: neighbor.slug,
          name: neighbor.name,
          description: neighbor.description,
          content: updatedContent,
          sourceUrls: neighbor.source_urls || [],
          tokenEstimate: estimateTokens(updatedContent),
        });
        patchedSlugs.push(neighbor.slug);
      } else {
        console.log(`[knowledge]   ${neighbor.slug}: no changes needed`);
      }
    }
  }

  // --- Phase 4: Review and update graph edges ---
  console.log(`[knowledge] Phase 3: Reviewing knowledge graph edges...`);
  await reviewAndUpdateEdges(siteId, patchedSlugs);

  // --- Phase 5: Rebuild index ---
  const allTopics = await getKnowledgeTopics(siteId);
  const indexLines = allTopics.map((t) => `- **${t.slug}** — ${t.name}: ${t.description}`);
  const indexContent = `# Knowledge Index for ${siteUrl}\n\n${indexLines.join("\n")}`;
  await upsertKnowledgeIndex(siteId, indexContent, allTopics.length);
  console.log(`[knowledge] Index rebuilt with ${allTopics.length} topics`);

  console.log(`[knowledge] Sync complete: ${patchedSlugs.length} topics updated`);
}
