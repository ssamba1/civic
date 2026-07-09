// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CONTRACTOR_STATUSES,
  CONTRACTOR_STATUS_LABEL,
  canTransition,
  validateProgressUpdate,
  type ContractorStatus,
} from "./status";

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

// ---------------------------------------------------------------------------
// CONTRACTOR_STATUSES
// ---------------------------------------------------------------------------
describe("CONTRACTOR_STATUSES", () => {
  it("is a non-empty tuple of unique strings", () => {
    expect(CONTRACTOR_STATUSES.length).toBeGreaterThan(0);
    expect(new Set(CONTRACTOR_STATUSES).size).toBe(CONTRACTOR_STATUSES.length);
  });

  it("contains the expected values", () => {
    const set = new Set<string>(CONTRACTOR_STATUSES);
    expect(set.has("assigned")).toBe(true);
    expect(set.has("accepted")).toBe(true);
    expect(set.has("declined")).toBe(true);
    expect(set.has("in_progress")).toBe(true);
    expect(set.has("complete")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CONTRACTOR_STATUS_LABEL
// ---------------------------------------------------------------------------
describe("CONTRACTOR_STATUS_LABEL", () => {
  it("has a label for every status", () => {
    for (const s of CONTRACTOR_STATUSES) {
      expect(CONTRACTOR_STATUS_LABEL[s]).toBeTruthy();
      expect(typeof CONTRACTOR_STATUS_LABEL[s]).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// canTransition
// ---------------------------------------------------------------------------
describe("canTransition", () => {
  it("allows assigned → accepted", () => {
    expect(canTransition("assigned", "accepted")).toBe(true);
  });

  it("allows assigned → declined", () => {
    expect(canTransition("assigned", "declined")).toBe(true);
  });

  it("allows accepted → in_progress", () => {
    expect(canTransition("accepted", "in_progress")).toBe(true);
  });

  it("allows accepted → declined", () => {
    expect(canTransition("accepted", "declined")).toBe(true);
  });

  it("allows in_progress → complete", () => {
    expect(canTransition("in_progress", "complete")).toBe(true);
  });

  it("blocks declined → anything (terminal)", () => {
    for (const s of CONTRACTOR_STATUSES) {
      expect(canTransition("declined", s)).toBe(false);
    }
  });

  it("blocks complete → anything (terminal)", () => {
    for (const s of CONTRACTOR_STATUSES) {
      expect(canTransition("complete", s)).toBe(false);
    }
  });

  it("blocks self-transitions", () => {
    for (const s of CONTRACTOR_STATUSES) {
      expect(canTransition(s, s)).toBe(false);
    }
  });

  it("blocks backwards jumps", () => {
    expect(canTransition("in_progress", "assigned")).toBe(false);
    expect(canTransition("complete", "in_progress")).toBe(false);
    expect(canTransition("accepted", "assigned")).toBe(false);
  });

  it("blocks skipping steps", () => {
    // Cannot jump from assigned directly to in_progress (must accept first)
    expect(canTransition("assigned", "in_progress")).toBe(false);
    // Cannot jump from assigned directly to complete
    expect(canTransition("assigned", "complete")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateProgressUpdate
// ---------------------------------------------------------------------------
describe("validateProgressUpdate", () => {
  it("accepts a minimal valid input (no note, no photo)", () => {
    const result = validateProgressUpdate({
      workOrderId: VALID_UUID,
      status: "accepted",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a full valid input with note and photoUrl", () => {
    const result = validateProgressUpdate({
      workOrderId: VALID_UUID,
      status: "in_progress",
      note: "Started excavation.",
      photoUrl: "https://cdn.example.com/photo.jpg",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a non-UUID workOrderId", () => {
    const result = validateProgressUpdate({
      workOrderId: "not-a-uuid",
      status: "accepted",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_work_order_id");
  });

  it("rejects an empty workOrderId", () => {
    const result = validateProgressUpdate({
      workOrderId: "",
      status: "accepted",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_work_order_id");
  });

  it("rejects an invalid status", () => {
    const result = validateProgressUpdate({
      workOrderId: VALID_UUID,
      // @ts-expect-error intentional invalid value
      status: "hacked",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_status");
  });

  it("rejects a note exceeding 2000 chars", () => {
    const result = validateProgressUpdate({
      workOrderId: VALID_UUID,
      status: "in_progress",
      note: "x".repeat(2001),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("note_too_long");
  });

  it("accepts a note of exactly 2000 chars", () => {
    const result = validateProgressUpdate({
      workOrderId: VALID_UUID,
      status: "in_progress",
      note: "x".repeat(2000),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a photoUrl that is not HTTPS", () => {
    const result = validateProgressUpdate({
      workOrderId: VALID_UUID,
      status: "in_progress",
      photoUrl: "http://insecure.example.com/photo.jpg",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("photo_url_not_https");
  });

  it("rejects a photoUrl exceeding 2048 chars", () => {
    const result = validateProgressUpdate({
      workOrderId: VALID_UUID,
      status: "in_progress",
      photoUrl: `https://example.com/${"a".repeat(2040)}`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("photo_url_too_long");
  });

  it("accepts an empty string photoUrl (means no photo)", () => {
    const result = validateProgressUpdate({
      workOrderId: VALID_UUID,
      status: "complete",
      photoUrl: "",
    });
    expect(result.ok).toBe(true);
  });
});
