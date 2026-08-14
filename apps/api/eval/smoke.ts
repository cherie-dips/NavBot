import "dotenv/config";
import { answerQuestionWithRag } from "../src/services/rag";

const SITE = "plaksha.edu.in";

const CASES: Array<{ label: string; message: string; history?: Array<{ role: "user" | "assistant"; content: string }> }> = [
  { label: "greeting", message: "Hi there, what can you help me with?" },
  { label: "out of scope", message: "Who won the FIFA World Cup in 2022?" },
  { label: "list (was 3.25)", message: "What BTech programs does Plaksha University offer?" },
  { label: "cross-page (was 3.13)", message: "How many students and faculty does Plaksha have?" },
  {
    label: "follow-up (pronoun)",
    message: "And what about the hostel fee for that?",
    history: [
      { role: "user", content: "How much is the annual tuition fee at Plaksha?" },
      { role: "assistant", content: "The annual BTech tuition fee is ₹8,40,000 for Category A students." },
    ],
  },
  { label: "unanswerable (fallback ladder)", message: "What is the wifi password in the Plaksha hostel?" },
];

async function main() {
  const only = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  const cases = only !== null ? [CASES[only]!] : CASES;

  for (const c of cases) {
    const t0 = Date.now();
    try {
      const res = await answerQuestionWithRag({ siteId: SITE, message: c.message, history: c.history ?? [] });
      console.log(`\n${"─".repeat(74)}`);
      console.log(`▸ ${c.label}  [${Date.now() - t0}ms, path=${res.path}]`);
      console.log(`  Q: ${c.message}`);
      console.log(`  A: ${res.answer.replace(/\n/g, "\n     ")}`);
      console.log(`  links: ${res.pageLinks.map((l) => l.url.split("#")[0]).join(", ") || "(none)"}`);
      console.log(`  follow-ups: ${res.followUps.join(" | ") || "(none)"}`);
    } catch (err) {
      console.log(`\n▸ ${c.label} FAILED after ${Date.now() - t0}ms: ${(err as Error).message.slice(0, 250)}`);
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
