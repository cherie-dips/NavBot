import "dotenv/config";
import { answerQuestionStreaming } from "../src/services/rag";

const SITE = "plaksha.edu.in";
const Q = "What are the top events that have happened at Plaksha?";

async function run(label: string, features?: string[]) {
  console.log(`\n${"═".repeat(76)}\n${label}\n${"═".repeat(76)}`);
  let streamed = "";
  let sawRawTagMidStream = false;

  for await (const ev of answerQuestionStreaming({
    siteId: SITE,
    message: Q,
    history: [],
    features,
  })) {
    if (ev.type === "delta") {
      streamed += ev.text;
      if (/\[POST:/i.test(ev.text)) sawRawTagMidStream = true;
    } else if (ev.type === "done") {
      console.log(ev.answer.answer.replace(/^/gm, "  "));
      console.log(`\n  more-info: ${ev.answer.pageLinks.map((l) => l.url).join(", ") || "(none)"}`);
      console.log(`  trailing posts: ${ev.answer.socialLinks.length}`);
      console.log(`  follow-ups: ${ev.answer.followUps.length}`);

      const a = ev.answer.answer;
      const problems: string[] = [];
      if (/\[POST:(?!https?:\/\/)/i.test(a)) problems.push("unresolved POST tag");
      if (/^\s*\[\s*$/m.test(a)) problems.push("dangling bracket line");
      if (/\[\s*\]|\(\s*\)/.test(a)) problems.push("empty brackets/parens");
      if (features?.includes("post-chips")) {
        if (!/\[POST:https?:\/\//i.test(a)) problems.push("expected inline chips, found none");
      } else if (/\[POST:/i.test(a)) {
        problems.push("old client received POST tags");
      }
      if (sawRawTagMidStream) problems.push("raw tag flushed mid-stream");
      console.log(`  ${problems.length ? "PROBLEMS: " + problems.join("; ") : "clean"}`);
    }
  }
}

async function main() {
  await run("NEW client (features: post-chips)", ["post-chips"]);
  await run("OLD client (no features — cached bundle)", undefined);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
