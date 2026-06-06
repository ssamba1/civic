// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DashboardReport } from "@/lib/dashboard-data";
import {
  type CompletionMap,
  getReportCompletion,
  resolveReportStatus,
} from "./task-completion";

const report = {
  id: "report-1",
  status: "open",
} as Pick<DashboardReport, "id" | "status">;

describe("resolveReportStatus", () => {
  it("returns the corpus status when there is no completion", () => {
    expect(resolveReportStatus(report, {})).toBe("open");
  });

  it("resolves to closed when a completion exists", () => {
    const map: CompletionMap = {
      "report-1": { completedAt: "2026-06-06T00:00:00.000Z" },
    };
    expect(resolveReportStatus(report, map)).toBe("closed");
  });
});

describe("getReportCompletion", () => {
  it("returns the completion entry (with after-photo) or undefined", () => {
    const map: CompletionMap = {
      "report-1": {
        completedAt: "2026-06-06T00:00:00.000Z",
        afterPhoto: "data:,",
      },
    };
    expect(getReportCompletion(report, map)?.afterPhoto).toBe("data:,");
    expect(getReportCompletion({ id: "report-2" }, map)).toBeUndefined();
  });
});
