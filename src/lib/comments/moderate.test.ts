import { describe, expect, it } from "vitest";
import {
  MAX_COMMENT_LENGTH,
  sanitizeCommentBody,
  validateComment,
} from "./moderate";

// ─── validateComment ────────────────────────────────────────────────────────

describe("validateComment", () => {
  it("accepts a normal string and trims it", () => {
    const result = validateComment("  Hello world  ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe("Hello world");
  });

  it("rejects non-string input", () => {
    const result = validateComment(42);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/string/i);
  });

  it("rejects empty string", () => {
    const result = validateComment("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/empty/i);
  });

  it("rejects whitespace-only string", () => {
    const result = validateComment("   \t\n  ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/empty/i);
  });

  it("accepts a string exactly at the max length", () => {
    const body = "a".repeat(MAX_COMMENT_LENGTH);
    const result = validateComment(body);
    expect(result.ok).toBe(true);
  });

  it("rejects a string one char over the max length", () => {
    const body = "a".repeat(MAX_COMMENT_LENGTH + 1);
    const result = validateComment(body);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too long/i);
  });

  it("rejects null", () => {
    const result = validateComment(null);
    expect(result.ok).toBe(false);
  });

  it("accepts multi-line content", () => {
    const body = "Line one\nLine two";
    const result = validateComment(body);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe(body);
  });
});

// ─── sanitizeCommentBody ─────────────────────────────────────────────────────

describe("sanitizeCommentBody", () => {
  it("strips C0 control chars except tab and newline", () => {
    const body = "hello\x01\x02world\x0Bend";
    const result = sanitizeCommentBody(body);
    expect(result).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F]/);
    expect(result).toContain("helloworld");
  });

  it("preserves intentional newlines", () => {
    const body = "paragraph one\n\nparagraph two";
    const result = sanitizeCommentBody(body);
    expect(result).toContain("paragraph one\n\nparagraph two");
  });

  it("collapses 3+ consecutive newlines to 2", () => {
    const body = "a\n\n\n\nb";
    const result = sanitizeCommentBody(body);
    expect(result).toBe("a\n\nb");
  });

  it("collapses horizontal whitespace runs within a line", () => {
    const body = "word1   word2\t\tword3";
    const result = sanitizeCommentBody(body);
    expect(result).toBe("word1 word2 word3");
  });

  it("does not strip angle brackets or HTML-like characters", () => {
    const body = "<b>not bold</b> & 'quotes'";
    const result = sanitizeCommentBody(body);
    expect(result).toContain("<b>not bold</b>");
  });

  it("trims leading and trailing whitespace", () => {
    const body = "  hello  ";
    expect(sanitizeCommentBody(body)).toBe("hello");
  });

  it("handles empty string gracefully", () => {
    expect(sanitizeCommentBody("")).toBe("");
  });
});
