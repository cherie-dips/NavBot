import { Router, type Request, type Response } from "express";
import multer from "multer";
import { answerQuestionWithRag, transcribeAndAnswer } from "../services/rag";

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

    const result = await answerQuestionWithRag({
      siteId,
      message,
      history: history || [],
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
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "voice_chat_failed" });
    }
  }
);