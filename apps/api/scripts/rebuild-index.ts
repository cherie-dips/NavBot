/**
 * Rebuild the knowledge index for a site from existing topics.
 * Usage: npx tsx apps/api/scripts/rebuild-index.ts [siteId]
 */
import "dotenv/config";
import {
  initAppDatabase,
  getKnowledgeTopics,
  upsertKnowledgeIndex,
} from "../src/services/db";

async function main() {
  const siteId = process.argv[2] || "plaksha.edu.in";
  await initAppDatabase();

  const topics = await getKnowledgeTopics(siteId);
  const lines = topics.map((t) => `- **${t.slug}** — ${t.description}`);
  const indexContent = `# Knowledge Index for ${siteId}\n\n${lines.join("\n")}`;

  await upsertKnowledgeIndex(siteId, indexContent, topics.length);

  console.log(`Index rebuilt for ${siteId}: ${topics.length} topics`);
  for (const t of topics) {
    console.log(`  ${t.slug.padEnd(25)} ${t.name}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
