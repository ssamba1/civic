import { describe, expect, it } from "vitest";
import {
  detectConflicts,
  groupByDay,
  type SchedulableWorkOrder,
  validateSchedule,
} from "./schedule";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date("2026-07-09T12:00:00.000Z");

function daysFromNow(n: number): Date {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function woFixture(
  id: string,
  scheduledFor: string | null,
  assignedCrewId: string | null = null,
  scheduledWindowEnd: string | null = null,
): SchedulableWorkOrder {
  return { id, scheduledFor, scheduledWindowEnd, assignedCrewId };
}

// ---------------------------------------------------------------------------
// validateSchedule
// ---------------------------------------------------------------------------

describe("validateSchedule", () => {
  it("accepts a date in the near future", () => {
    const result = validateSchedule({
      scheduledFor: daysFromNow(1),
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a date exactly on the 90-day boundary", () => {
    const result = validateSchedule({
      scheduledFor: daysFromNow(90),
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a past date", () => {
    const result = validateSchedule({
      scheduledFor: daysFromNow(-1),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: "past_date" });
  });

  it("rejects a date equal to now (already past by the time validated)", () => {
    const past = new Date(NOW.getTime() - 1);
    const result = validateSchedule({ scheduledFor: past, now: NOW });
    expect(result).toEqual({ ok: false, error: "past_date" });
  });

  it("rejects a date more than 90 days out", () => {
    const result = validateSchedule({
      scheduledFor: daysFromNow(91),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: "too_far_out" });
  });

  it("accepts a valid window end after the start", () => {
    const start = daysFromNow(2);
    const end = daysFromNow(2);
    end.setUTCHours(end.getUTCHours() + 4);
    const result = validateSchedule({
      scheduledFor: start,
      windowEnd: end,
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects window end before start", () => {
    const start = daysFromNow(2);
    const end = daysFromNow(1);
    const result = validateSchedule({
      scheduledFor: start,
      windowEnd: end,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: "window_before_start" });
  });

  it("rejects window end equal to start", () => {
    const start = daysFromNow(2);
    const result = validateSchedule({
      scheduledFor: start,
      windowEnd: new Date(start),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: "window_before_start" });
  });

  it("uses real Date() when now is omitted", () => {
    // A date 30 days from the actual current moment must pass.
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 30);
    const result = validateSchedule({ scheduledFor: soon });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// groupByDay
// ---------------------------------------------------------------------------

describe("groupByDay", () => {
  it("groups WOs by their date portion", () => {
    const wos = [
      woFixture("a", "2026-07-10T08:00:00.000Z"),
      woFixture("b", "2026-07-10T14:00:00.000Z"),
      woFixture("c", "2026-07-11T09:00:00.000Z"),
    ];
    const map = groupByDay(wos);
    expect(map.size).toBe(2);
    expect(map.get("2026-07-10")?.map((w) => w.id)).toEqual(["a", "b"]);
    expect(map.get("2026-07-11")?.map((w) => w.id)).toEqual(["c"]);
  });

  it("excludes WOs with null scheduledFor", () => {
    const wos = [
      woFixture("a", null),
      woFixture("b", "2026-07-12T00:00:00.000Z"),
    ];
    const map = groupByDay(wos);
    expect(map.size).toBe(1);
    expect(map.has("2026-07-12")).toBe(true);
  });

  it("returns an empty map when all WOs are unscheduled", () => {
    const map = groupByDay([woFixture("a", null), woFixture("b", null)]);
    expect(map.size).toBe(0);
  });

  it("returns an empty map for an empty input", () => {
    expect(groupByDay([]).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// detectConflicts
// ---------------------------------------------------------------------------

describe("detectConflicts", () => {
  const CREW_A = "crew-uuid-a";
  const CREW_B = "crew-uuid-b";

  it("returns empty when no WOs", () => {
    expect(detectConflicts([])).toEqual([]);
  });

  it("returns empty when all WOs lack crews", () => {
    const wos = [
      woFixture("a", "2026-07-10T08:00:00.000Z", null),
      woFixture("b", "2026-07-10T09:00:00.000Z", null),
    ];
    expect(detectConflicts(wos)).toEqual([]);
  });

  it("returns empty when all WOs are unscheduled", () => {
    const wos = [woFixture("a", null, CREW_A), woFixture("b", null, CREW_A)];
    expect(detectConflicts(wos)).toEqual([]);
  });

  it("returns empty when one WO per crew per day", () => {
    const wos = [
      woFixture("a", "2026-07-10T08:00:00.000Z", CREW_A),
      woFixture("b", "2026-07-11T08:00:00.000Z", CREW_A),
      woFixture("c", "2026-07-10T08:00:00.000Z", CREW_B),
    ];
    expect(detectConflicts(wos)).toEqual([]);
  });

  it("detects a conflict when one crew has two WOs on the same day", () => {
    const wos = [
      woFixture("a", "2026-07-10T08:00:00.000Z", CREW_A),
      woFixture("b", "2026-07-10T14:00:00.000Z", CREW_A),
    ];
    const conflicts = detectConflicts(wos);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.crewId).toBe(CREW_A);
    expect(conflicts[0]?.date).toBe("2026-07-10");
    expect(conflicts[0]?.workOrderIds.sort()).toEqual(["a", "b"]);
  });

  it("detects conflicts for multiple crews independently", () => {
    const wos = [
      woFixture("a", "2026-07-10T08:00:00.000Z", CREW_A),
      woFixture("b", "2026-07-10T14:00:00.000Z", CREW_A),
      woFixture("c", "2026-07-10T09:00:00.000Z", CREW_B),
      woFixture("d", "2026-07-10T15:00:00.000Z", CREW_B),
    ];
    const conflicts = detectConflicts(wos);
    expect(conflicts).toHaveLength(2);
  });

  it("does not flag conflict when same crew appears on different days", () => {
    const wos = [
      woFixture("a", "2026-07-10T08:00:00.000Z", CREW_A),
      woFixture("b", "2026-07-11T08:00:00.000Z", CREW_A),
    ];
    expect(detectConflicts(wos)).toEqual([]);
  });

  it("handles three WOs for same crew+day, all ids included", () => {
    const wos = [
      woFixture("a", "2026-07-10T08:00:00.000Z", CREW_A),
      woFixture("b", "2026-07-10T12:00:00.000Z", CREW_A),
      woFixture("c", "2026-07-10T16:00:00.000Z", CREW_A),
    ];
    const conflicts = detectConflicts(wos);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.workOrderIds.sort()).toEqual(["a", "b", "c"]);
  });
});
