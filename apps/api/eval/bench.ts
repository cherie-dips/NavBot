/**
 * NavBot benchmark — runs the live RAG pipeline over the Plaksha dataset and
 * scores every answer with an LLM judge on correctness, groundedness and relevance.
 *
 * Usage:
 *   npx tsx eval/bench.ts --label before            # full dataset
 *   npx tsx eval/bench.ts --label after --limit 40  # fixed stratified subset
 *   npx tsx eval/bench.ts --compare before after
 *
 * Writes eval/runs/<label>.json. Resumable: re-running a label skips finished ids.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { answerQuestionWithRag } from "../src/services/answer/rag";
import { generateContentText, GEMINI_MODELS } from "../src/services/platform/gemini-client";

interface DatasetExample {
  id: string;
  question: string;
  ground_truth: string;
  expected_sources: string[];
  category: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

interface Scores {
  correctness: number;
  groundedness: number;
  relevance: number;
  explanation: string;
}

interface RunRow {
  id: string;
  question: string;
  category: string;
  ground_truth: string;
  answer: string;
  sources: string[];
  latency_ms: number;
  scores: Scores;
}

const DATASET_PATH = path.join(__dirname, "dataset.json");
const RUNS_DIR = path.join(__dirname, "runs");

const SITE_ID = process.env.EVAL_SITE_ID || "plaksha.edu.in";
const CONCURRENCY = parseInt(process.env.EVAL_CONCURRENCY ?? "3", 10);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Deterministic stratified subset so before/after compare like for like. */
function stratify(examples: DatasetExample[], limit: number): DatasetExample[] {
  if (!limit || limit >= examples.length) return examples;
  const byCat = new Map<string, DatasetExample[]>();
  for (const e of examples) {
    const a = byCat.get(e.category) ?? [];
    a.push(e);
    byCat.set(e.category, a);
  }
  // Guarantee at least one of each category, then fill proportionally by id order.
  const out: DatasetExample[] = [];
  const cats = [...byCat.keys()].sort();
  for (const c of cats) out.push(byCat.get(c)![0]!);
  const rest = examples.filter((e) => !out.includes(e)).sort((a, b) => a.id.localeCompare(b.id));
  for (const e of rest) {
    if (out.length >= limit) break;
    out.push(e);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function clamp(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.round(n)));
}

function parseJudge(raw: string): Scores {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return { correctness: 0, groundedness: 0, relevance: 0, explanation: "unparseable" };
  try {
    const p = JSON.parse(m[0]) as Partial<Scores>;
    return {
      correctness: clamp(p.correctness),
      groundedness: clamp(p.groundedness),
      relevance: clamp(p.relevance),
      explanation: typeof p.explanation === "string" ? p.explanation : "",
    };
  } catch {
    return { correctness: 0, groundedness: 0, relevance: 0, explanation: "json error" };
  }
}

async function judge(params: {
  question: string;
  groundTruth: string;
  answer: string;
  category: string;
}): Promise<Scores> {
  const prompt = `You are an evaluation judge for a university website chatbot (Plaksha University). Score the answer. Return JSON only.

QUESTION: ${JSON.stringify(params.question)}

GROUND TRUTH: ${JSON.stringify(params.groundTruth)}

CHATBOT ANSWER: ${JSON.stringify(params.answer)}

CATEGORY: ${params.category}

Score 0-5 on each:
- "correctness": factual accuracy vs ground truth. 5 = all key facts present and correct. 3 = partially correct or missing significant detail. 0 = wrong or contradicts ground truth.
- "groundedness": absence of hallucination. 5 = every claim is the kind of specific fact a university site would state. 0 = fabricated specifics.
- "relevance": does it address what was asked. 5 = directly answers. 0 = off-topic.

Rules:
- Extra correct detail beyond ground truth is NOT penalised.
- Different phrasing or formatting is NOT penalised. Judge facts, not wording.
- A refusal ("I don't have that information") when the ground truth has a real answer = correctness 0, relevance 1.
- "conversational": a natural, friendly reply scores 5 on all three.
- "out_of_scope": correctly declining and redirecting to the university's own topics scores 5 on all three. Answering an off-topic question from outside knowledge scores low on correctness.
- "computation": the arithmetic must be right; check it.

Return: {"correctness": <0-5>, "groundedness": <0-5>, "relevance": <0-5>, "explanation": "<1-2 sentences>"}`;

  const raw = await generateContentText({
    model: GEMINI_MODELS.chat,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0, maxOutputTokens: 400, responseMimeType: "application/json" },
  });
  return parseJudge(raw);
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function pct(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
}

