/**
 * Conversational report intake helpers.
 *
 * Pure functions — no side effects, no env reads, safe to unit-test.
 * All AI calls live in /api/ai/intake/route.ts; this file only builds
 * prompts and parses responses.
 */

import type { ReportCategory } from "@/lib/types";
import type { Result } from "@/lib/types";

// ── types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Structured draft produced by the intake conversation.
 * This pre-fills the normal report submit form — it does NOT bypass
 * photo/blur/privacy checks.
 */
export interface IntakeDraft {
  category: ReportCategory;
  description: string;
  location_hint: string | null;
  severity_hint: 1 | 2 | 3 | 4 | 5;
  needs_photo: boolean;
}

/**
 * Parsed output from a single model turn.
 *  - reply   : text to display to the user
 *  - draft   : present only when the model emits a final JSON draft
 *  - done    : true when the conversation should end and pass the draft on
 */
export interface IntakeResponse {
  reply: string;
  draft?: IntakeDraft;
  done: boolean;
}

// ── constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: ReportCategory[] = [
  "pothole",
  "streetlight",
  "downed_sign",
  "graffiti",
  "illegal_dump",
  "water_leak",
  "sidewalk_damage",
  "tree_down",
  "debris",
  "drainage",
  "faded_signage",
  "other",
];

// Sentinel the model must emit once it has enough information.
const DRAFT_SENTINEL = "__INTAKE_DRAFT__";

// ── prompt builders ───────────────────────────────────────────────────────────

/**
 * System instruction for the intake assistant.
 * Instructs the model to gather the required fields and then emit a final
 * JSON draft preceded by the sentinel token.
 */
export function buildIntakeSystemPrompt(): string {
  return `You are a friendly civic assistant helping a resident report a local infrastructure problem to their city government.

Your job is to gather the following information through a SHORT, friendly conversation:
  1. What is the problem? (category + description)
  2. Where is it? (location_hint — street, intersection, landmark — optional)
  3. How urgent / dangerous is it? (severity_hint 1-5, where 5 = immediate hazard)
  4. Is a photo needed to document this issue? (needs_photo true/false)

Rules:
- Ask ONE question at a time. Keep messages short (1-3 sentences max).
- Be warm and helpful, not robotic.
- After you have enough information (no more than 4 turns), produce the final draft.
- To emit the final draft you MUST output EXACTLY this structure on its own line, with no extra text before or after the JSON block:
  ${DRAFT_SENTINEL}
  {"category":"<one of: ${CATEGORIES.join("|")}>","description":"<concise description, max 200 chars>","location_hint":"<street/landmark or null>","severity_hint":<1-5>,"needs_photo":<true|false>}

Valid categories: ${CATEGORIES.join(", ")}.
Severity guide: 1=minor cosmetic, 2=noticeable, 3=moderate, 4=serious safety risk, 5=immediate hazard.

Do NOT emit the draft until you have at least a category and a description. Ask follow-up questions if needed.
Do NOT ask for names, contact info, or any personal details.
Do NOT output the sentinel JSON until you are ready to finalize — only interim conversational text before that point.`;
}

/**
 * Builds the full messages array for the Gemini generateContent call.
 * The system prompt is returned separately; history is the user+assistant turns.
 */
export function buildIntakePrompt(history: ChatMessage[]): {
  systemInstruction: string;
  turns: ChatMessage[];
} {
  return {
    systemInstruction: buildIntakeSystemPrompt(),
    turns: history,
  };
}

// ── response parser ───────────────────────────────────────────────────────────

/**
 * Strip markdown code fences Gemini sometimes wraps around JSON.
 * Exported so it can be tested in isolation.
 */
export function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = trimmed.match(fencePattern);
  return match ? match[1].trim() : trimmed;
}

/**
 * Parse the raw model text into a structured IntakeResponse.
 *
 * Two cases:
 *  A) The text contains the sentinel → extract and parse the JSON draft.
 *  B) Otherwise → it's an interim conversational reply.
 *
 * Tolerant JSON parse: strips fences, catches parse errors, returns ok:false
 * so the caller can fall back gracefully.
 */
export function parseIntakeResponse(
  raw: string,
): Result<IntakeResponse> {
  if (!raw || !raw.trim()) {
    return { ok: false, error: "Empty response from model" };
  }

  const sentinelIdx = raw.indexOf(DRAFT_SENTINEL);

  if (sentinelIdx === -1) {
    // Interim conversational turn — no draft yet.
    return {
      ok: true,
      data: {
        reply: raw.trim(),
        done: false,
      },
    };
  }

  // Extract the text before the sentinel as a human-readable confirmation.
  const beforeSentinel = raw.slice(0, sentinelIdx).trim();

  // Everything after the sentinel token is the JSON (possibly fenced).
  const afterSentinel = raw.slice(sentinelIdx + DRAFT_SENTINEL.length).trim();
  const cleaned = stripCodeFences(afterSentinel);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      ok: false,
      error: `Intake draft JSON parse failed: ${cleaned.slice(0, 300)}`,
    };
  }

  const draft = validateDraft(parsed);
  if (!draft.ok) {
    return { ok: false, error: draft.error };
  }

  const replyText =
    beforeSentinel ||
    "I've gathered enough information. Here's the draft report — please review and confirm before submitting.";

  return {
    ok: true,
    data: {
      reply: replyText,
      draft: draft.data,
      done: true,
    },
  };
}

// ── draft validation ──────────────────────────────────────────────────────────

function validateDraft(raw: unknown): Result<IntakeDraft> {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Draft is not an object" };
  }

  const obj = raw as Record<string, unknown>;

  if (!obj.category || !CATEGORIES.includes(obj.category as ReportCategory)) {
    return {
      ok: false,
      error: `Invalid category: ${String(obj.category)}`,
    };
  }

  if (!obj.description || typeof obj.description !== "string" || !obj.description.trim()) {
    return { ok: false, error: "Draft missing description" };
  }

  const severityRaw = Number(obj.severity_hint);
  if (!Number.isInteger(severityRaw) || severityRaw < 1 || severityRaw > 5) {
    return {
      ok: false,
      error: `Invalid severity_hint: ${String(obj.severity_hint)}`,
    };
  }

  return {
    ok: true,
    data: {
      category: obj.category as ReportCategory,
      description: String(obj.description).trim().slice(0, 500),
      location_hint:
        obj.location_hint && typeof obj.location_hint === "string" && obj.location_hint.trim()
          ? obj.location_hint.trim()
          : null,
      severity_hint: severityRaw as 1 | 2 | 3 | 4 | 5,
      needs_photo: Boolean(obj.needs_photo),
    },
  };
}
