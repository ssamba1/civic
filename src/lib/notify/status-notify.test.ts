import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailMessage } from "@/lib/notify/deliver";
import type { ReportCategory } from "@/lib/types";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

// Capture the composed EmailMessage instead of actually delivering.
const deliverEmail = vi.hoisted(() =>
  vi.fn(async (_m: EmailMessage) => ({ sent: true, reason: "ok" as const })),
);
vi.mock("@/lib/notify/deliver", () => ({ deliverEmail }));

// Mutable fixture the db mock reads, so each test can vary the row/email.
const state = vi.hoisted(() => ({
  reportRow: {
    id: "r1",
    reporter_id: "u1",
    classifications: { category: "pothole" as ReportCategory },
    work_orders: {
      resolution_photo_url: "https://x/after.jpg" as string | null,
    },
  },
  userEmail: "resident@example.com" as string | null,
}));

vi.mock("@/lib/db/client", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({
          data: table === "reports" ? state.reportRow : null,
          error: null,
        }),
        maybeSingle: async () => ({
          data: table === "users" ? { email: state.userEmail } : null,
          error: null,
        }),
      };
      return chain;
    },
  }),
}));

import { notifyReportStatus } from "./status-notify";

beforeEach(() => {
  deliverEmail.mockClear();
  state.reportRow = {
    id: "r1",
    reporter_id: "u1",
    classifications: { category: "pothole" },
    work_orders: { resolution_photo_url: "https://x/after.jpg" },
  };
  state.userEmail = "resident@example.com";
});

describe("notifyReportStatus, transition gating", () => {
  it.each([
    "open",
    "in_progress",
    "merged",
  ] as const)("does not notify on non-actionable status '%s'", async (status) => {
    const res = await notifyReportStatus("r1", status);
    expect(res).toEqual({ sent: false, reason: "disabled" });
    expect(deliverEmail).not.toHaveBeenCalled();
  });

  it.each([
    "closed",
    "dispatched",
    "rejected",
  ] as const)("notifies on actionable status '%s'", async (status) => {
    await notifyReportStatus("r1", status);
    expect(deliverEmail).toHaveBeenCalledOnce();
  });
});

describe("notifyReportStatus, message composition", () => {
  it("resolved carries the resolution photo (the lever) and a 'resolved' subject", async () => {
    await notifyReportStatus("r1", "closed");
    const msg = deliverEmail.mock.calls[0][0];
    expect(msg.subject.toLowerCase()).toContain("resolved");
    expect(msg.photoUrl).toBe("https://x/after.jpg");
    expect(msg.to).toBe("resident@example.com");
  });

  it("dispatched is an acknowledgement with no photo", async () => {
    await notifyReportStatus("r1", "dispatched");
    const msg = deliverEmail.mock.calls[0][0];
    expect(msg.subject.toLowerCase()).toContain("picked up");
    expect(msg.photoUrl).toBeNull();
  });

  it("passes to:null for an anonymous reporter (no email), deliver no-ops", async () => {
    state.userEmail = null;
    await notifyReportStatus("r1", "closed");
    const msg = deliverEmail.mock.calls[0][0];
    expect(msg.to).toBeNull();
  });

  it("uses the report's category noun in the subject", async () => {
    state.reportRow.classifications = { category: "water_leak" };
    await notifyReportStatus("r1", "dispatched");
    const msg = deliverEmail.mock.calls[0][0];
    expect(msg.subject).toContain("water leak");
  });
});
