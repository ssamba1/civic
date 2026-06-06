import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Classification, Result } from "@/lib/types";
import { classificationSchema } from "./classification-schema";
import { CLASSIFICATION_SYSTEM_PROMPT, CLASSIFICATION_PROMPT } from "./prompt";
import { checkAndRecordGeminiCall } from "./rate-limiter";
import { serverEnv } from "@/lib/env";

const MODEL = "gemini-2.5-flash";

function getClient() {
  return new GoogleGenerativeAI(serverEnv.GEMINI_API_KEY);
}

/**
 * Strip markdown code fences as a safety fallback.
 * Should rarely trigger now that responseMimeType forces raw JSON output.
 */
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = trimmed.match(fencePattern);
  return match ? match[1].trim() : trimmed;
}

/**
 * Send a photo to Gemini 2.5 Flash and return a validated Classification.
 *
 * Rate-limited: checks global sliding-window buckets before dispatching.
 * If the limit is exceeded the call is rejected with ok:false so the
 * classify pipeline can fall back gracefully without crashing.
 */
export async function classifyPhoto(
  imageBase64: string,
  mimeType: string
): Promise<Result<Classification>> {
  const rateCheck = checkAndRecordGeminiCall();
  if (!rateCheck.allowed) {
    return {
      ok: false,
      error: `Gemini rate limit: ${rateCheck.reason}. Retry in ${Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000)}s.`,
    };
  }

  try {
    const genAI = getClient();
    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: CLASSIFICATION_SYSTEM_PROMPT,
      generationConfig: {
        // Forces the model to return raw JSON without any markdown wrapping.
        responseMimeType: "application/json",
      },
    });

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
        error: `Gemini returned invalid JSON: ${cleaned.slice(0, 300)}`,
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
