import { SarvamAIClient } from "sarvamai";
import Groq from "groq-sdk";

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------
export function getSarvamApiKey(): string {
  return process.env.SARVAM_API_KEY?.trim() ?? "";
}

export function getGroqApiKey(): string {
  return process.env.GROQ_API_KEY?.trim() ?? "";
}

export function getGeminiApiKey(): string { return ""; }

// ---------------------------------------------------------------------------
// Sarvam client singleton (STT & TTS only)
// ---------------------------------------------------------------------------
let _sarvamClient: SarvamAIClient | null = null;

export function getSarvamClient(): SarvamAIClient {
  if (!_sarvamClient) {
    _sarvamClient = new SarvamAIClient({
      apiSubscriptionKey: getSarvamApiKey() || undefined,
    });
  }
  return _sarvamClient;
}

// ---------------------------------------------------------------------------
// Groq client singleton (chat, planner, judge)
// ---------------------------------------------------------------------------
let _groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!_groqClient) {
    _groqClient = new Groq({ apiKey: getGroqApiKey() || undefined });
  }
  return _groqClient;
}

export function getGoogleGenAI(): unknown { return null; }

// ---------------------------------------------------------------------------
// Model IDs
// ---------------------------------------------------------------------------
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL?.trim() || "llama-3.3-70b-versatile";

export const SARVAM_MODELS = {
  chat: GROQ_CHAT_MODEL,
  planner: GROQ_CHAT_MODEL,
  judge: GROQ_CHAT_MODEL,
  stt: process.env.SARVAM_STT_MODEL?.trim() || "saaras:v3",
  tts: process.env.SARVAM_TTS_MODEL?.trim() || "bulbul:v2",
} as const;

export const GROQ_MODELS = SARVAM_MODELS;
export const GEMINI_MODELS = { tts: SARVAM_MODELS.tts } as const;

export const SARVAM_TTS_SPEAKER = process.env.SARVAM_TTS_SPEAKER?.trim() || "anushka";
export const SARVAM_TTS_LANG = process.env.SARVAM_TTS_LANG?.trim() || "en-IN";

/** Max refiner retries when retrieval looks weak. */
export function agenticRagMaxRounds(): number {
  const n = parseInt(process.env.AGENTIC_RAG_MAX_ROUNDS ?? "1", 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 3) : 0;
}

export function agenticPlannerEnabled(): boolean {
  const v = (process.env.ENABLE_AGENTIC_PLANNER ?? "true").toLowerCase();
  return v !== "false" && v !== "0";
}

export function llmJudgeEnabled(): boolean {
  const v = (process.env.ENABLE_LLM_JUDGE ?? "true").toLowerCase();
  return v !== "false" && v !== "0";
}

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
// Groq chat completion
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
  const client = getGroqClient();

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  if (params.config?.systemInstruction) {
    messages.push({ role: "system", content: params.config.systemInstruction });
  }

  const rawContents = params.contents as Array<{
    role: string;
    parts?: Array<{ text?: string }>;
    content?: string;
  }>;

  if (Array.isArray(rawContents)) {
    for (const item of rawContents) {
      const role = item.role === "model" || item.role === "assistant" ? "assistant" : "user";
      let text = "";
      if (item.parts && Array.isArray(item.parts)) {
        text = item.parts.map((p) => p.text ?? "").join("");
      } else if (typeof item.content === "string") {
        text = item.content;
      }
      if (text) {
        messages.push({ role, content: text });
      }
    }
  }

  const cleaned: typeof messages = [];
  for (const msg of messages) {
    const prev = cleaned[cleaned.length - 1];
    if (prev && msg.role !== "system" && prev.role === msg.role) {
      prev.content += "\n\n" + msg.content;
    } else if (msg.role !== "system" && cleaned.every((m) => m.role === "system") && msg.role === "assistant") {
      continue;
    } else {
      cleaned.push({ ...msg });
    }
  }

  const isJsonMode = params.config?.responseMimeType === "application/json";

  if (isJsonMode) {
    const lastMsg = cleaned[cleaned.length - 1];
    if (lastMsg && lastMsg.role === "user" && !lastMsg.content.includes("JSON")) {
      lastMsg.content += "\n\nRespond with valid JSON only.";
    }
  }

  const response = await withRetry(
    () =>
      client.chat.completions.create({
        model: params.model,
        messages: cleaned,
        temperature: params.config?.temperature ?? 0.2,
        max_tokens: params.config?.maxOutputTokens ?? 1024,
        ...(isJsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    { maxAttempts: 3, baseDelayMs: 800, label: "Groq" }
  );

  return response.choices?.[0]?.message?.content?.trim() ?? "";
}
