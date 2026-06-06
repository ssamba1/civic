import { GoogleGenerativeAI } from "@google/generative-ai";
import { AI_TIMEOUT_MS, GEMINI_MODEL } from "@/lib/ai/config";
import { withRetry } from "@/lib/ai/retry";
import { serverEnv } from "@/lib/env";
import type { Classification, Result } from "@/lib/types";
import {
  classificationSchema,
  GEMINI_CLASSIFICATION_SCHEMA,
} from "./classification-schema";
import { CLASSIFICATION_PROMPT } from "./prompt";

function getClient() {
  return new GoogleGenerativeAI(serverEnv.GEMINI_API_KEY);
}

/**
 * Strip markdown code fences Gemini sometimes wraps around JSON.
 * Handles ```json ... ```, ``` ... ```, and bare JSON.
 *
 * SECONDARY fallback only: with structured output (responseMimeType +
 * responseSchema) the model already returns clean JSON, but we keep this as a
 * belt-and-suspenders parse in case a response slips through fenced.
 */
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = trimmed.match(fencePattern);
  return match ? match[1].trim() : trimmed;
}

/**
 * Send a photo to Gemini and get a validated Classification back, along with
 * the raw model text so the caller can persist what the model actually said.
 *
 * Uses structured output (JSON schema) + per-attempt timeout and retry with
 * exponential backoff on transient failures.
 */
export async function classifyPhoto(
  imageBase64: string,
  mimeType: string,
): Promise<Result<{ classification: Classification; rawText: string }>> {
  try {
    const genAI = getClient();
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: GEMINI_CLASSIFICATION_SCHEMA,
      },
    });

    const request = [
      CLASSIFICATION_PROMPT,
      {
        inlineData: {
          data: imageBase64,
          mimeType,
        },
      },
    ];

    const result = await withRetry(
      (signal) =>
        model.generateContent(request, {
          signal,
          timeout: AI_TIMEOUT_MS,
        }),
      { timeoutMs: AI_TIMEOUT_MS },
    );

    // Preserve the raw model text exactly; parse a cleaned copy.
    const rawText = result.response.text();
    const cleaned = stripCodeFences(rawText);

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

    return {
      ok: true,
      data: { classification: validation.data as Classification, rawText },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Gemini API error: ${message}` };
  }
}
