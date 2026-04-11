import { Router, type Request, type Response } from "express";
import multer from "multer";
import { answerQuestionWithRag, transcribeAndAnswer, synthesizeSpeech } from "../services/rag";
import { logChatTurn } from "../services/db";

export const router: Router = Router();

// ---------------------------------------------------------------------------
// Text chat
// ---------------------------------------------------------------------------
router.post("/", async (req: Request, res: Response) => {
  try {
    const { siteId, message, history } = req.body as {
      siteId?: string;
      message?: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    };

    if (!siteId || !message) {
      return res.status(400).json({ error: "siteId and message are required" });
    }

    const t0 = Date.now();
    const result = await answerQuestionWithRag({
      siteId,
      message,
      history: history || [],
    });

    await logChatTurn({
      siteId,
      query: message,
      channel: "text",
      answerPreview: result.answer,
      latencyMs: Date.now() - t0,
      sourceCount: result.sources?.length ?? 0,
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "chat_failed" });
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

      if (result.transcript && result.transcript.trim()) {
        await logChatTurn({
          siteId,
          query: result.transcript.trim(),
          channel: "voice",
          answerPreview: result.answer,
          latencyMs: Date.now() - t0,
          sourceCount: result.sources?.length ?? 0,
        });
      }

      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "voice_chat_failed" });
    }
  }
);