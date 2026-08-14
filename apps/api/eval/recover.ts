/**
 * Salvage baseline answers produced by the pre-change pipeline.
 *
 * The structured run files were deleted. Two partial sources survive:
 *   - rag_cache in Postgres: full answers the old pipeline cached during the run
 *   - the run console log: raw model output, truncated to 500 chars by the old
 *     rag.ts logging line
 *
 * Writes eval/runs/recovered-baseline.json with provenance on every entry so this
 * is never mistaken for a clean benchmark.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { Pool } from "pg";

const LOG_PATH = process.argv[2];
const OUT = path.join(__dirname, "runs", "recovered-baseline.json");

interface Recovered {
  question: string | null;
  answer: string;
  truncated: boolean;
  source: "rag_cache" | "console_log";
}

function fromLog(logPath: string): Recovered[] {
  if (!logPath || !fs.existsSync(logPath)) return [];
  const text = fs.readFileSync(logPath, "utf-8");
  const out: Recovered[] = [];

  // The old pipeline logged: [RAG] Raw model output (N chars): <first 500 chars>
  const re = /\[RAG\] Raw model output \((\d+) chars\): ([\s\S]*?)(?=\n\[|\n\s*\n|$)/g;
  for (const m of text.matchAll(re)) {
    const declaredLen = parseInt(m[1]!, 10);
    const body = m[2]!.trim();
    if (!body) continue;
    out.push({
      question: null, // the log line does not carry the question
      answer: body,
      truncated: declaredLen > body.length || declaredLen >= 500,
      source: "console_log",
    });
  }
  return out;
}

async function fromCache(siteId: string): Promise<Recovered[]> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const res = await pool.query(
    `SELECT query_text, answer FROM rag_cache WHERE site_id = $1 ORDER BY created_at DESC`,
    [siteId]
  );
  await pool.end();
  return res.rows.map((r) => ({
    question: r.query_text as string,
    answer: r.answer as string,
    truncated: false,
    source: "rag_cache" as const,
  }));
}

async function main() {
  const siteId = process.env.EVAL_SITE_ID || "plaksha.edu.in";
  const cached = await fromCache(siteId);
  const logged = fromLog(LOG_PATH);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        note:
          "Partial salvage of pre-change (baseline) answers. NOT a clean benchmark: " +
          "judge scores were lost, console_log entries are truncated at 500 chars, and " +
          "questions are unknown for console_log entries.",
        siteId,
        recoveredAt: new Date().toISOString(),
        counts: { rag_cache: cached.length, console_log: logged.length },
        entries: [...cached, ...logged],
      },
      null,
      2
    )
  );

  console.log(`Recovered ${cached.length} full answers from rag_cache`);
  console.log(`Recovered ${logged.length} truncated answers from the console log`);
  console.log(`Written to ${OUT}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
