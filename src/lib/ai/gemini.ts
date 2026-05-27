import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Classification, Result } from "@/lib/types";
import { classificationSchema } from "./classification-schema";
import { CLASSIFICATION_PROMPT } from "./prompt";

const MODEL = "gemini-2.5-flash";

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(key);
}

/**
 * Strip markdown code fences Gemini sometimes wraps around JSON.
 * Handles ```json ... ```, ``` ... ```, and bare JSON.
 */
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = trimmed.match(fencePattern);
  return match ? match[1].trim() : trimmed;
}

/**
 * Send a photo to Gemini 2.5 Flash and get a validated Classification back.
 */
export async function classifyPhoto(
  imageBase64: string,
  mimeType: string
): Promise<Result<Classification>> {
  try {
    const genAI = getClient();
    const model = genAI.getGenerativeModel({ model: MODEL });

    const result = await model.generateContent([
      CLASSIFICATION_PROMPT,
      {
        inlineData: {
          data: imageBase64,
          mimeType,
        },
      },
    ]);

    const responseText = result.response.text();
    const cleaned = stripCodeFences(responseText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        ok: false,
        error: `Gemini returned invalid JSON: ${cleaned.slice(0, 200)}`,
      };
    }

    const validation = classificationSchema.safeParse(parsed);
    if (!validation.success) {
      return {
        ok: false,
        error: `Classification validation failed: ${JSON.stringify(validation.error.issues)}`,
      };
    }

    return { ok: true, data: validation.data as Classification };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Gemini API error: ${message}` };
  }
}
