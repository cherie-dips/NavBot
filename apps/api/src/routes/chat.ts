import { Router, type Request, type Response } from "express";
import multer from "multer";
import { answerQuestionWithRag, transcribeAndAnswer } from "../services/rag";

export const router: Router = Router();

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

const upload = multer({ storage: multer.memoryStorage() });

router.post("/voice", upload.single("audio"), async (req: Request, res: Response) => {
  try {
    const { siteId } = req.body as { siteId?: string };
    const audio = req.file;

    if (!siteId || !audio) {
      return res.status(400).json({ error: "siteId and audio are required" });
    }

    const result = await transcribeAndAnswer({
      siteId,
      audioBuffer: audio.buffer,
      mimeType: audio.mimetype,
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "voice_chat_failed" });
  }
});

