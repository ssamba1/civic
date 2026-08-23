import { describe, expect, it } from "vitest";
import {
  assemblePacket,
  DEFAULT_RESPONSE_WINDOW_DAYS,
  type PacketInput,
} from "./packet";

function warrantyInput(overrides: Partial<PacketInput> = {}): PacketInput {
  return {
    report: {
      id: "11111111-1111-4111-8111-111111111111",
      category: "pothole",
      severity: 4,
      hazardSeverity: "high",
      address: "120 Main St",
      lng: -84.14,
      lat: 34.2,
      observedAt: "2026-08-20T14:00:00.000Z",
      source: "resident",
    },
    photoUrls: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
    liability: {
      verdict: "contractor_warranty",
      contractorId: "22222222-2222-4222-8222-222222222222",
      contractRef: "2024-17",
      permitRef: null,
      jobCompletedAt: "2024-11-04",
      warrantyType: "workmanship",
      windowEndsOn: "2026-11-04",
      matchDistanceM: 6.25,
      confidence: 0.82,
    },
    contractorName: "Acme Paving",
    generatedAt: "2026-08-23T09:00:00.000Z",
    ...overrides,
  };
}

describe("assemblePacket", () => {
  it("produces a stable field order and shape", () => {
    const packet = assemblePacket(warrantyInput());

    expect(Object.keys(packet)).toEqual([
      "reportId",
      "basis",
      "defect",
      "liability",
      "requestedAction",
      "generatedAt",
    ]);
    expect(Object.keys(packet.defect)).toEqual([
      "category",
      "severity",
      "hazardSeverity",
      "address",
      "lng",
      "lat",
      "photoUrls",
      "observedAt",
      "observationCount",
    ]);
    expect(Object.keys(packet.liability)).toEqual([
      "contractorId",
      "contractorName",
      "contractRef",
      "permitRef",
      "jobCompletedAt",
      "warrantyType",
      "windowEndsOn",
      "matchDistanceM",
      "confidence",
    ]);
  });

  it("copies defect and liability fields verbatim", () => {
    const packet = assemblePacket(warrantyInput());

    expect(packet.reportId).toBe("11111111-1111-4111-8111-111111111111");
    expect(packet.basis).toBe("warranty");
    expect(packet.generatedAt).toBe("2026-08-23T09:00:00.000Z");
    expect(packet.defect).toMatchObject({
      category: "pothole",
      severity: 4,
      hazardSeverity: "high",
      address: "120 Main St",
      lng: -84.14,
      lat: 34.2,
      observedAt: "2026-08-20T14:00:00.000Z",
    });
    expect(packet.defect.photoUrls).toEqual([
      "https://cdn.example/a.jpg",
      "https://cdn.example/b.jpg",
    ]);
    expect(packet.liability).toEqual({
      contractorId: "22222222-2222-4222-8222-222222222222",
      contractorName: "Acme Paving",
      contractRef: "2024-17",
      permitRef: null,
      jobCompletedAt: "2024-11-04",
      warrantyType: "workmanship",
      windowEndsOn: "2026-11-04",
      matchDistanceM: 6.25,
      confidence: 0.82,
    });
  });

  it("does not alias the caller's photo array", () => {
    const input = warrantyInput();
    const packet = assemblePacket(input);
    input.photoUrls.push("https://cdn.example/c.jpg");
    expect(packet.defect.photoUrls).toHaveLength(2);
  });

  it("defaults observationCount to 1 when no cluster stats are given", () => {
    expect(assemblePacket(warrantyInput()).defect.observationCount).toBe(1);
  });

  it("defaults observationCount to 1 when the cluster reports fewer than 1", () => {
    const packet = assemblePacket(
      warrantyInput({
        observation: {
          count: 0,
          distinctDays: 0,
          firstSeenAt: null,
          lastSeenAt: null,
        },
      }),
    );
    expect(packet.defect.observationCount).toBe(1);
  });

  it("uses the cluster observation count for camera reports", () => {
    const packet = assemblePacket(
      warrantyInput({
        report: { ...warrantyInput().report, source: "camera" },
        observation: {
          count: 7,
          distinctDays: 3,
          firstSeenAt: "2026-08-14T12:00:00.000Z",
          lastSeenAt: "2026-08-20T14:00:00.000Z",
        },
      }),
    );
    expect(packet.defect.observationCount).toBe(7);
  });

  it("adds an observation-history line to requestedAction for camera clusters", () => {
    const packet = assemblePacket(
      warrantyInput({
        report: { ...warrantyInput().report, source: "camera" },
        observation: {
          count: 7,
          distinctDays: 3,
          firstSeenAt: "2026-08-14T12:00:00.000Z",
          lastSeenAt: "2026-08-20T14:00:00.000Z",
        },
      }),
    );
    expect(packet.requestedAction).toContain(
      "Observed 7 times across 3 days (2026-08-14 to 2026-08-20)",
    );
  });

  it("omits the observation-history line for single-observation reports", () => {
    expect(assemblePacket(warrantyInput()).requestedAction).not.toContain(
      "Observed",
    );
  });

  it("states the warranty basis, contract ref and response window", () => {
    const action = assemblePacket(warrantyInput()).requestedAction;
    expect(action).toContain("workmanship warranty");
    expect(action).toContain("2024-17");
    expect(action).toContain("no cost to the City");
    expect(action).toContain(`${DEFAULT_RESPONSE_WINDOW_DAYS} days`);
  });

  it("honours an explicit response window", () => {
    const action = assemblePacket(
      warrantyInput({ responseWindowDays: 30 }),
    ).requestedAction;
    expect(action).toContain("30 days");
  });

  it("maps utility_restoration to the utility basis and cites the permit", () => {
    const packet = assemblePacket(
      warrantyInput({
        liability: {
          verdict: "utility_restoration",
          contractorId: null,
          contractRef: null,
          permitRef: "P-8821",
          jobCompletedAt: null,
          warrantyType: null,
          windowEndsOn: "2027-01-15",
          matchDistanceM: 2.5,
          confidence: 0.44,
        },
        contractorName: "Telecom Y",
      }),
    );
    expect(packet.basis).toBe("utility_restoration");
    expect(packet.requestedAction).toContain("P-8821");
    expect(packet.requestedAction).toContain("restoration");
  });

  it("still reads sensibly when contract and permit refs are missing", () => {
    const packet = assemblePacket(
      warrantyInput({
        liability: {
          ...warrantyInput().liability,
          contractRef: null,
          warrantyType: null,
        },
        contractorName: null,
      }),
    );
    expect(packet.requestedAction).not.toContain("null");
    expect(packet.requestedAction).not.toContain("undefined");
    expect(packet.liability.contractorName).toBeNull();
  });

  it("is deterministic — same input, identical JSON", () => {
    const a = assemblePacket(warrantyInput());
    const b = assemblePacket(warrantyInput());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
