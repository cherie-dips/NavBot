import { GoogleGenAI } from "@google/genai";

// ---------------------------------------------------------------------------
// API key
// ---------------------------------------------------------------------------
/**
 * GOOGLE_API_KEY is accepted because the README has always told operators it works.
 * It did not, and the only symptom was a startup warning and a bot that answered
 * nothing — so the fallback is implemented rather than the documentation deleted.
 */
export function getGeminiApiKey(): string {
  return (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "").trim();
}

// ---------------------------------------------------------------------------
// Google GenAI client singleton
// ---------------------------------------------------------------------------
let _genAI: GoogleGenAI | null = null;

export function getGoogleGenAI(): GoogleGenAI {
  const key = getGeminiApiKey();
  if (!key) throw new Error("GEMINI_API_KEY is required.");
  if (!_genAI) {
    _genAI = new GoogleGenAI({ apiKey: key });
  }
  return _genAI;
}

// ---------------------------------------------------------------------------
// Model IDs
// ---------------------------------------------------------------------------
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-2.5-flash";
/**
 * The planner runs on every turn and its latency is on the critical path, so it can
 * be pointed at a smaller model than the answer generator. Defaults to the chat
 * model so an unset env var never resolves to a model this project cannot call.
 */
const GEMINI_PLANNER_MODEL = process.env.GEMINI_PLANNER_MODEL?.trim() || GEMINI_CHAT_MODEL;

/**
 * Speech-to-text is ordinary multimodal generation with an audio part, so it runs on
 * the chat model unless overridden — one fewer model ID to keep alive.
 */
const GEMINI_STT_MODEL = process.env.GEMINI_STT_MODEL?.trim() || GEMINI_CHAT_MODEL;

/**
 * Text-to-speech is NOT ordinary generation: it needs a model built for the audio
 * response modality, which the chat models are not. Both of these were hardcoded to
 * "gemini-2.5-flash", which now returns 404 "no longer available to new users" —
 * verified against the live API — so voice replies and read-aloud were both dead.
 */
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL?.trim() || "gemini-3.1-flash-tts-preview";

export const GEMINI_MODELS = {
  chat: GEMINI_CHAT_MODEL,
  planner: GEMINI_PLANNER_MODEL,
  tts: GEMINI_TTS_MODEL,
  stt: GEMINI_STT_MODEL,
} as const;

// ---------------------------------------------------------------------------
// Retry wrapper (rate limits, transient errors)
// ---------------------------------------------------------------------------
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isRetryableError(msg: string): boolean {
  return (
    msg.includes("500") ||
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("rate") ||
    msg.includes("timeout") ||
    msg.includes("ECONNRESET") ||
    msg.includes(EMPTY_RESPONSE_MARKER)
  );
}

/**
 * Thrown when the model returns no usable text. Marked retryable so `withRetry`
 * takes another pass instead of letting an empty string reach the user.
 */
const EMPTY_RESPONSE_MARKER = "navbot_empty_response";

/** Honour the server's own backoff hint on 429 instead of guessing. */
function parseRetryDelayMs(err: unknown): number | null {
  const msg = getErrorMessage(err);
  const m = msg.match(/"retryDelay":"(\d+(?:\.\d+)?)s"/);
  if (!m) return null;
  const seconds = parseFloat(m[1]!);
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, 60_000) : null;
}

type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  label?: string;
};

