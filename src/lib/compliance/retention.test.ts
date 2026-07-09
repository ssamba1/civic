// @vitest-environment node
/**
 * Tests for validateRetention — imported directly since it's a pure function
 * that requires no DB or auth context.  The "use server" directive is stripped
 * by the vitest module resolver (same pattern used in other admin action tests).
 */
import { describe, expect, it } from "vitest";
import { validateRetention } from "@/app/admin/retention/validate";

describe("validateRetention", () => {
  it("accepts valid input", () => {
    const result = validateRetention({ raw_photo_ttl_days: 30, freetext_ttl_days: 365 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.raw_photo_ttl_days).toBe(30);
      expect(result.data.freetext_ttl_days).toBe(365);
    }
  });

  it("rejects raw_photo_ttl_days < 1", () => {
    const result = validateRetention({ raw_photo_ttl_days: 0, freetext_ttl_days: 365 });
    expect(result.ok).toBe(false);
  });

  it("rejects freetext_ttl_days < 1", () => {
    const result = validateRetention({ raw_photo_ttl_days: 30, freetext_ttl_days: 0 });
    expect(result.ok).toBe(false);
  });

  it("rejects TTL exceeding 3650 days", () => {
    const result = validateRetention({ raw_photo_ttl_days: 9999, freetext_ttl_days: 365 });
    expect(result.ok).toBe(false);
  });

  it("rejects non-integer TTL", () => {
    const result = validateRetention({ raw_photo_ttl_days: 30.5, freetext_ttl_days: 365 });
    expect(result.ok).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = validateRetention({ raw_photo_ttl_days: 30 });
    expect(result.ok).toBe(false);
  });

  it("rejects non-object input", () => {
    const result = validateRetention("bad");
    expect(result.ok).toBe(false);
  });

  it("accepts boundary values 1 and 3650", () => {
    const result = validateRetention({ raw_photo_ttl_days: 1, freetext_ttl_days: 3650 });
    expect(result.ok).toBe(true);
  });
});
