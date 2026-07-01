import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";
import { resolveChatContext } from "@/lib/ai/chat/context";
import { buildSystemPrompt } from "@/lib/ai/chat/system-prompt";
import { buildChatTools } from "@/lib/ai/chat/tools";
import {
  CHAT_HISTORY_LIMIT,
  CHAT_MAX_STEPS,
  CHAT_MODEL,
  HELP_ASSISTANT,
} from "@/lib/ai/config";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { serverEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

const logger = createLogger("[chat-api]");

export async function POST(request: Request) {
  if (!HELP_ASSISTANT) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const rl = checkRateLimit(`chat:${clientIp(request)}`);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limited" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
        },
      );
    }

    const body = (await request.json()) as { messages?: UIMessage[] };
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const recent = messages.slice(-CHAT_HISTORY_LIMIT);

    const ctx = await resolveChatContext();
    const google = createGoogleGenerativeAI({ apiKey: serverEnv.GEMINI_API_KEY });
    const modelMessages = await convertToModelMessages(recent);

    const result = streamText({
      model: google(CHAT_MODEL),
      system: buildSystemPrompt(ctx),
      messages: modelMessages,
      tools: buildChatTools(ctx),
      stopWhen: stepCountIs(CHAT_MAX_STEPS),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    logger.error("Unhandled error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