export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 800;
  const label = options?.label ?? "LLM";

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const msg = getErrorMessage(err);
      if (!isRetryableError(msg) || attempt === maxAttempts) throw err;

      const serverHint = parseRetryDelayMs(err);
      const waitMs =
        serverHint ?? baseDelayMs * attempt + Math.floor(Math.random() * 1000);
      console.warn(
        `${label} request failed (attempt ${attempt}/${maxAttempts}): ${msg.slice(0, 300)}. Retrying in ${(waitMs / 1000).toFixed(1)}s...`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Gemini generateContent
// ---------------------------------------------------------------------------
/**
 * Reasoning tokens are drawn from the SAME budget as the visible answer. With
 * thinking left at its default and a modest `maxOutputTokens`, the model can spend
 * the whole allowance thinking and return truncated or empty text — measured on
 * this project: a 400-token judge call spent 361 tokens on thoughts, emitted 23,
 * and finished with MAX_TOKENS on half a JSON object. That was the blank-response bug.
 *
 * Two defences, because thinking cannot be fully disabled on every model:
 *   1. Ask for the lowest reasoning setting the model family supports.
 *   2. Reserve headroom on top of the answer allowance so thoughts never eat it.
 *
 * The two families spell the setting differently and reject each other's form with
 * a 400: Gemini 2.x takes `thinkingConfig.thinkingBudget`, Gemini 3.x takes
 * `thinkingLevel`. Both were verified against the live API.
 */
// Reasoning and the answer share one pool, so headroom is a cushion, not a guarantee.
// Measured truncations at 2048 on multi-part answers; 3072 leaves the answer intact
// without a meaningful latency cost, since unused budget is never billed or spent.
//
// "high" gets far more, because the whole point of asking for more reasoning is that
// it spends more of the pool thinking — leaving it on the low cushion would truncate
// the answer precisely on the questions that needed the reasoning.
const THINKING_HEADROOM_TOKENS = { low: 3072, high: 8192 } as const;

function isGemini3(model: string): boolean {
  return /gemini-3/i.test(model);
}

function buildGenerationConfig(
  model: string,
  config?: {
    systemInstruction?: string;
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    /** "low" keeps latency down; "high" only where reasoning quality matters. */
    thinkingLevel?: "low" | "high";
  }
) {
  const answerTokens = config?.maxOutputTokens ?? 1024;
  const level = config?.thinkingLevel ?? "low";

  const base = {
    systemInstruction: config?.systemInstruction,
    temperature: config?.temperature ?? 0.2,
    maxOutputTokens: answerTokens + THINKING_HEADROOM_TOKENS[level],
    responseMimeType: config?.responseMimeType,
  };

  return isGemini3(model)
    ? { ...base, thinkingLevel: level }
    : { ...base, thinkingConfig: { thinkingBudget: level === "low" ? 0 : 2048 } };
}

export async function generateContentText(params: {
  model: string;
  contents: unknown;
  config?: {
    systemInstruction?: string;
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    thinkingLevel?: "low" | "high";
  };
  /** Set false for callers that treat empty output as a valid result. */
  requireText?: boolean;
}): Promise<string> {
  const ai = getGoogleGenAI();
  const requireText = params.requireText !== false;

  const response = await withRetry(
    async () => {
      const res = await ai.models.generateContent({
        model: params.model,
        contents: params.contents as Parameters<typeof ai.models.generateContent>[0]["contents"],
        config: buildGenerationConfig(params.model, params.config) as never,
      });
      const text = res.text?.trim() ?? "";
      if (requireText && !text) {
        const finish = res.candidates?.[0]?.finishReason ?? "unknown";
        const usage = res.usageMetadata as { thoughtsTokenCount?: number } | undefined;
        throw new Error(
          `${EMPTY_RESPONSE_MARKER}: no text (finishReason=${finish}, thoughts=${usage?.thoughtsTokenCount ?? 0})`
        );
      }
      return text;
    },
    { maxAttempts: 3, baseDelayMs: 800, label: "Gemini" }
  );

  return response;
}

/**
 * Streaming generation. Yields text deltas as they arrive so the widget can render
 * words instead of a spinner. Falls back to a single non-streamed call if the
 * stream produces nothing, so a stream failure degrades to a slow answer, never
 * to an empty one.
 */
export async function* generateContentStream(params: {
  model: string;
  contents: unknown;
  config?: {
    systemInstruction?: string;
    temperature?: number;
    maxOutputTokens?: number;
    thinkingLevel?: "low" | "high";
  };
}): AsyncGenerator<string, void, unknown> {
  const ai = getGoogleGenAI();
  let emitted = 0;

  try {
    const stream = await withRetry(
      () =>
        ai.models.generateContentStream({
          model: params.model,
          contents: params.contents as Parameters<typeof ai.models.generateContentStream>[0]["contents"],
          config: buildGenerationConfig(params.model, params.config) as never,
        }),
      { maxAttempts: 2, baseDelayMs: 700, label: "Gemini stream" }
    );

    for await (const chunk of stream) {
      const text = chunk.text ?? "";
      if (text) {
        emitted += text.length;
        yield text;
      }
    }
  } catch (err) {
    console.warn(
      `[gemini] stream failed after ${emitted} chars:`,
      err instanceof Error ? err.message.slice(0, 200) : err
    );
    if (emitted > 0) throw err;
  }

  if (emitted === 0) {
    console.warn("[gemini] stream produced no text — falling back to non-streamed call");
    const text = await generateContentText({
      model: params.model,
      contents: params.contents,
      config: params.config,
    });
    if (text) yield text;
  }
}
