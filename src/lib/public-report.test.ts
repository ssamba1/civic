import { describe, expect, it, vi } from "vitest";
import type { DashboardReport } from "@/lib/dashboard-data";

vi.mock("server-only", () => ({}));

const corpus = vi.hoisted(() => ({ reports: [] as DashboardReport[] }));

vi.mock("@/lib/dashboard-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dashboard-data")>();
  return { ...actual, getReportCorpus: () => corpus.reports };
});

import { getPublicReport, publicToken } from "./public-report";

function report(overrides: Partial<DashboardReport>): DashboardReport {
  return {
    id: "report-1",
    category: "pothole",
    severity: 3,
    status: "open",
    address: "100 Main St",
    location: { lng: 0, lat: 0 },
    photo_public_url: "p.jpg",
    created_at: "2026-06-01T00:00:00.000Z",
    reporter_id: "u1",
    ...overrides,
  };
}

describe("publicToken", () => {
  it("is deterministic for the same id", () => {
    expect(publicToken("report-1")).toBe(publicToken("report-1"));
  });

  it("is opaque — not the id, fixed length, differs per id", () => {
    const t = publicToken("report-1");
    expect(t).not.toBe("report-1");
    expect(t).toHaveLength(24);
    expect(t).not.toBe(publicToken("report-2"));
  });
});

describe("getPublicReport", () => {
  it("resolves a token back to its PII-safe report (no reporter id)", () => {
    corpus.reports = [report({ id: "report-7", category: "graffiti" })];
    const view = getPublicReport(publicToken("report-7"));
    expect(view).not.toBeNull();
    expect(view?.category).toBe("graffiti");
    expect(view).not.toHaveProperty("reporter_id");
  });

  it("returns null for an unknown or empty token (no enumeration)", () => {
    corpus.reports = [report({ id: "report-7" })];
    expect(getPublicReport("deadbeef")).toBeNull();
    expect(getPublicReport("")).toBeNull();
  });

  it("maps internal status to the public surface", () => {
    corpus.reports = [
      report({ id: "a", status: "open" }),
      report({ id: "b", status: "dispatched" }),
      report({ id: "c", status: "closed" }),
      report({ id: "d", status: "merged" }),
      report({ id: "e", status: "rejected" }),
    ];
    expect(getPublicReport(publicToken("a"))?.publicStatus).toBe("in_progress");
    expect(getPublicReport(publicToken("b"))?.publicStatus).toBe("in_progress");
    expect(getPublicReport(publicToken("c"))?.publicStatus).toBe("resolved");
    expect(getPublicReport(publicToken("d"))?.publicStatus).toBe("closed");
    expect(getPublicReport(publicToken("e"))?.publicStatus).toBe("closed");
  });

  it("estimates a fix-by date for open reports (filed + category SLA window)", () => {
    // pothole SLA = 72h; filed 2026-06-01T00:00Z -> due 2026-06-04T00:00Z
    corpus.reports = [
      report({ id: "fb", status: "open", category: "pothole" }),
    ];
    const view = getPublicReport(publicToken("fb"));
    expect(view?.estimatedFixBy).toBe("2026-06-04T00:00:00.000Z");
  });

  it("omits the fix-by date once resolved", () => {
    corpus.reports = [
      report({ id: "done", status: "closed", category: "pothole" }),
    ];
    expect(
      getPublicReport(publicToken("done"))?.estimatedFixBy,
    ).toBeUndefined();
  });

  it("surfaces the resolution photo only when resolved", () => {
    corpus.reports = [
      report({
        id: "x",
        status: "closed",
        afterPhoto: "after.jpg",
        completed_at: "2026-06-05T00:00:00.000Z",
      }),
    ];
    const view = getPublicReport(publicToken("x"));
    expect(view?.resolutionPhotoUrl).toBe("after.jpg");
    expect(view?.resolvedAt).toBe("2026-06-05T00:00:00.000Z");
  });
});
