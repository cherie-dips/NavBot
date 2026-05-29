import { GoogleGenAI } from "@google/genai";

// ---------------------------------------------------------------------------
// API key
// ---------------------------------------------------------------------------
export function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY?.trim() ?? "";
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

export const GEMINI_MODELS = {
  chat: GEMINI_CHAT_MODEL,
  tts: "gemini-2.5-flash",
  stt: "gemini-2.5-flash",
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
    msg.includes("ECONNRESET")
  );
}

export type RetryOptions = {
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

      const waitMs = baseDelayMs * attempt + Math.floor(Math.random() * 1000);
      console.warn(
        `${label} request failed (attempt ${attempt}/${maxAttempts}): ${msg.slice(0, 300)}. Retrying in ${(waitMs / 1000).toFixed(1)}s...`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

// Backward-compat aliases for eval scripts
export const geminiWithRetry = withRetry;
export type GeminiRetryOptions = RetryOptions;
export function parseGemini429RetryDelayMs(_err: unknown): number | null {
  return null;
}

// ---------------------------------------------------------------------------
// Gemini generateContent
// ---------------------------------------------------------------------------
export async function generateContentText(params: {
  model: string;
  contents: unknown;
  config?: {
    systemInstruction?: string;
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
  };
}): Promise<string> {
  const ai = getGoogleGenAI();

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: params.model,
        contents: params.contents as Parameters<typeof ai.models.generateContent>[0]["contents"],
        config: {
          systemInstruction: params.config?.systemInstruction,
          temperature: params.config?.temperature ?? 0.2,
          maxOutputTokens: params.config?.maxOutputTokens ?? 1024,
          responseMimeType: params.config?.responseMimeType,
        },
      }),
    { maxAttempts: 3, baseDelayMs: 800, label: "Gemini" }
  );

  return response.text?.trim() ?? "";
}
