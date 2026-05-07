import { GoogleGenAI, type GenerateContentConfig, type GenerateContentResponse } from "@google/genai";

// ---------------------------------------------------------------------------
// API key: GOOGLE_API_KEY preferred (matches plan); GEMINI_API_KEY fallback.
// @google/genai also reads env internally when apiKey omitted.
// ---------------------------------------------------------------------------
export function getGeminiApiKey(): string {
  const k = process.env.GOOGLE_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  return k ?? "";
}

let _client: GoogleGenAI | null = null;

export function getGoogleGenAI(): GoogleGenAI {
  if (!_client) {
    const apiKey = getGeminiApiKey();
    _client = new GoogleGenAI({ apiKey: apiKey || undefined });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Model IDs (free-tier defaults per plan)
// ---------------------------------------------------------------------------
export const GEMINI_MODELS = {
  chat: process.env.GEMINI_CHAT_MODEL?.trim() || "gemma-4-31b-it",
  planner: process.env.GEMINI_PLANNER_MODEL?.trim() || "gemma-4-26b-a4b-it",
  judge: process.env.GEMINI_JUDGE_MODEL?.trim() || "gemma-4-26b-a4b-it",
  stt: process.env.GEMINI_STT_MODEL?.trim() || "gemini-2.5-flash",
  tts: process.env.GEMINI_TTS_MODEL?.trim() || "gemini-2.5-flash-preview-tts",
} as const;

/** Max refiner retries when retrieval looks weak. Planner runs separately when enabled. */
export function agenticRagMaxRounds(): number {
  const n = parseInt(process.env.AGENTIC_RAG_MAX_ROUNDS ?? "1", 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 3) : 1;
}

export function agenticPlannerEnabled(): boolean {
  const v = (process.env.ENABLE_AGENTIC_PLANNER ?? "true").toLowerCase();
  return v !== "false" && v !== "0";
}

export function llmJudgeEnabled(): boolean {
  const v = (process.env.ENABLE_LLM_JUDGE ?? "false").toLowerCase();
  return v !== "false" && v !== "0";
}

// ---------------------------------------------------------------------------
// Retry (transient errors)
// ---------------------------------------------------------------------------

const DEFAULT_EMBED_429_MIN_MS = 60_000;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Parse suggested wait from Gemini/Google 429 responses (message text or RetryInfo).
 * Returns milliseconds, or null if not found.
 */
export function parseGemini429RetryDelayMs(err: unknown): number | null {
  const msg = getErrorMessage(err);

  const inline = /please retry in ([\d.]+)\s*s\.?/i.exec(msg);
  if (inline) {
    const sec = parseFloat(inline[1]!);
    if (Number.isFinite(sec) && sec >= 0) return Math.ceil(sec * 1000) + 250;
  }

  const retryAfterHdr =
    typeof (err as { response?: { headers?: { get?: (n: string) => string | null } } })?.response
      ?.headers?.get === "function"
      ? (err as { response: { headers: { get: (n: string) => string | null } } }).response.headers.get(
          "retry-after"
        )
      : null;
  if (retryAfterHdr) {
    const asInt = parseInt(retryAfterHdr, 10);
    if (Number.isFinite(asInt) && asInt >= 0) return asInt * 1000 + 250;
    const dateMs = Date.parse(retryAfterHdr);
    if (!Number.isNaN(dateMs)) {
      const delta = dateMs - Date.now();
      if (delta > 0) return Math.ceil(delta) + 250;
    }
  }

  try {
    const brace = msg.indexOf("{");
    if (brace >= 0) {
      let depth = 0;
      let end = -1;
      for (let i = brace; i < msg.length; i++) {
        const c = msg[i]!;
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end > brace) {
        const o = JSON.parse(msg.slice(brace, end + 1)) as {
          error?: { details?: unknown[]; message?: string };
        };
        const details = o.error?.details;
        if (Array.isArray(details)) {
          for (const d of details) {
            if (!d || typeof d !== "object") continue;
            const t = (d as { "@type"?: string })["@type"];
            if (typeof t === "string" && t.includes("RetryInfo")) {
              const rd = (d as { retryDelay?: string }).retryDelay;
              if (typeof rd === "string") {
                const m = /^(\d+(?:\.\d+)?)s$/i.exec(rd.trim());
                if (m) {
                  const sec = parseFloat(m[1]!);
                  if (Number.isFinite(sec) && sec >= 0) return Math.ceil(sec * 1000) + 250;
                }
              }
            }
          }
        }
      }
    }
  } catch {
    /* ignore JSON parse */
  }

  return null;
}

function isRetryableGeminiError(msg: string): boolean {
  return (
    msg.includes("500") ||
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("rate") ||
    msg.includes("timeout") ||
    msg.includes("ECONNRESET")
  );
}

export type GeminiRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  label?: string;
  /**
   * For 429 / RESOURCE_EXHAUSTED: wait max(parseGemini429RetryDelayMs, this) ms.
   * Use for embedding index bursts (free-tier per-minute caps).
   */
  minDelayOn429Ms?: number;
};

export async function geminiWithRetry<T>(fn: () => Promise<T>, options?: GeminiRetryOptions): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 800;
  const label = options?.label ?? "Gemini";
  const minDelayOn429Ms = options?.minDelayOn429Ms;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const msg = getErrorMessage(err);
      const retryable = isRetryableGeminiError(msg);

      if (!retryable || attempt === maxAttempts) throw err;

      const is429 = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
      let waitMs: number;
      if (is429) {
        const hintMs = parseGemini429RetryDelayMs(err);
        if (minDelayOn429Ms != null) {
          waitMs = Math.max(hintMs ?? 0, minDelayOn429Ms);
        } else {
          waitMs = Math.max(hintMs ?? 0, baseDelayMs * attempt);
        }
        waitMs += Math.floor(Math.random() * 1500);
      } else {
        waitMs = baseDelayMs * attempt;
      }

      console.warn(
        `${label} request failed (attempt ${attempt}/${maxAttempts}): ${msg.slice(0, 500)}${msg.length > 500 ? "…" : ""}. Retrying in ${(waitMs / 1000).toFixed(1)}s...`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

export function extractResponseText(response: GenerateContentResponse): string {
  const t = response.text?.trim();
  if (t) return t;
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts?.length) return "";
  const chunks: string[] = [];
  for (const p of parts) {
    if (p && typeof (p as { text?: string }).text === "string") {
      chunks.push((p as { text: string }).text);
    }
  }
  return chunks.join("").trim();
}

export async function generateContentText(params: {
  model: string;
  contents: unknown;
  config?: GenerateContentConfig;
}): Promise<string> {
  const ai = getGoogleGenAI();
  const config: GenerateContentConfig = { ...(params.config ?? {}) };

  const response = await geminiWithRetry(
    () =>
      ai.models.generateContent({
        model: params.model,
        contents: params.contents as never,
        config,
      }),
    { maxAttempts: 3, baseDelayMs: 800, label: "generateContent" }
  );

  return extractResponseText(response);
}
