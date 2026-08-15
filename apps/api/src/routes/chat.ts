import { Router, type Request, type Response } from "express";
import multer from "multer";
import {
  answerQuestionWithRag,
  answerQuestionStreaming,
  transcribeAndAnswer,
  synthesizeSpeech,
} from "../services/rag";
import { logChatTurn } from "../services/db";

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

    const t0 = Date.now();
    const result = await answerQuestionWithRag({
      siteId,
      message,
      history: history || [],
      features,
    });

    res.json(result);

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