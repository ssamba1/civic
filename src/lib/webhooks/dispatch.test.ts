import { describe, expect, it } from "vitest";
import type { WebhookReportPayload } from "./dispatch";
import { buildWebhookPayload, signPayload, verifySignature } from "./dispatch";

const SAMPLE_REPORT: WebhookReportPayload = {
  id: "abc-123",
  city_id: "city-1",
  category: "pothole",
  status: "open",
  severity: 3,
  address: "123 Main St",
  lat: 34.27,
  lng: -84.07,
  created_at: "2026-07-09T00:00:00Z",
  updated_at: null,
};

describe("buildWebhookPayload", () => {
  it("sets schema_version to 1", () => {
    const p = buildWebhookPayload("report.created", SAMPLE_REPORT);
    expect(p.schema_version).toBe(1);
  });

  it("passes the event through", () => {
    const p = buildWebhookPayload("report.closed", SAMPLE_REPORT);
    expect(p.event).toBe("report.closed");
  });

  it("uses provided timestamp", () => {
    const ts = "2026-07-09T12:00:00Z";
    const p = buildWebhookPayload("report.created", SAMPLE_REPORT, ts);
    expect(p.timestamp).toBe(ts);
  });

  it("falls back to a recent ISO timestamp when no ts supplied", () => {
    const before = Date.now();
    const p = buildWebhookPayload("report.created", SAMPLE_REPORT);
    const after = Date.now();
    const ts = new Date(p.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe("signPayload", () => {
  it("returns a 64-char hex string", () => {
    const p = buildWebhookPayload("report.created", SAMPLE_REPORT);
    const sig = signPayload(p, "secret123");
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for the same payload + secret", () => {
    const p = buildWebhookPayload(
      "report.created",
      SAMPLE_REPORT,
      "2026-07-09T00:00:00Z",
    );
    const s1 = signPayload(p, "mysecret");
    const s2 = signPayload(p, "mysecret");
    expect(s1).toBe(s2);
  });

  it("differs with different secrets", () => {
    const p = buildWebhookPayload(
      "report.created",
      SAMPLE_REPORT,
      "2026-07-09T00:00:00Z",
    );
    expect(signPayload(p, "secret-a")).not.toBe(signPayload(p, "secret-b"));
  });

  it("differs when event changes", () => {
    const ts = "2026-07-09T00:00:00Z";
    const p1 = buildWebhookPayload("report.created", SAMPLE_REPORT, ts);
    const p2 = buildWebhookPayload("report.closed", SAMPLE_REPORT, ts);
    expect(signPayload(p1, "s")).not.toBe(signPayload(p2, "s"));
  });
});

describe("verifySignature", () => {
  it("returns true for a valid signature", () => {
    const p = buildWebhookPayload(
      "report.created",
      SAMPLE_REPORT,
      "2026-07-09T00:00:00Z",
    );
    const sig = signPayload(p, "secret");
    expect(verifySignature(p, "secret", sig)).toBe(true);
  });

  it("returns false for a tampered signature", () => {
    const p = buildWebhookPayload(
      "report.created",
      SAMPLE_REPORT,
      "2026-07-09T00:00:00Z",
    );
    expect(verifySignature(p, "secret", "deadbeef")).toBe(false);
  });

  it("returns false for wrong secret", () => {
    const p = buildWebhookPayload(
      "report.created",
      SAMPLE_REPORT,
      "2026-07-09T00:00:00Z",
    );
    const sig = signPayload(p, "correct");
    expect(verifySignature(p, "wrong", sig)).toBe(false);
  });
});
