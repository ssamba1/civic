import { describe, expect, it } from "vitest";
import {
  addMonths,
  type CalendarCell,
  monthGrid,
  monthLabel,
} from "./calendar-grid";

describe("monthGrid", () => {
  // July 2026 starts on a Wednesday; a Monday-start grid therefore begins on
  // Mon 2026-06-29 (two leading days from June) and runs 42 cells.
  const july = monthGrid("2026-07-01", "2026-07-15");

  it("always returns 42 cells", () => {
    expect(july).toHaveLength(42);
  });

  it("starts on the Monday on/before the 1st (2026-06-29 for July 2026)", () => {
    expect(july[0]?.iso).toBe("2026-06-29");
  });

  it("ends 41 days later (2026-08-09)", () => {
    expect(july[41]?.iso).toBe("2026-08-09");
  });

  it("marks leading/trailing days out-of-month and July days in-month", () => {
    // First two cells are June (padding), the 1st of July is the third cell.
    expect(july[0]?.inMonth).toBe(false); // 2026-06-29
    expect(july[1]?.inMonth).toBe(false); // 2026-06-30
    expect(july[2]).toMatchObject({ iso: "2026-07-01", inMonth: true });
    expect(july[32]).toMatchObject({ iso: "2026-07-31", inMonth: true });
    expect(july[33]?.inMonth).toBe(false); // 2026-08-01
  });

  it("flags only todayISO as today", () => {
    const todays = july.filter((c: CalendarCell) => c.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0]?.iso).toBe("2026-07-15");
  });

  it("flags no cell as today when todayISO is outside the grid", () => {
    expect(monthGrid("2026-07-01", "2030-01-01").some((c) => c.isToday)).toBe(
      false,
    );
  });

  it("accepts any day within the month as the anchor (uses the whole month)", () => {
    expect(monthGrid("2026-07-31", "2026-07-15")).toEqual(july);
  });

  it("builds February correctly (2026-02-01 starts on Sunday → grid 2026-01-26)", () => {
    const feb = monthGrid("2026-02-01", "2026-02-01");
    expect(feb[0]?.iso).toBe("2026-01-26");
    expect(feb).toHaveLength(42);
    expect(feb.filter((c) => c.inMonth)).toHaveLength(28);
  });
});

describe("addMonths", () => {
  it("advances to the 1st of the next month", () => {
    expect(addMonths("2026-07-01", 1)).toBe("2026-08-01");
  });

  it("clamps end-of-month anchors via day-1 anchoring (no Feb 31)", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("steps backward and crosses a year boundary", () => {
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-01");
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
  });

  it("is a no-op month-wise for delta 0 but normalizes to day-1", () => {
    expect(addMonths("2026-07-20", 0)).toBe("2026-07-01");
  });
});

describe("monthLabel", () => {
  it("formats the anchor month as 'Month YYYY'", () => {
    expect(monthLabel("2026-07-01")).toBe("July 2026");
    expect(monthLabel("2026-12-25")).toBe("December 2026");
  });
});
