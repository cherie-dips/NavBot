import { getGeminiApiKey, getGoogleGenAI } from "./gemini-client";

const OCR_ENABLED = (process.env.NAVBOT_IMAGE_OCR ?? "true").toLowerCase() !== "false";
const OCR_MODEL = process.env.GEMINI_OCR_MODEL?.trim() || "gemini-2.5-flash";

export async function ocrImageUrl(imageUrl: string): Promise<string | null> {
  if (!OCR_ENABLED || !getGeminiApiKey()) return null;

  try {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": "NavBot/1.0" },
      redirect: "follow",
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    // Skip tiny images (likely icons/spacers)
    if (buf.length < 5_000) return null;

    const ai = getGoogleGenAI();
    const b64 = buf.toString("base64");

    const response = await ai.models.generateContent({
      model: OCR_MODEL,
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: contentType, data: b64 } },
          { text: "Extract ALL text visible in this image. If there is no readable text, respond with exactly 'NO_TEXT'. Return only the extracted text, no commentary." },
        ],
      }],
      config: { temperature: 0, maxOutputTokens: 500 },
    });

    const text = response.text?.trim();
    if (!text || text === "NO_TEXT" || text.length < 5) return null;
    return text;
  } catch (err) {
    console.warn(`[image-ocr] Failed for ${imageUrl}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
