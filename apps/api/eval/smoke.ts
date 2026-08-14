import "dotenv/config";
import { searchSocialMedia } from "../src/services/social-search";
import { answerQuestionStreaming } from "../src/services/rag";

const SITE = "plaksha.edu.in";

async function main() {
  // 1. Does social search return anything now that handles resolve?
  const t0 = Date.now();
  const res = await searchSocialMedia(SITE, "events on campus");
  console.log(`searchSocialMedia -> ${res.length} results in ${Date.now() - t0}ms`);
  for (const r of res.slice(0, 6)) {
    console.log(`  [${r.platform}] ${r.title.replace(/\s+/g, " ").slice(0, 78)}`);
    console.log(`      ${r.url}`);
  }

  // 2. Streaming path — the one the widget actually uses.
  console.log(`\n${"─".repeat(76)}`);
  const q = "What kind of events are held on campus?";
  console.log(`Q: ${q}\n`);
  const t1 = Date.now();
  let firstDelta = 0;
  let text = "";
  for await (const ev of answerQuestionStreaming({ siteId: SITE, message: q, history: [] })) {
    if (ev.type === "status") console.log(`  [status] ${ev.stage}${ev.detail ? " " + ev.detail : ""} (+${Date.now() - t1}ms)`);
    else if (ev.type === "delta") {
      if (!firstDelta) { firstDelta = Date.now() - t1; console.log(`  [first token at ${firstDelta}ms]`); }
      text += ev.text;
    } else {
      console.log(`\nA: ${ev.answer.answer.replace(/\n/g, "\n   ")}`);
      console.log(`\n   pageLinks: ${ev.answer.pageLinks.map((l) => l.url.split("#")[0]).join(", ") || "(none)"}`);
      console.log(`   socialLinks: ${ev.answer.socialLinks.map((l) => `${l.platform}:${l.url}`).join(", ") || "(none)"}`);
      console.log(`   followUps: ${ev.answer.followUps.join(" | ") || "(none)"}`);
      console.log(`   total: ${Date.now() - t1}ms`);
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