function summarise(rows: RunRow[], label: string) {
  const avg = (f: (r: RunRow) => number) => rows.reduce((s, r) => s + f(r), 0) / (rows.length || 1);
  const lat = rows.map((r) => r.latency_ms).sort((a, b) => a - b);
  const c = avg((r) => r.scores.correctness);
  const g = avg((r) => r.scores.groundedness);
  const rel = avg((r) => r.scores.relevance);

  console.log(`\n${"=".repeat(74)}`);
  console.log(`RUN "${label}" — ${rows.length} questions, site ${SITE_ID}`);
  console.log("=".repeat(74));
  console.log(`  Correctness   ${c.toFixed(2)} / 5`);
  console.log(`  Groundedness  ${g.toFixed(2)} / 5`);
  console.log(`  Relevance     ${rel.toFixed(2)} / 5`);
  console.log(`  Overall       ${((c + g + rel) / 3).toFixed(2)} / 5`);
  console.log(`  Latency       p50 ${pct(lat, 0.5)}ms · p90 ${pct(lat, 0.9)}ms · max ${lat[lat.length - 1]}ms`);
  console.log(`  Weak (corr<=2) ${rows.filter((r) => r.scores.correctness <= 2).length} / ${rows.length}`);

  const byCat = new Map<string, RunRow[]>();
  for (const r of rows) {
    const a = byCat.get(r.category) ?? [];
    a.push(r);
    byCat.set(r.category, a);
  }
  console.log(`\n  ${"category".padEnd(15)} ${"n".padStart(3)}  ${"corr".padStart(5)} ${"grnd".padStart(5)} ${"rel".padStart(5)}  ${"p50 ms".padStart(8)}`);
  for (const [cat, rs] of [...byCat.entries()].sort()) {
    const a = (f: (r: RunRow) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
    const l = rs.map((r) => r.latency_ms).sort((x, y) => x - y);
    console.log(
      `  ${cat.padEnd(15)} ${String(rs.length).padStart(3)}  ${a((r) => r.scores.correctness).toFixed(2).padStart(5)} ${a((r) => r.scores.groundedness).toFixed(2).padStart(5)} ${a((r) => r.scores.relevance).toFixed(2).padStart(5)}  ${String(pct(l, 0.5)).padStart(8)}`
    );
  }
  console.log("=".repeat(74));
}

function compare(a: string, b: string) {
  const load = (l: string) => JSON.parse(fs.readFileSync(path.join(RUNS_DIR, `${l}.json`), "utf-8")).rows as RunRow[];
  const ra = load(a);
  const rb = load(b);
  const ids = new Set(ra.map((r) => r.id));
  const paired = rb.filter((r) => ids.has(r.id));
  const byId = new Map(ra.map((r) => [r.id, r]));

  const stat = (rows: RunRow[], f: (r: RunRow) => number) => rows.reduce((s, r) => s + f(r), 0) / (rows.length || 1);
  const latOf = (rows: RunRow[]) => {
    const l = rows.map((r) => r.latency_ms).sort((x, y) => x - y);
    return { p50: pct(l, 0.5), p90: pct(l, 0.9) };
  };
  const before = ra.filter((r) => paired.some((p) => p.id === r.id));
  const la = latOf(before);
  const lb = latOf(paired);

  console.log(`\n${"=".repeat(74)}`);
  console.log(`COMPARISON — ${paired.length} paired questions`);
  console.log("=".repeat(74));
  const line = (name: string, x: number, y: number, unit = "") => {
    const d = y - x;
    const sign = d >= 0 ? "+" : "";
    console.log(`  ${name.padEnd(15)} ${x.toFixed(2).padStart(8)}${unit} → ${y.toFixed(2).padStart(8)}${unit}   ${sign}${d.toFixed(2)}${unit}`);
  };
  line("Correctness", stat(before, (r) => r.scores.correctness), stat(paired, (r) => r.scores.correctness));
  line("Groundedness", stat(before, (r) => r.scores.groundedness), stat(paired, (r) => r.scores.groundedness));
  line("Relevance", stat(before, (r) => r.scores.relevance), stat(paired, (r) => r.scores.relevance));
  console.log(`  ${"Latency p50".padEnd(15)} ${String(la.p50).padStart(8)}ms → ${String(lb.p50).padStart(8)}ms   ${lb.p50 - la.p50 >= 0 ? "+" : ""}${lb.p50 - la.p50}ms`);
  console.log(`  ${"Latency p90".padEnd(15)} ${String(la.p90).padStart(8)}ms → ${String(lb.p90).padStart(8)}ms   ${lb.p90 - la.p90 >= 0 ? "+" : ""}${lb.p90 - la.p90}ms`);

  console.log(`\n  Per-category correctness:`);
  const cats = [...new Set(paired.map((r) => r.category))].sort();
  for (const c of cats) {
    const pb = paired.filter((r) => r.category === c);
    const pa = before.filter((r) => r.category === c);
    const x = stat(pa, (r) => r.scores.correctness);
    const y = stat(pb, (r) => r.scores.correctness);
    const d = y - x;
    console.log(`    ${c.padEnd(15)} n=${String(pb.length).padStart(3)}  ${x.toFixed(2)} → ${y.toFixed(2)}  ${d >= 0 ? "+" : ""}${d.toFixed(2)}`);
  }

  const regressions = paired
    .map((p) => ({ p, before: byId.get(p.id)! }))
    .filter((x) => x.p.scores.correctness < x.before.scores.correctness - 1);
  if (regressions.length) {
    console.log(`\n  Regressions (correctness dropped >1):`);
    for (const r of regressions) {
      console.log(`    [${r.p.id}] ${r.before.scores.correctness} → ${r.p.scores.correctness}  ${r.p.question.slice(0, 60)}`);
    }
  } else {
    console.log(`\n  No correctness regressions >1 point.`);
  }
  console.log("=".repeat(74));
}

async function main() {
  const cmp = arg("compare");
  if (cmp) {
    compare(cmp, process.argv[process.argv.indexOf("--compare") + 2]!);
    return;
  }

  const label = arg("label") ?? "run";
  const limit = parseInt(arg("limit") ?? "0", 10);
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const outPath = path.join(RUNS_DIR, `${label}.json`);

  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, "utf-8")) as { examples: DatasetExample[] };
  const examples = stratify(dataset.examples, limit);

  let rows: RunRow[] = [];
  const done = new Set<string>();
  if (fs.existsSync(outPath)) {
    try {
      rows = JSON.parse(fs.readFileSync(outPath, "utf-8")).rows as RunRow[];
      for (const r of rows) done.add(r.id);
      console.log(`Resuming "${label}": ${done.size} already done.`);
    } catch { /* fresh */ }
  }

  const todo = examples.filter((e) => !done.has(e.id));
  console.log(`Benchmarking ${todo.length} questions (concurrency ${CONCURRENCY}) → ${outPath}\n`);

  let completed = 0;
  await mapPool(todo, CONCURRENCY, async (ex) => {
    const t0 = Date.now();
    let answer = "";
    let sources: string[] = [];
    try {
      const res = await answerQuestionWithRag({
        siteId: SITE_ID,
        message: ex.question,
        history: ex.history ?? [],
      });
      answer = res.answer;
      sources = (res.sources ?? []).map((s: { url: string }) => s.url).slice(0, 8);
    } catch (err) {
      answer = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
    const latency = Date.now() - t0;

    let scores: Scores;
    try {
      scores = await judge({
        question: ex.question,
        groundTruth: ex.ground_truth,
        answer,
        category: ex.category,
      });
    } catch (err) {
      scores = { correctness: 0, groundedness: 0, relevance: 0, explanation: `judge failed: ${err instanceof Error ? err.message : err}` };
    }

    const row: RunRow = {
      id: ex.id,
      question: ex.question,
      category: ex.category,
      ground_truth: ex.ground_truth,
      answer,
      sources,
      latency_ms: latency,
      scores,
    };
    rows.push(row);
    rows.sort((a, b) => a.id.localeCompare(b.id));
    fs.writeFileSync(outPath, JSON.stringify({ label, siteId: SITE_ID, rows }, null, 2));
    // Append-only sibling, written before any sort so it always records the row just
    // produced. Answers cost API quota that replenishes daily, so a rewritten or
    // deleted <label>.json must never be the only copy.
    fs.appendFileSync(
      outPath.replace(/\.json$/, ".jsonl"),
      JSON.stringify({ at: new Date().toISOString(), ...row }) + "\n"
    );

    completed++;
    console.log(
      `[${ex.id}] ${String(completed).padStart(3)}/${todo.length} ${latency}ms c=${scores.correctness} g=${scores.groundedness} r=${scores.relevance}  ${ex.question.slice(0, 52)}`
    );
    return null;
  });

  summarise(rows, label);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
