import { describe, expect, it } from "vitest";
import {
  BULK_ACTIONS,
  BULK_MAX,
  isUuid,
  validateBulkAction,
  validateBulkSelection,
} from "./bulk";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const uuid = (n = 0) =>
  `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;

const manyUuids = (n: number) => Array.from({ length: n }, (_, i) => uuid(i));

// ---------------------------------------------------------------------------
// isUuid
// ---------------------------------------------------------------------------
describe("isUuid", () => {
  it("accepts standard v4 uuid", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });
  it("rejects short string", () => {
    expect(isUuid("abc")).toBe(false);
  });
  it("rejects uuid without hyphens", () => {
    expect(isUuid("550e8400e29b41d4a716446655440000")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(isUuid("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateBulkSelection
// ---------------------------------------------------------------------------
describe("validateBulkSelection", () => {
  it("returns error for non-array input", () => {
    const r = validateBulkSelection("not-an-array");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("ids_must_be_array");
  });

  it("returns error for empty array", () => {
    const r = validateBulkSelection([]);
    expect(r.ok).toBe(false);
  });

  it("returns error for array of non-strings", () => {
    const r = validateBulkSelection([1, 2, 3]);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("ids_empty");
  });

  it("accepts a single valid uuid", () => {
    const r = validateBulkSelection([uuid(1)]);
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.data).toEqual([uuid(1)]);
  });

  it("deduplicates repeated ids", () => {
    const id = uuid(1);
    const r = validateBulkSelection([id, id, id]);
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.data.length).toBe(1);
  });

  it("accepts exactly BULK_MAX unique ids", () => {
    const r = validateBulkSelection(manyUuids(BULK_MAX));
    expect(r.ok).toBe(true);
  });

  it("rejects more than BULK_MAX unique ids", () => {
    const r = validateBulkSelection(manyUuids(BULK_MAX + 1));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("ids_exceeds_limit");
  });

  it("rejects arrays containing invalid uuids", () => {
    const r = validateBulkSelection([uuid(1), "not-a-uuid"]);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("invalid_uuid");
  });

  it("silently filters out non-string entries before dedup check", () => {
    // mixing valid uuid + number — the number is filtered, leaving 1 valid entry
    const r = validateBulkSelection([uuid(1), 42 as unknown as string]);
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.data).toEqual([uuid(1)]);
  });
});

// ---------------------------------------------------------------------------
// validateBulkAction
// ---------------------------------------------------------------------------
describe("validateBulkAction", () => {
  it("rejects non-string action", () => {
    const r = validateBulkAction(42, null);
    expect(r.ok).toBe(false);
  });

  it("rejects unknown action", () => {
    const r = validateBulkAction("delete_all", null);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("unknown_action");
  });

  it("BULK_ACTIONS allowlist has exactly 4 entries", () => {
    expect(BULK_ACTIONS).toHaveLength(4);
  });

  describe("acknowledge", () => {
    it("accepts acknowledge with null value", () => {
      const r = validateBulkAction("acknowledge", null);
      expect(r.ok).toBe(true);
      expect(r.ok === true && r.data.value).toBeNull();
    });

    it("accepts acknowledge and ignores supplied value", () => {
      const r = validateBulkAction("acknowledge", "anything");
      expect(r.ok).toBe(true);
      expect(r.ok === true && r.data.value).toBeNull();
    });
  });

  describe("assign_team", () => {
    it("accepts a team id string", () => {
      const r = validateBulkAction("assign_team", "team-public-works");
      expect(r.ok).toBe(true);
      expect(r.ok === true && r.data.value).toBe("team-public-works");
    });

    it("trims whitespace from team id", () => {
      const r = validateBulkAction("assign_team", "  parks  ");
      expect(r.ok === true && r.data.value).toBe("parks");
    });

    it("rejects empty string value", () => {
      const r = validateBulkAction("assign_team", "");
      expect(r.ok).toBe(false);
    });

    it("rejects null value", () => {
      const r = validateBulkAction("assign_team", null);
      expect(r.ok).toBe(false);
    });
  });

  describe("set_status", () => {
    it.each(["open", "dispatched", "in_progress", "closed", "rejected"])(
      "accepts valid status '%s'",
      (status) => {
        const r = validateBulkAction("set_status", status);
        expect(r.ok).toBe(true);
        expect(r.ok === true && r.data.value).toBe(status);
      },
    );

    it("rejects 'merged' (merge-only status, not bulk-settable)", () => {
      const r = validateBulkAction("set_status", "merged");
      expect(r.ok).toBe(false);
    });

    it("rejects arbitrary string", () => {
      const r = validateBulkAction("set_status", "banana");
      expect(r.ok).toBe(false);
    });
  });

  describe("set_priority", () => {
    it.each(["low", "medium", "high", "critical"])(
      "accepts valid priority '%s'",
      (p) => {
        const r = validateBulkAction("set_priority", p);
        expect(r.ok).toBe(true);
        expect(r.ok === true && r.data.value).toBe(p);
      },
    );

    it("rejects invalid priority", () => {
      const r = validateBulkAction("set_priority", "urgent");
      expect(r.ok).toBe(false);
    });
  });
});
