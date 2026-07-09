/**
 * Test knowledge routing for a set of queries.
 * Usage: npx tsx apps/api/scripts/test-queries.ts
 */
import "dotenv/config";
import { initAppDatabase } from "../src/services/db";
import { routeQuery } from "../src/services/query-router";
import { answerQuestionWithRag } from "../src/services/rag";

const SITE_ID = "plaksha.edu.in";

const QUERIES = [
  "can I apply to yts which is being held in july 2026?",
  "does plaksha has partnership with harvard?",
  "which faculty has done their phd from IISC",
  "events at plaksha",
  "who is prof. Anupam",
  "What programs are offered at plaksha?",
  "binny bansal",
];

async function main() {
  await initAppDatabase();

  for (const q of QUERIES) {
    console.log("\n" + "=".repeat(80));
    console.log(`Q: ${q}`);
    console.log("=".repeat(80));

    // Step 1: Route
    const route = await routeQuery(SITE_ID, q);
    console.log(`\nRouting: ${route.routingMethod} → [${route.slugsUsed.join(", ")}]`);
    console.log(`Topics loaded: ${route.topics.map((t) => t.slug).join(", ")}`);

    // Step 2: RAG answer
    try {
      const result = await answerQuestionWithRag({
        siteId: SITE_ID,
        message: q,
        history: [],
      });
      console.log(`\nAnswer:\n${result.answer}`);
      if (result.sources?.length) {
        console.log(`\nSources: ${result.sources.map((s) => s.url).join(", ")}`);
      }
    } catch (err) {
      console.error(`RAG error: ${err instanceof Error ? err.message : err}`);
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 2000));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
