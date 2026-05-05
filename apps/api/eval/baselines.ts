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
  GEMINI_MODELS,
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
    model: GEMINI_MODELS.chat,
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
  const siteId = process.env.EVAL_SITE_ID || "";
  if (!siteId) {
    console.error("Set EVAL_SITE_ID environment variable to your target site ID.");
    process.exit(1);
  }

  const dataset: Dataset = JSON.parse(fs.readFileSync(DATASET_PATH, "utf-8"));
  const examples = dataset.examples;

  console.log(`\nRunning baselines on ${examples.length} questions for site "${siteId}"...\n`);
  console.log("=".repeat(80));

  const results: BaselineResult[] = [];

  for (const ex of examples) {
    console.log(`\n[${ex.id}] ${ex.question}`);

    const t0 = Date.now();
    let singleAnswer: string;
    try {
      singleAnswer = await singlePromptRag(siteId, ex.question);
    } catch (err) {
      singleAnswer = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
    const singleLatency = Date.now() - t0;

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

    console.log(`  Single-prompt (${singleLatency}ms): ${singleAnswer.slice(0, 100)}...`);
    console.log(`  Agentic       (${agenticLatency}ms): ${agenticAnswer.slice(0, 100)}...`);
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
