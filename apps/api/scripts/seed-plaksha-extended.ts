/**
 * Seed extended knowledge topics for plaksha.edu.in from crawled content.
 * Adds founders, faculty details, AAB, blog, statements, and other pages
 * to the existing 15 core topics.
 *
 * Usage: npx tsx apps/api/scripts/seed-plaksha-extended.ts
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  initAppDatabase,
  upsertKnowledgeTopic,
  upsertKnowledgeIndex,
  upsertGraphEdges,
  getKnowledgeTopics,
  type GraphEdge,
} from "../src/services/db";

const SITE_ID = "plaksha.edu.in";
const SCRATCHPAD = process.argv[2] || "/private/tmp/claude-501/-Users-diptidhawade-Desktop-NavBot-NavBot/7e24bc3b-c52d-486f-8167-617806a124d3/scratchpad";

function readFile(name: string): string {
  const p = path.join(SCRATCHPAD, name);
  if (!fs.existsSync(p)) {
    console.warn(`  [warn] File not found: ${p}`);
    return "";
  }
  return fs.readFileSync(p, "utf-8");
}

interface TopicDef {
  slug: string;
  name: string;
  description: string;
  content: string;
  sourceUrls: string[];
}

async function main() {
  await initAppDatabase();

  const foundersContent = readFile("final_founders.md");
  const aabContent = readFile("final_aab.md");
  const facultyDetailContent = readFile("final_faculty.md");
  const blogContent = readFile("final_blog.md");
  const statementsContent = readFile("final_statements.md");
  const otherContent = readFile("final_other.md");
  const givingContent = readFile("final_giving.md");

  const newTopics: TopicDef[] = [
    {
      slug: "founders",
      name: "Founders, Donors & Trustees",
      description: "Profiles and bios of 100+ founders, donors, and trustees of Plaksha University — entrepreneurs, business leaders, and technologists",
      content: foundersContent,
      sourceUrls: ["https://plaksha.edu.in/team/founding-group"],
    },
    {
      slug: "academic-advisory-board",
      name: "Academic Advisory Board",
      description: "Profiles of 20 eminent scholars and academic leaders on Plaksha's Academic Advisory Board",
      content: aabContent,
      sourceUrls: ["https://plaksha.edu.in/team/academic-advisory-board"],
    },
    {
      slug: "faculty-profiles",
      name: "Faculty Profiles (Detailed)",
      description: "Detailed profiles of all faculty members — research areas, publications, education, specializations",
      content: facultyDetailContent,
      sourceUrls: ["https://plaksha.edu.in/faculty/full-time-academia"],
    },
    {
      slug: "blog",
      name: "News & Blog",
      description: "Blog posts, news articles, student stories, faculty articles, campus updates from Plaksha University",
      content: blogContent,
      sourceUrls: ["https://plaksha.edu.in/blog"],
    },
    {
      slug: "statements",
      name: "Official Statements",
      description: "Official statements, press releases, and public communications from Plaksha University",
      content: statementsContent,
      sourceUrls: ["https://plaksha.edu.in/statements"],
    },
    {
      slug: "miscellaneous",
      name: "Additional Information",
      description: "Grand Challenge Scholars Program, CTLC, newsletters, SP Dutt Award, visiting faculty, academic office, and other miscellaneous pages",
      content: otherContent,
      sourceUrls: ["https://plaksha.edu.in"],
    },
  ];

  if (givingContent.length > 100) {
    newTopics.push({
      slug: "giving",
      name: "Giving & Donations",
      description: "How to donate to Plaksha University, philanthropy, annual reports, giving campaigns",
      content: givingContent,
      sourceUrls: ["https://giving.plaksha.edu.in"],
    });
  }

  console.log(`[seed-ext] Upserting ${newTopics.length} extended topics for ${SITE_ID}...`);

  for (const t of newTopics) {
    if (!t.content || t.content.length < 50) {
      console.log(`  [skip] ${t.slug} — no content`);
      continue;
    }
    const tokenEstimate = Math.ceil(t.content.length / 4);
    console.log(`  [${t.slug}] ${t.name} (~${tokenEstimate} tokens, ${t.content.length} chars)`);
    await upsertKnowledgeTopic({
      siteId: SITE_ID,
      slug: t.slug,
      name: t.name,
      description: t.description,
      content: t.content,
      sourceUrls: t.sourceUrls,
      tokenEstimate,
    });
  }

  // Add new graph edges for the extended topics
  const newEdges: GraphEdge[] = [
    { fromSlug: "founders", toSlug: "about", relationship: "founding story and mission" },
    { fromSlug: "founders", toSlug: "academic-advisory-board", relationship: "academic governance" },
    { fromSlug: "academic-advisory-board", toSlug: "about", relationship: "university governance" },
    { fromSlug: "academic-advisory-board", toSlug: "founders", relationship: "founding community" },
    { fromSlug: "faculty-profiles", toSlug: "faculty", relationship: "detailed faculty info" },
    { fromSlug: "faculty-profiles", toSlug: "research", relationship: "faculty research areas" },
    { fromSlug: "faculty-profiles", toSlug: "undergraduate-programs", relationship: "who teaches programs" },
    { fromSlug: "faculty", toSlug: "faculty-profiles", relationship: "detailed profiles" },
    { fromSlug: "blog", toSlug: "about", relationship: "university news and updates" },
    { fromSlug: "blog", toSlug: "campus-life", relationship: "student stories and campus events" },
    { fromSlug: "statements", toSlug: "about", relationship: "official communications" },
    { fromSlug: "about", toSlug: "founders", relationship: "founding community" },
    { fromSlug: "about", toSlug: "academic-advisory-board", relationship: "academic advisory" },
    { fromSlug: "giving", toSlug: "fees-financial-aid", relationship: "scholarship funding" },
    { fromSlug: "giving", toSlug: "founders", relationship: "donor community" },
    { fromSlug: "miscellaneous", toSlug: "undergraduate-programs", relationship: "GCSP and academic programs" },
    { fromSlug: "miscellaneous", toSlug: "about", relationship: "additional university info" },
  ];

  console.log(`[seed-ext] Adding ${newEdges.length} new graph edges...`);
  // Note: upsertGraphEdges replaces ALL edges for the site.
  // So we need to include the original edges too. Let's just append.
  // Actually upsertGraphEdges deletes all and re-inserts,
  // so we need the full set. Let me get existing topics and rebuild.

  // Rebuild full edge set: original 36 + new ones
  const originalEdges: GraphEdge[] = [
    { fromSlug: "admissions", toSlug: "fees-financial-aid", relationship: "fee structure for admitted students" },
    { fromSlug: "admissions", toSlug: "undergraduate-programs", relationship: "programs available for admission" },
    { fromSlug: "admissions", toSlug: "contact", relationship: "admissions contact info" },
    { fromSlug: "fees-financial-aid", toSlug: "admissions", relationship: "financial aid as part of admission" },
    { fromSlug: "undergraduate-programs", toSlug: "admissions", relationship: "how to apply" },
    { fromSlug: "undergraduate-programs", toSlug: "fees-financial-aid", relationship: "program costs" },
    { fromSlug: "undergraduate-programs", toSlug: "faculty", relationship: "who teaches" },
    { fromSlug: "undergraduate-programs", toSlug: "placements-careers", relationship: "career outcomes after graduation" },
    { fromSlug: "undergraduate-programs", toSlug: "entrepreneurship", relationship: "minor in tech entrepreneurship" },
    { fromSlug: "graduate-programs", toSlug: "faculty", relationship: "research supervisors" },
    { fromSlug: "graduate-programs", toSlug: "research", relationship: "research centers for PhD work" },
    { fromSlug: "graduate-programs", toSlug: "fees-financial-aid", relationship: "PhD stipends and fellowships" },
    { fromSlug: "faculty", toSlug: "research", relationship: "faculty lead research centers" },
    { fromSlug: "faculty", toSlug: "undergraduate-programs", relationship: "faculty teach programs" },
    { fromSlug: "faculty", toSlug: "work-at-plaksha", relationship: "faculty recruitment" },
    { fromSlug: "research", toSlug: "faculty", relationship: "research center faculty" },
    { fromSlug: "research", toSlug: "graduate-programs", relationship: "PhD research areas" },
    { fromSlug: "campus-life", toSlug: "contact", relationship: "student life contacts" },
    { fromSlug: "campus-life", toSlug: "research", relationship: "campus labs and facilities" },
    { fromSlug: "campus-life", toSlug: "about", relationship: "campus location" },
    { fromSlug: "placements-careers", toSlug: "undergraduate-programs", relationship: "programs leading to careers" },
    { fromSlug: "placements-careers", toSlug: "partnerships-global", relationship: "recruiting companies" },
    { fromSlug: "partnerships-global", toSlug: "about", relationship: "institutional partnerships" },
    { fromSlug: "partnerships-global", toSlug: "undergraduate-programs", relationship: "semester abroad and 4+1 pathways" },
    { fromSlug: "partnerships-global", toSlug: "graduate-programs", relationship: "co-created programs" },
    { fromSlug: "entrepreneurship", toSlug: "undergraduate-programs", relationship: "minor program" },
    { fromSlug: "entrepreneurship", toSlug: "campus-life", relationship: "incubation space on campus" },
    { fromSlug: "summer-programs", toSlug: "admissions", relationship: "pathway to UG admission" },
    { fromSlug: "summer-programs", toSlug: "contact", relationship: "YTS contact" },
    { fromSlug: "work-at-plaksha", toSlug: "faculty", relationship: "faculty openings" },
    { fromSlug: "work-at-plaksha", toSlug: "about", relationship: "university culture" },
    { fromSlug: "contact", toSlug: "admissions", relationship: "admissions inquiries" },
    { fromSlug: "contact", toSlug: "campus-life", relationship: "student life contacts" },
    { fromSlug: "about", toSlug: "partnerships-global", relationship: "global partnerships" },
    { fromSlug: "about", toSlug: "faculty", relationship: "faculty overview" },
    { fromSlug: "about", toSlug: "research", relationship: "research centers" },
  ];

  const allEdges = [...originalEdges, ...newEdges];
  await upsertGraphEdges(SITE_ID, allEdges);

  // Rebuild the knowledge index with all topics
  const allTopics = await getKnowledgeTopics(SITE_ID);
  const indexLines = allTopics.map(
    (t) => `- **${t.slug}** — ${t.description}`
  );
  const indexContent = `# Knowledge Index for plaksha.edu.in\n\n${indexLines.join("\n")}`;

  await upsertKnowledgeIndex(SITE_ID, indexContent, allTopics.length);

  console.log(`\n[seed-ext] Done!`);
  console.log(`  - ${newTopics.length} new topics upserted`);
  console.log(`  - ${allEdges.length} total graph edges`);
  console.log(`  - ${allTopics.length} total topics in index`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-ext] Fatal error:", err);
  process.exit(1);
});
