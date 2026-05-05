/**
 * LLM-as-Judge Evaluation for NavBot RAG endpoint
 *
 * Scores responses from both baselines (single-prompt and agentic) on:
 *   - Correctness (0-5): Does the answer match the ground truth?
 *   - Groundedness (0-5): Is the answer grounded in retrievable website content (no hallucination)?
 *   - Relevance (0-5): Does the answer address the user's question?
 *
 * Usage:
 *   pnpm --filter api eval:judge
 *
 * Requires: GOOGLE_API_KEY (for Gemini judge), baseline-results.json (from eval:baselines)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  generateContentText,
  GEMINI_MODELS,
} from "../src/services/gemini-client";

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

interface JudgeScores {
  correctness: number;
  groundedness: number;
  relevance: number;
  explanation: string;
}

interface EvalResult {
  id: string;
  question: string;
  category: string;
  ground_truth: string;
  single_prompt: {
    answer: string;
    scores: JudgeScores;
    latency_ms: number;
  };
  agentic: {
    answer: string;
    scores: JudgeScores;
    latency_ms: number;
  };
}

const BASELINES_PATH = path.join(__dirname, "baseline-results.json");
const OUTPUT_PATH = path.join(__dirname, "eval-results.json");

function parseJudgeResponse(raw: string): JudgeScores {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    return { correctness: 0, groundedness: 0, relevance: 0, explanation: "Failed to parse judge response" };
  }
  try {
    const parsed = JSON.parse(match[0]) as Partial<JudgeScores>;
    return {
      correctness: clampScore(parsed.correctness),
      groundedness: clampScore(parsed.groundedness),
      relevance: clampScore(parsed.relevance),
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : "",
    };
  } catch {
    return { correctness: 0, groundedness: 0, relevance: 0, explanation: "JSON parse error" };
  }
}

function clampScore(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.round(n)));
}

async function judgeAnswer(params: {
  question: string;
  groundTruth: string;
  answer: string;
  category: string;
}): Promise<JudgeScores> {
  const prompt = `You are an evaluation judge for a RAG-based website chatbot. Score the following answer on three criteria. Return JSON only.

QUESTION: ${JSON.stringify(params.question)}

GROUND TRUTH (the correct answer): ${JSON.stringify(params.groundTruth)}

CHATBOT ANSWER (to evaluate): ${JSON.stringify(params.answer)}

CATEGORY: ${params.category}

Score each criterion from 0-5:
- "correctness": How factually accurate is the answer compared to ground truth? (5 = perfect match, 0 = completely wrong or contradicts ground truth)
- "groundedness": Is the answer grounded in facts without hallucination? (5 = no hallucinated claims, 0 = mostly made up)
- "relevance": Does the answer address the user's question? (5 = directly answers the question, 0 = completely off-topic)

Special cases:
- For "conversational" category: be lenient on correctness if the bot responds naturally
- For "out_of_scope" category: give high scores if the bot correctly declines to answer
- For "computation" category: check if the math is correct

Return: {"correctness": <0-5>, "groundedness": <0-5>, "relevance": <0-5>, "explanation": "<1-2 sentence justification>"}`;

  const raw = await generateContentText({
    model: GEMINI_MODELS.judge,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.1,
      maxOutputTokens: 300,
      responseMimeType: "application/json",
    },
  });

  return parseJudgeResponse(raw);
}

function printSummaryTable(results: EvalResult[]) {
  console.log("\n" + "=".repeat(100));
  console.log("EVALUATION SUMMARY");
  console.log("=".repeat(100));

  const header = "| ID   | Category       | Single Corr | Single Grnd | Single Rel | Agentic Corr | Agentic Grnd | Agentic Rel |";
  const sep = "|------|----------------|-------------|-------------|------------|--------------|--------------|-------------|";
  console.log(header);
  console.log(sep);

  for (const r of results) {
    const s = r.single_prompt.scores;
    const a = r.agentic.scores;
    console.log(
      `| ${r.id.padEnd(4)} | ${r.category.padEnd(14)} | ${String(s.correctness).padEnd(11)} | ${String(s.groundedness).padEnd(11)} | ${String(s.relevance).padEnd(10)} | ${String(a.correctness).padEnd(12)} | ${String(a.groundedness).padEnd(12)} | ${String(a.relevance).padEnd(11)} |`
    );
  }

  console.log(sep);

  const avgSingle = {
    correctness: results.reduce((s, r) => s + r.single_prompt.scores.correctness, 0) / results.length,
    groundedness: results.reduce((s, r) => s + r.single_prompt.scores.groundedness, 0) / results.length,
    relevance: results.reduce((s, r) => s + r.single_prompt.scores.relevance, 0) / results.length,
  };

  const avgAgentic = {
    correctness: results.reduce((s, r) => s + r.agentic.scores.correctness, 0) / results.length,
    groundedness: results.reduce((s, r) => s + r.agentic.scores.groundedness, 0) / results.length,
    relevance: results.reduce((s, r) => s + r.agentic.scores.relevance, 0) / results.length,
  };

  console.log(
    `| AVG  |                | ${avgSingle.correctness.toFixed(2).padEnd(11)} | ${avgSingle.groundedness.toFixed(2).padEnd(11)} | ${avgSingle.relevance.toFixed(2).padEnd(10)} | ${avgAgentic.correctness.toFixed(2).padEnd(12)} | ${avgAgentic.groundedness.toFixed(2).padEnd(12)} | ${avgAgentic.relevance.toFixed(2).padEnd(11)} |`
  );

  console.log("\n" + "-".repeat(60));
  console.log("AGGREGATE SCORES (higher is better, max 5.0):");
  console.log("-".repeat(60));
  console.log(`  Single-prompt baseline:`);
  console.log(`    Correctness:  ${avgSingle.correctness.toFixed(2)}/5`);
  console.log(`    Groundedness: ${avgSingle.groundedness.toFixed(2)}/5`);
  console.log(`    Relevance:    ${avgSingle.relevance.toFixed(2)}/5`);
  console.log(`    Overall:      ${((avgSingle.correctness + avgSingle.groundedness + avgSingle.relevance) / 3).toFixed(2)}/5`);
  console.log();
  console.log(`  Agentic RAG (planner + refiner + judge):`);
  console.log(`    Correctness:  ${avgAgentic.correctness.toFixed(2)}/5`);
  console.log(`    Groundedness: ${avgAgentic.groundedness.toFixed(2)}/5`);
  console.log(`    Relevance:    ${avgAgentic.relevance.toFixed(2)}/5`);
  console.log(`    Overall:      ${((avgAgentic.correctness + avgAgentic.groundedness + avgAgentic.relevance) / 3).toFixed(2)}/5`);

  const improvement = (
    ((avgAgentic.correctness + avgAgentic.groundedness + avgAgentic.relevance) -
      (avgSingle.correctness + avgSingle.groundedness + avgSingle.relevance)) /
    (avgSingle.correctness + avgSingle.groundedness + avgSingle.relevance) *
    100
  ).toFixed(1);
  console.log(`\n  Agentic improvement over single-prompt: ${improvement}%`);

  const avgSingleLatency = results.reduce((s, r) => s + r.single_prompt.latency_ms, 0) / results.length;
  const avgAgenticLatency = results.reduce((s, r) => s + r.agentic.latency_ms, 0) / results.length;
  console.log(`\n  Latency:`);
  console.log(`    Single-prompt avg: ${avgSingleLatency.toFixed(0)}ms`);
  console.log(`    Agentic avg:       ${avgAgenticLatency.toFixed(0)}ms`);
  console.log("=".repeat(100));
}

async function main() {
  if (!fs.existsSync(BASELINES_PATH)) {
    console.error("baseline-results.json not found. Run 'pnpm --filter api eval:baselines' first.");
    process.exit(1);
  }

  const { results: baselines } = JSON.parse(fs.readFileSync(BASELINES_PATH, "utf-8")) as {
    siteId: string;
    results: BaselineResult[];
  };

  console.log(`\nEvaluating ${baselines.length} responses with LLM-as-judge (${GEMINI_MODELS.judge})...\n`);

  const evalResults: EvalResult[] = [];

  for (const b of baselines) {
    console.log(`[${b.id}] Judging: ${b.question.slice(0, 60)}...`);

    const singleScores = await judgeAnswer({
      question: b.question,
      groundTruth: b.ground_truth,
      answer: b.single_prompt_answer,
      category: b.category,
    });

    const agenticScores = await judgeAnswer({
      question: b.question,
      groundTruth: b.ground_truth,
      answer: b.agentic_answer,
      category: b.category,
    });

    evalResults.push({
      id: b.id,
      question: b.question,
      category: b.category,
      ground_truth: b.ground_truth,
      single_prompt: {
        answer: b.single_prompt_answer,
        scores: singleScores,
        latency_ms: b.single_prompt_latency_ms,
      },
      agentic: {
        answer: b.agentic_answer,
        scores: agenticScores,
        latency_ms: b.agentic_latency_ms,
      },
    });

    console.log(`  Single: corr=${singleScores.correctness} grnd=${singleScores.groundedness} rel=${singleScores.relevance}`);
    console.log(`  Agentic: corr=${agenticScores.correctness} grnd=${agenticScores.groundedness} rel=${agenticScores.relevance}`);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ evalResults }, null, 2));
  console.log(`\nDetailed results saved to: ${OUTPUT_PATH}`);

  printSummaryTable(evalResults);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
