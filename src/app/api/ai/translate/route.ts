import { NextResponse } from "next/server";
import {
  isLangCode,
  translateText,
} from "@/lib/ai/translate";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";

/* ==================================================================
   POST /api/ai/translate (NEXT_100 #9 / #31)

   Translates free-text report content server-side. Used by client
   components that need to show a report description in the visitor's
   language without calling Gemini directly (hard rule: no AI from
   client). All AI calls stay server-side via this route.

   Body: { text: string; targetLang: string }
   Response: { translated: string }   (always populated; falls back
             to source text on error per translate.ts contract)
   ================================================================== */

export const runtime = "nodejs";

export async function POST(request: Request) {
  // ── per-IP rate limit ──────────────────────────────────────────────────────
  const ip = clientIp(request);
  const rl = checkRateLimit(`translate:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests — please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).text !== "string" ||
    typeof (body as Record<string, unknown>).targetLang !== "string"
  ) {
    return NextResponse.json(
      { error: "missing_fields", required: ["text", "targetLang"] },
      { status: 400 },
    );
  }

  const { text, targetLang } = body as { text: string; targetLang: string };

  if (!isLangCode(targetLang)) {
    return NextResponse.json(
      { error: "unsupported_lang", supported: ["en", "es", "fr", "vi", "zh", "ko"] },
      { status: 400 },
    );
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return NextResponse.json({ translated: "" });
  }

  // translateText is graceful: model error → returns source text unchanged
  const translated = await translateText(trimmed, targetLang);
  return NextResponse.json({ translated });
}
