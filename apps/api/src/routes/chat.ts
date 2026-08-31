import { Router, type Request, type Response } from "express";
import multer from "multer";
import {
  answerQuestionWithRag,
  answerQuestionStreaming,
  transcribeAndAnswer,
  synthesizeSpeech,
} from "../services/rag";
import {
  logChatTurn,
  consumeSessionQuery,
  peekSessionUsage,
  getChatLimits,
  purgeOldSessions,
  purgeOldChatQueries,
} from "../services/db";
import { resolveSessionToken, sessionTokenFromRequest } from "../services/session";

export const router: Router = Router();

// ---------------------------------------------------------------------------
// Rate limiting — per IP+siteId, 30 requests/minute
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count++;
  return bucket.count > RATE_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now >= bucket.resetAt) rateBuckets.delete(key);
  }
}, RATE_WINDOW_MS);

// Yesterday's usage rows are never read again. Swept daily rather than per request.
const SESSION_SWEEP_MS = 24 * 60 * 60 * 1000;
/** Days a raw visitor question + answer preview stays in chat_query before being purged. */
const CHAT_QUERY_RETENTION_DAYS = 90;
setInterval(() => {
  purgeOldSessions().catch((err) => console.error("[chat] session sweep failed:", err.message));
  purgeOldChatQueries(CHAT_QUERY_RETENTION_DAYS).catch((err) =>
    console.error("[chat] chat_query retention sweep failed:", err.message)
  );
}, SESSION_SWEEP_MS).unref?.();

// ---------------------------------------------------------------------------
// Per-visitor daily cap
//
// Separate from the IP rate limit above, which exists to stop abuse. This one is a
// product rule the site owner sets, and running out is a normal thing that should read
// like a helpful message rather than an error.
// ---------------------------------------------------------------------------
interface CapResult {
  token: string;
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  message?: string;
}

async function applyDailyCap(req: Request, siteId: string): Promise<CapResult> {
  const { token } = resolveSessionToken(
    sessionTokenFromRequest(req.headers as Record<string, unknown>, req.body)
  );

  const usage = await consumeSessionQuery(siteId, token).catch((err) => {
    // A counter outage must not take chat down with it — fail open and log.
    console.error("[chat] daily cap check failed, allowing request:", err.message);
    return null;
  });

  if (!usage) {
    return { token, allowed: true, used: 0, limit: 0, remaining: Number.MAX_SAFE_INTEGER };
  }

  if (usage.allowed) return { token, ...usage };

  const { limitMessage } = await getChatLimits(siteId).catch(() => ({ limitMessage: "" }));
  return { token, ...usage, message: limitMessage };
}

/** Body sent when a visitor is out of questions. 200-with-a-message, not an error. */
function limitPayload(cap: CapResult) {
  return {
    limitReached: true,
    answer: cap.message,
    sources: [],
    pageLinks: [],
    socialLinks: [],
    followUps: [],
    usage: { used: cap.used, limit: cap.limit, remaining: 0 },
  };
}

// ---------------------------------------------------------------------------
// Session handshake — the widget calls this on open
// ---------------------------------------------------------------------------
router.post("/session", async (req: Request, res: Response) => {
  try {
    const { siteId } = req.body as { siteId?: string };
    if (!siteId) return res.status(400).json({ error: "siteId is required" });

    const { token } = resolveSessionToken(
      sessionTokenFromRequest(req.headers as Record<string, unknown>, req.body)
    );
    const [usage, limits] = await Promise.all([
      peekSessionUsage(siteId, token),
      getChatLimits(siteId),
    ]);

    res.json({
      token,
      used: usage.used,
      limit: limits.dailyLimit,
      remaining: limits.dailyLimit > 0 ? usage.remaining : null,
      limitReached: !usage.allowed,
      limitMessage: limits.limitMessage,
    });
  } catch (err) {
    console.error("[chat/session]", err);
    res.status(500).json({ error: "session_failed" });
  }
});

// ---------------------------------------------------------------------------
// Text chat
// ---------------------------------------------------------------------------
router.post("/", async (req: Request, res: Response) => {
  try {
    const { siteId, message, history, features } = req.body as {
      siteId?: string;
      message?: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      features?: string[];
    };

    if (!siteId || !message) {
      return res.status(400).json({ error: "siteId and message are required" });
    }

    const rateKey = `${req.ip || "unknown"}:${siteId}`;
    if (checkRateLimit(rateKey)) {
      return res.status(429).json({ error: "Too many requests. Please try again shortly." });
    }

    const cap = await applyDailyCap(req, siteId);
    res.setHeader("X-Navbot-Session", cap.token);
    if (!cap.allowed) return res.json(limitPayload(cap));

    const t0 = Date.now();
    const result = await answerQuestionWithRag({
      siteId,
      message,
      history: history || [],
      features,
    });

    res.json({ ...result, usage: { used: cap.used, limit: cap.limit, remaining: cap.remaining } });

    logChatTurn({
      siteId,
      query: message,
      channel: "text",
      answerPreview: result.answer,
      latencyMs: Date.now() - t0,
      sourceCount: result.sources?.length ?? 0,
    }).catch((err) => console.error("[chat] logChatTurn failed:", err.message));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "chat_failed" });
  }
});

