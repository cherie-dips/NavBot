/**
 * Retrieval-only benchmark. Exercises embed -> query -> boilerplate -> rerank
 * without touching the answer model, so it can be run freely against LLM quota.
 */
import "dotenv/config";
import { runRetrieval } from "../src/services/retrieval/agentic-retrieval";
import type { QueryPlan } from "../src/services/retrieval/query-planner";

const SITE = process.env.EVAL_SITE_ID || "plaksha.edu.in";

// Natural questions, because that is what the planner hands the reranker in
// production. Cross-encoders score question/passage pairs, so bare keyword
// strings understate real relevance.
const CASES: Array<{ q: string; exhaustive: boolean }> = [
  { q: "How much is the annual BTech tuition fee at Plaksha?", exhaustive: false },
  { q: "What are the BTech admission deadlines for 2026?", exhaustive: false },
  { q: "What are the career outcomes for Plaksha BTech graduates?", exhaustive: false },
  { q: "What BTech programs does Plaksha University offer?", exhaustive: true },
  { q: "What research centers does Plaksha have?", exhaustive: true },
  { q: "What scholarships are available at Plaksha?", exhaustive: true },
  { q: "What facilities does the Plaksha campus have?", exhaustive: true },
  { q: "Who are some faculty members at Plaksha?", exhaustive: true },
  { q: "What companies recruit from Plaksha?", exhaustive: true },
];

function plan(q: string, exhaustive: boolean): QueryPlan {
  // `analytical` is false throughout: this benchmark measures retrieval, and the flag
  // only selects how the answer is written, which this harness never reaches.
  return {
    standalone: q,
    intent: "simple",
    subQueries: [q],
    sections: [],
    exhaustive,
    analytical: false,
  };
}

async function main() {
  console.log(`Retrieval benchmark — site ${SITE}\n`);
  const rows: Array<{ q: string; total: number; retrieve: number; rerank: number; cand: number; nav: number; dup: number; kept: number; top: number }> = [];

  // Warm the index config so the first case is not charged for it.
  await runRetrieval({ siteId: SITE, plan: plan("warmup", false) });

  for (const c of CASES) {
    const t0 = Date.now();
    const r = await runRetrieval({ siteId: SITE, plan: plan(c.q, c.exhaustive) });
    rows.push({
      q: c.q,
      total: Date.now() - t0,
      retrieve: r.meta.ms.retrieve,
      rerank: r.meta.ms.rerank,
      cand: r.meta.candidates,
      nav: r.meta.boilerplate.navDropped,
      dup: r.meta.boilerplate.collapsed,
      kept: r.meta.kept,
      top: r.meta.topScore,
    });
  }

  console.log(
    `\n${"query".padEnd(46)} ${"total".padStart(7)} ${"retr".padStart(6)} ${"rank".padStart(6)} ${"cand".padStart(5)} ${"-nav".padStart(5)} ${"-dup".padStart(5)} ${"kept".padStart(5)} ${"top".padStart(6)}`
  );
  console.log("─".repeat(100));
  for (const r of rows) {
    console.log(
      `${r.q.slice(0, 45).padEnd(46)} ${String(r.total).padStart(6)}m ${String(r.retrieve).padStart(5)}m ${String(r.rerank).padStart(5)}m ${String(r.cand).padStart(5)} ${String(r.nav).padStart(5)} ${String(r.dup).padStart(5)} ${String(r.kept).padStart(5)} ${r.top.toFixed(3).padStart(6)}`
    );
  }
  const lat = rows.map((r) => r.total).sort((a, b) => a - b);
  const navTotal = rows.reduce((s, r) => s + r.nav + r.dup, 0);
  const candTotal = rows.reduce((s, r) => s + r.cand, 0);
  console.log("─".repeat(100));
  console.log(
    `p50 ${lat[Math.floor(lat.length / 2)]}ms · max ${lat[lat.length - 1]}ms · boilerplate removed ${navTotal}/${candTotal} (${((navTotal / candTotal) * 100).toFixed(1)}%)`
  );
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
