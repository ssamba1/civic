/**
 * Pure comment moderation helpers, no I/O, no side effects.
 *
 * Used by the server action (comment-actions.ts) before persisting a comment.
 * All functions are safe to import from tests without a DB connection.
 */

import type { Result } from "@/lib/types";

/** Maximum allowed comment length after trimming. */
export const MAX_COMMENT_LENGTH = 2000;

/**
 * Validate a comment body.
 *
 * Returns ok:true with the trimmed body, or ok:false with a human-readable
 * error string.  The caller is responsible for PII-redacting the body
 * separately, this function only enforces shape constraints.
 */
export function validateComment(body: unknown): Result<string> {
  if (typeof body !== "string") {
    return { ok: false, error: "Comment body must be a string." };
  }

  const trimmed = body.trim();

  if (trimmed.length === 0) {
    return { ok: false, error: "Comment cannot be empty." };
  }

  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      error: `Comment is too long (${trimmed.length} characters). Maximum is ${MAX_COMMENT_LENGTH}.`,
    };
  }

  return { ok: true, data: trimmed };
}

/**
 * Sanitize a comment body for storage.
 *
 * - Strips C0 control characters (except newline \n and tab \t which
 *   are intentional formatting characters).
 * - Strips C1 control characters (U+0080 through U+009F).
 * - Collapses runs of more than 2 consecutive newlines to 2 (paragraph breaks).
 * - Collapses horizontal whitespace runs within a line to a single space.
 * - Does NOT strip HTML. Comments are stored as plain text and must be
 *   rendered with React's textContent (not dangerouslySetInnerHTML).
 *
 * @param body - Already-trimmed comment text (run validateComment first).
 */
export function sanitizeCommentBody(body: string): string {
  return (
    body
      // Remove C0 control chars except \t (0x09) and \n (0x0A)
      // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control chars is the point; this strips them from user input
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
      // Remove C1 control chars U+0080 through U+009F. (No biome-ignore here:
      // noControlCharactersInRegex only flags C0/\x00-\x1F ranges, so the U+0080+
      // range does not trip it, so an ignore would be flagged as unused.)
      .replace(/[\u0080-\u009F]/g, "")
      // Collapse runs of 3+ newlines to 2 paragraph breaks
      .replace(/\n{3,}/g, "\n\n")
      // Collapse horizontal whitespace (spaces/tabs) within a line to single space,
      // but preserve newline structure (don't collapse across lines).
      .replace(/[^\S\n]+/g, " ")
      .trim()
  );
}
