/**
 * POST /api/ai/intake
 *
 * Conversational report intake endpoint. Receives a chat history and returns
 * the model's next reply (or a final structured draft when the model has
 * gathered enough info).
 *
 * Rate-limited: per-IP (reuses rate-limit.ts) + global Gemini budget.
 * Graceful fallback: if the API key is absent or the model errors, returns a
 * scripted fallback question so the UI never shows a blank error to residents.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { AI_TIMEOUT_MS, GEMINI_MODEL } from "@/lib/ai/config";
import {
  buildIntakePrompt,
  type ChatMessage,
  parseIntakeResponse,
} from "@/lib/ai/intake-chat";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { checkAndRecordGeminiCall } from "@/lib/ai/rate-limiter";
import { serverEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

const logger = createLogger("[intake-api]");

// ── scripted fallback ─────────────────────────────────────────────────────────

/**
 * Safe scripted fallback used when the model is unavailable.
 * Prompts the resident to provide category + description manually.
 */
function scriptedFallback(history: ChatMessage[]): {
  reply: string;
  draft?: undefined;
  done: false;
} {
  const userTurns = history.filter((m) => m.role === "user").length;

  if (userTurns === 0) {
    return {
      reply:
        "Hi! What kind of issue are you reporting? For example: pothole, streetlight outage, graffiti, illegal dumping, water leak, damaged sidewalk, fallen tree, debris, drainage issue, faded sign, or other.",
      done: false,
    };
  }
  if (userTurns === 1) {
    return {
      reply:
        "Thanks! Could you briefly describe the problem and where it is? (Street name, intersection, or nearby landmark is helpful.)",
      done: false,
    };
  }
  return {
    reply:
      "Got it. Once you confirm the details below, you can add a photo and submit your report.",
    done: false,
  };
}

// ── route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ── per-IP rate limit ──────────────────────────────────────────────────────
  const rl = checkRateLimit(`intake:${clientIp(request)}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests, please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  // ── parse body ─────────────────────────────────────────────────────────────
  let messages: ChatMessage[] = [];
  try {
    const body = await request.json();
    if (!Array.isArray(body?.messages)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const raw: unknown[] = body.messages;

    // Validate length bounds
    if (raw.length === 0 || raw.length > 20) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    // PROMPT-INJECTION FIX: only accept user-role messages from the client.
    // Server-side assistant turns are injected by buildIntakePrompt; we never
    // trust assistant/model turns supplied by the caller.
    for (const msg of raw) {
      if (
        typeof msg !== "object" ||
        msg === null ||
        (msg as Record<string, unknown>).role !== "user" ||
        typeof (msg as Record<string, unknown>).content !== "string"
      ) {
        return NextResponse.json({ error: "invalid_request" }, { status: 400 });
      }
      if (((msg as Record<string, unknown>).content as string).length > 2000) {
        return NextResponse.json({ error: "invalid_request" }, { status: 400 });
      }
    }

    messages = raw as ChatMessage[];
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // ── global Gemini budget ───────────────────────────────────────────────────
  const budget = checkAndRecordGeminiCall();
  if (!budget.allowed) {
    logger.warn("Gemini rate limit hit on intake route", {
      reason: budget.reason,
    });
    // Fall back gracefully. Don't surface "rate limited" to the resident.
    return NextResponse.json(scriptedFallback(messages));
  }

  // ── API key check ──────────────────────────────────────────────────────────
  const apiKey = serverEnv.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn("GEMINI_API_KEY not set, using scripted fallback");
    return NextResponse.json(scriptedFallback(messages));
  }

  // ── call the model ─────────────────────────────────────────────────────────
  try {
    const { systemInstruction, turns } = buildIntakePrompt(messages);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction,
    });

    // Convert turns to Gemini Content format
    const contents = turns.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);

    let rawText: string;
    try {
      const result = await model.generateContent(
        { contents },
        { signal: abortController.signal, timeout: AI_TIMEOUT_MS },
      );
      rawText = result.response?.text?.() ?? "";
    } finally {
      clearTimeout(timeoutId);
    }

    if (!rawText.trim()) {
      logger.warn("Gemini returned empty response on intake");
      return NextResponse.json(scriptedFallback(messages));
    }

    const parsed = parseIntakeResponse(rawText);
    if (!parsed.ok) {
      logger.warn("parseIntakeResponse failed", { error: parsed.error });
      // If parse failed on a final draft, fall back to asking for more info.
      return NextResponse.json(scriptedFallback(messages));
    }

    return NextResponse.json(parsed.data);
  } catch (err) {
    // Never leak raw model errors, log server-side, respond with fallback.
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Intake model error", new Error(msg));
    return NextResponse.json(scriptedFallback(messages));
  }
}
