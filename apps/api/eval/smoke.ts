import "dotenv/config";
import { answerQuestionWithRag } from "../src/services/rag";

const SITE = "plaksha.edu.in";

const CASES = [
  "If I have anxiety about moving away from home, what campus support is available?",
  "I'm stressed about exams, is there anyone I can talk to?",
  "What mental health support does Plaksha offer?",
  // Regression guards: out-of-scope must still be declined, facts must stay right.
  "Who won the FIFA World Cup in 2022?",
  "How much is the annual tuition fee at Plaksha?",
];

async function main() {
  const only = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  const cases = only !== null ? [CASES[only]!] : CASES;

  for (const q of cases) {
    const t0 = Date.now();
    try {
      const res = await answerQuestionWithRag({ siteId: SITE, message: q, history: [] });
      console.log(`\n${"─".repeat(76)}`);
      console.log(`Q: ${q}   [${Date.now() - t0}ms, path=${res.path}]`);
      console.log(`A: ${res.answer.replace(/\n/g, "\n   ")}`);
      console.log(`   links: ${res.pageLinks.map((l) => l.url.split("#")[0]).join(", ") || "(none)"}`);
      console.log(`   follow-ups: ${res.followUps.join(" | ") || "(none)"}`);
    } catch (err) {
      console.log(`\nQ: ${q}\n   FAILED: ${(err as Error).message.slice(0, 200)}`);
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