// ---------------------------------------------------------------------------
// Streaming text chat (Server-Sent Events)
//
// Same pipeline as POST /, but text is delivered as it is generated so the widget
// shows words in about a second instead of a spinner for the whole answer.
// ---------------------------------------------------------------------------
router.post("/stream", async (req: Request, res: Response) => {
  const { siteId, message, history, features } = req.body as {
    siteId?: string;
    message?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    features?: string[];
  };

  if (!siteId || !message) {
    return res.status(400).json({ error: "siteId and message are required" });
  }

  const rateKey = `${req.ip || "unknown"}:${siteId}`;
  if (checkRateLimit(rateKey)) {
    return res.status(429).json({ error: "Too many requests. Please try again shortly." });
  }

  // Checked before the SSE headers are flushed, so an exhausted visitor gets an ordinary
  // JSON body the client can read — once the stream is open, it cannot.
  const cap = await applyDailyCap(req, siteId);
  res.setHeader("X-Navbot-Session", cap.token);
  if (!cap.allowed) return res.json(limitPayload(cap));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Defeat proxy buffering, which would otherwise hold the stream until it completes.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const t0 = Date.now();
  let finalAnswer: string | null = null;
  let sourceCount = 0;
  let aborted = false;
  req.on("close", () => { aborted = true; });

  try {
    for await (const ev of answerQuestionStreaming({
      siteId,
      message,
      history: history || [],
      features,
    })) {
      if (aborted) break;
      if (ev.type === "status") send("status", { stage: ev.stage, detail: ev.detail });
      else if (ev.type === "delta") send("delta", { text: ev.text });
      else {
        finalAnswer = ev.answer.answer;
        sourceCount = ev.answer.sources.length;
        send("done", {
          answer: ev.answer.answer,
          pageLinks: ev.answer.pageLinks,
          socialLinks: ev.answer.socialLinks,
          followUps: ev.answer.followUps,
          usage: { used: cap.used, limit: cap.limit, remaining: cap.remaining },
        });
      }
    }
  } catch (err) {
    console.error("[chat/stream]", err);
    // The client may already have partial text, so send a usable close-out
    // rather than an HTTP error it can no longer receive.
    send("error", {
      message: "I had trouble completing that answer. Please try asking again.",
    });
  } finally {
    res.end();
    if (!aborted && finalAnswer) {
      logChatTurn({
        siteId,
        query: message,
        channel: "text",
        answerPreview: finalAnswer,
        latencyMs: Date.now() - t0,
        sourceCount,
      }).catch((e) => console.error("[chat/stream] logChatTurn failed:", e.message));
    }
  }
});

// ---------------------------------------------------------------------------
// Voice chat — accepts multipart/form-data with `audio` file + `siteId`
// Also accepts optional `history` as a JSON string field
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

// ---------------------------------------------------------------------------
// Text-to-Speech — converts answer text to audio (base64 WAV)
// ---------------------------------------------------------------------------
router.post("/tts", async (req: Request, res: Response) => {
  try {
    const { text } = req.body as { text?: string };
    if (!text) {
      return res.status(400).json({ error: "text is required" });
    }
    const audioBase64 = await synthesizeSpeech(text);
    res.json({ audio: audioBase64 });
  } catch (err) {
    console.error("[TTS] Error:", err);
    res.status(500).json({ error: "tts_failed" });
  }
});

// ---------------------------------------------------------------------------
// Voice chat — accepts multipart/form-data with `audio` file + `siteId`
// Also accepts optional `history` as a JSON string field
// ---------------------------------------------------------------------------
router.post(
  "/voice",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    try {
      const { siteId, history: historyJson } = req.body as {
        siteId?: string;
        history?: string; // JSON-encoded array from the client
      };
      const audio = req.file;

      if (!siteId || !audio) {
        return res
          .status(400)
          .json({ error: "siteId and audio file are required" });
      }

      const rateKey = `${req.ip || "unknown"}:${siteId}`;
      if (checkRateLimit(rateKey)) {
        return res.status(429).json({ error: "Too many requests. Please try again shortly." });
      }

      const cap = await applyDailyCap(req, siteId);
      res.setHeader("X-Navbot-Session", cap.token);
      if (!cap.allowed) return res.json({ ...limitPayload(cap), transcript: null });

      const t0 = Date.now();

      // Parse history if the client sent it
      let history: Array<{ role: "user" | "assistant"; content: string }> = [];
      if (historyJson) {
        try {
          history = JSON.parse(historyJson);
        } catch {
          // ignore malformed history — treat as empty
        }
      }

      const result = await transcribeAndAnswer({
        siteId,
        audioBuffer: audio.buffer,
        mimeType: audio.mimetype,
        history,
      });

      res.json(result);

      if (result.transcript && result.transcript.trim()) {
        logChatTurn({
          siteId,
          query: result.transcript.trim(),
          channel: "voice",
          answerPreview: result.answer,
          latencyMs: Date.now() - t0,
          sourceCount: result.sources?.length ?? 0,
        }).catch((err) => console.error("[voice] logChatTurn failed:", err.message));
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "voice_chat_failed" });
    }
  }
);