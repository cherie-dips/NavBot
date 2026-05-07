/**
 * Baseline comparison: Single-prompt RAG vs Agentic RAG
 *
 * Usage:
 *   pnpm --filter api eval:baselines
 *
 * Requires: GOOGLE_API_KEY, PINECONE_API_KEY, PINECONE_INDEX, DATABASE_URL
 * Set EVAL_SITE_ID to your target site (default: first site in DB).
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { querySiteDocs } from "../src/services/vectorstore";
import { answerQuestionWithRag } from "../src/services/rag";
import {
  generateContentText,
  GROQ_MODELS,
} from "../src/services/gemini-client";

interface DatasetExample {
  id: string;
  question: string;
  ground_truth: string;
  expected_sources: string[];
  category: string;
}

interface Dataset {
  metadata: { siteId: string };
  examples: DatasetExample[];
}

interface BaselineResult {
  id: string;
  question: string;
  ground_truth: string;
  category: string;
  single_prompt_answer: string;
  agentic_answer: string;
  single_prompt_latency_ms: number;
  agentic_latency_ms: number;
}

const DATASET_PATH = path.join(__dirname, "dataset.json");
const OUTPUT_PATH = path.join(__dirname, "baseline-results.json");

const RPM_LIMIT = parseInt(process.env.EVAL_RPM ?? "5", 10);
const DELAY_BETWEEN_CALLS_MS = Math.ceil((60 / RPM_LIMIT) * 1000);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function singlePromptRag(siteId: string, question: string): Promise<string> {
  const docs = await querySiteDocs({
    siteId,
    query: [question],
    topK: 8,
  });

  if (docs.length === 0) {
    return "I couldn't find relevant information to answer that question.";
  }

  const context = docs
    .slice(0, 6)
    .map((d, i) => `[Source ${i + 1}] ${d.title}\n${d.content.slice(0, 1500)}`)
    .join("\n\n---\n\n");

  const prompt = `You are a helpful website assistant. Answer the user's question using ONLY the provided context. If the answer is not in the context, say you don't have that information.

CONTEXT:
${context}

USER QUESTION: ${question}

Answer concisely:`;

  const answer = await generateContentText({
    model: GROQ_MODELS.chat,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.2, maxOutputTokens: 500 },
  });

  return answer.trim();
}

async function agenticRag(siteId: string, question: string): Promise<string> {
  const result = await answerQuestionWithRag({
    siteId,
    message: question,
    history: [],
  });
  return result.answer;
}

async function main() {
  const siteId = process.env.EVAL_SITE_ID || "plaksha.edu.in";
  if (!siteId) {
    console.error("Set EVAL_SITE_ID environment variable to your target site ID.");
    process.exit(1);
  }

  const dataset: Dataset = JSON.parse(fs.readFileSync(DATASET_PATH, "utf-8"));
  const examples = dataset.examples;

  // Resume from previous partial run if available
  let results: BaselineResult[] = [];
  const doneIds = new Set<string>();
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8")) as { results: BaselineResult[] };
      if (Array.isArray(prev.results)) {
        results = prev.results;
        for (const r of results) doneIds.add(r.id);
        console.log(`Resuming: ${doneIds.size} questions already completed, skipping them.`);
      }
    } catch { /* start fresh */ }
  }

  const remaining = examples.filter((e) => !doneIds.has(e.id));
  console.log(`\nRunning baselines on ${remaining.length} questions for site "${siteId}" (${RPM_LIMIT} RPM)...\n`);
  console.log("=".repeat(80));

  for (let i = 0; i < remaining.length; i++) {
    const ex = remaining[i]!;
    console.log(`\n[${ex.id}] (${i + 1}/${remaining.length}) ${ex.question}`);

    // --- Single-prompt baseline (1 LLM call) ---
    const t0 = Date.now();
    let singleAnswer: string;
    try {
      singleAnswer = await singlePromptRag(siteId, ex.question);
    } catch (err) {
      singleAnswer = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
    const singleLatency = Date.now() - t0;

    // Rate-limit pause between single-prompt and agentic
    console.log(`  [rate-limit] waiting ${DELAY_BETWEEN_CALLS_MS / 1000}s...`);
    await sleep(DELAY_BETWEEN_CALLS_MS);

    // --- Agentic baseline (2-3 LLM calls internally) ---
    const t1 = Date.now();
    let agenticAnswer: string;
    try {
      agenticAnswer = await agenticRag(siteId, ex.question);
    } catch (err) {
      agenticAnswer = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
    const agenticLatency = Date.now() - t1;

    results.push({
      id: ex.id,
      question: ex.question,
      ground_truth: ex.ground_truth,
      category: ex.category,
      single_prompt_answer: singleAnswer,
      agentic_answer: agenticAnswer,
      single_prompt_latency_ms: singleLatency,
      agentic_latency_ms: agenticLatency,
    });

    // Save after every question so progress is not lost
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ siteId, results }, null, 2));

    console.log(`  Single-prompt (${singleLatency}ms): ${singleAnswer.slice(0, 100)}...`);
    console.log(`  Agentic       (${agenticLatency}ms): ${agenticAnswer.slice(0, 100)}...`);

    // Rate-limit pause before next question
    if (i < remaining.length - 1) {
      const pauseSec = (DELAY_BETWEEN_CALLS_MS * 2) / 1000;
      console.log(`  [rate-limit] waiting ${pauseSec}s before next question...`);
      await sleep(DELAY_BETWEEN_CALLS_MS * 2);
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ siteId, results }, null, 2));
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Results saved to: ${OUTPUT_PATH}`);

  const avgSingle = results.reduce((s, r) => s + r.single_prompt_latency_ms, 0) / results.length;
  const avgAgentic = results.reduce((s, r) => s + r.agentic_latency_ms, 0) / results.length;

  console.log(`\nLatency Summary:`);
  console.log(`  Single-prompt avg: ${avgSingle.toFixed(0)}ms`);
  console.log(`  Agentic avg:       ${avgAgentic.toFixed(0)}ms`);
  console.log(`\nRun 'pnpm --filter api eval:judge' to score both baselines with LLM-as-judge.\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
