// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ReportStatus } from "@/lib/types";
import {
  STATUS_LABEL,
  STATUS_TONE,
  statusChipClass,
  toneChipClass,
  toneTextClass,
} from "./status";

const ALL_STATUSES: ReportStatus[] = [
  "open",
  "dispatched",
  "in_progress",
  "closed",
  "merged",
  "rejected",
];

describe("STATUS_LABEL", () => {
  it("covers every ReportStatus", () => {
    for (const s of ALL_STATUSES) {
      expect(STATUS_LABEL[s]).toBeTruthy();
    }
  });

  it("returns a non-empty string per status", () => {
    expect(STATUS_LABEL.open).toBe("Open");
    expect(STATUS_LABEL.dispatched).toBe("Dispatched");
    expect(STATUS_LABEL.in_progress).toBe("In progress");
    expect(STATUS_LABEL.closed).toBe("Resolved");
    expect(STATUS_LABEL.merged).toBe("Merged");
    expect(STATUS_LABEL.rejected).toBe("Rejected");
  });
});

describe("STATUS_TONE", () => {
  it("covers every ReportStatus", () => {
    for (const s of ALL_STATUSES) {
      expect(STATUS_TONE[s]).toBeTruthy();
    }
  });

  it("assigns expected tones", () => {
    expect(STATUS_TONE.open).toBe("warning");
    expect(STATUS_TONE.dispatched).toBe("info");
    expect(STATUS_TONE.in_progress).toBe("info");
    expect(STATUS_TONE.closed).toBe("success");
    expect(STATUS_TONE.merged).toBe("neutral");
    expect(STATUS_TONE.rejected).toBe("danger");
  });
});

describe("statusChipClass", () => {
  it("returns a non-empty string for every status", () => {
    for (const s of ALL_STATUSES) {
      const cls = statusChipClass(s);
      expect(typeof cls).toBe("string");
      expect(cls.length).toBeGreaterThan(0);
    }
  });

  it("different tones produce different classes", () => {
    const open = statusChipClass("open"); // warning
    const closed = statusChipClass("closed"); // success
    const rejected = statusChipClass("rejected"); // danger
    expect(open).not.toBe(closed);
    expect(open).not.toBe(rejected);
    expect(closed).not.toBe(rejected);
  });

  it("same-tone statuses produce same class", () => {
    // dispatched and in_progress both → info
    expect(statusChipClass("dispatched")).toBe(statusChipClass("in_progress"));
  });
});

describe("toneTextClass", () => {
  it("returns a CSS-variable text class per tone", () => {
    expect(toneTextClass("success")).toContain("text-");
    expect(toneTextClass("warning")).toContain("text-");
    expect(toneTextClass("danger")).toContain("text-");
    expect(toneTextClass("info")).toContain("text-");
    expect(toneTextClass("neutral")).toContain("text-");
  });

  it("produces distinct classes for distinct tones", () => {
    const tones = ["success", "warning", "danger", "info", "neutral"] as const;
    const classes = tones.map(toneTextClass);
    expect(new Set(classes).size).toBe(tones.length);
  });
});

describe("toneChipClass", () => {
  it("includes the base chip classes and tone-specific fragments", () => {
    const cls = toneChipClass("success");
    expect(cls).toContain("inline-flex");
    expect(cls).toContain("items-center");
    // text class must appear
    expect(cls).toContain(toneTextClass("success"));
  });
});
