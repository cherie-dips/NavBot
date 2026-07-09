/**
 * Test Tier 1 keyword routing only (no Gemini calls needed).
 * Usage: npx tsx apps/api/scripts/test-routing.ts
 */
import "dotenv/config";
import { initAppDatabase } from "../src/services/db";
import { routeQuery } from "../src/services/query-router";

const SITE_ID = "plaksha.edu.in";

const QUERIES = [
  "can I apply to yts which is being held in july 2026?",
  "does plaksha has partnership with harvard?",
  "which faculty has done their phd from IISC",
  "events at plaksha",
  "who is prof. Anupam",
  "What programs are offered at plaksha?",
  "binny bansal",
  "what is the fee for btech?",
  "tell me about the research labs",
  "how to contact admissions office?",
  "who are the founders of plaksha?",
  "what is the placement record?",
  "does plaksha have entrepreneurship support?",
  "tell me about the PhD program",
  "what scholarships are available?",
];

async function main() {
  await initAppDatabase();

  for (const q of QUERIES) {
    const route = await routeQuery(SITE_ID, q);
    const topicNames = route.topics.map((t) => `${t.slug}`).join(", ");
    console.log(`\nQ: ${q}`);
    console.log(`  → ${route.routingMethod}: [${topicNames}]`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
