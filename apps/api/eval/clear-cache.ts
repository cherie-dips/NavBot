import "dotenv/config";
import { invalidateRagCache } from "../src/services/db";

async function main() {
  const siteId = process.env.EVAL_SITE_ID || "plaksha.edu.in";
  await invalidateRagCache(siteId);
  console.log(`[eval] cleared rag_cache for ${siteId} (it repopulates on the next query)`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
