import { describe, expect, it } from "vitest";
import {
  assignCluster,
  type ClusterCandidate,
  type DetectionObservation,
  pickBestObservation,
  shouldPromote,
} from "./cluster";

function candidate(
  o: Partial<ClusterCandidate> & { id: string },
): ClusterCandidate {
  return {
    damageClass: "pothole",
    state: "observing",
    observationCount: 1,
    distanceM: 1,
    ...o,
  };
}

function obs(o: Partial<DetectionObservation> = {}): DetectionObservation {
  return {
    damageClass: "pothole",
    capturedAt: "2026-08-20T14:00:00.000Z",
    score: 0.8,
    ...o,
  };
}

describe("assignCluster", () => {
  it("joins the nearest same-class cluster inside the radius", () => {
    const result = assignCluster(obs(), [
      candidate({ id: "far", distanceM: 6 }),
      candidate({ id: "near", distanceM: 2 }),
    ]);
    expect(result).toEqual({ kind: "join", clusterId: "near", distanceM: 2 });
  });

  it("opens a new cluster when the nearest candidate is outside CLUSTER_RADIUS_M", () => {
    // CLUSTER_RADIUS_M is 8-9m away is a different defect, not GPS jitter.
    expect(
      assignCluster(obs(), [candidate({ id: "c1", distanceM: 9 })]),
    ).toEqual({
      kind: "new",
    });
  });

  it("never joins a cluster of a different damage_class", () => {
    expect(
      assignCluster(obs({ damageClass: "pothole" }), [
        candidate({ id: "c1", damageClass: "alligator_crack", distanceM: 0.5 }),
      ]),
    ).toEqual({ kind: "new" });
  });

  it("a resolved cluster does NOT absorb, later detections open a NEW cluster (recurrence signal)", () => {
    expect(
      assignCluster(obs(), [
        candidate({ id: "old", state: "resolved", distanceM: 0.2 }),
      ]),
    ).toEqual({ kind: "new" });
  });

  it("a promoted cluster still absorbs (keeps observation history on the live report)", () => {
    expect(
      assignCluster(obs(), [
        candidate({ id: "live", state: "promoted", distanceM: 3 }),
      ]),
    ).toEqual({ kind: "join", clusterId: "live", distanceM: 3 });
  });

  it("breaks a distance tie on observation_count, then id, for determinism", () => {
    const result = assignCluster(obs(), [
      candidate({ id: "b", distanceM: 4, observationCount: 2 }),
      candidate({ id: "a", distanceM: 4, observationCount: 9 }),
    ]);
    expect(result).toEqual({ kind: "join", clusterId: "a", distanceM: 4 });
  });

  it("opens a new cluster when there are no candidates at all", () => {
    expect(assignCluster(obs(), [])).toEqual({ kind: "new" });
  });
});

describe("shouldPromote", () => {
  const day = (d: string, h = 12) =>
    obs({ capturedAt: `${d}T${String(h).padStart(2, "0")}:00:00.000Z` });

  it("promotes at exactly PROMOTE_MIN_PASSES over PROMOTE_MIN_DISTINCT_DAYS", () => {
    expect(
      shouldPromote(candidate({ id: "c" }), [
        day("2026-08-20", 8),
        day("2026-08-20", 17),
        day("2026-08-21"),
      ]),
    ).toBe(true);
  });

  it("does NOT promote 20 passes that all land on one UTC day", () => {
    const twenty = Array.from({ length: 20 }, (_, i) =>
      day("2026-08-20", i % 24),
    );
    expect(shouldPromote(candidate({ id: "c" }), twenty)).toBe(false);
  });

  it("does NOT promote 2 passes over 2 days (below the pass threshold)", () => {
    expect(
      shouldPromote(candidate({ id: "c" }), [
        day("2026-08-20"),
        day("2026-08-21"),
      ]),
    ).toBe(false);
  });

  it("does not re-promote a cluster that is already promoted, resolved or dismissed", () => {
    const three = [day("2026-08-20", 8), day("2026-08-21"), day("2026-08-22")];
    for (const state of ["promoted", "resolved", "dismissed"] as const) {
      expect(shouldPromote(candidate({ id: "c", state }), three)).toBe(false);
    }
  });

  it("uses UTC dates, so two passes either side of local midnight still count as two days", () => {
    expect(
      shouldPromote(candidate({ id: "c" }), [
        day("2026-08-20", 23),
        day("2026-08-21", 1),
        day("2026-08-21", 2),
      ]),
    ).toBe(true);
  });

  it("ignores malformed timestamps rather than counting them as a distinct day", () => {
    expect(
      shouldPromote(candidate({ id: "c" }), [
        day("2026-08-20"),
        day("2026-08-20", 15),
        obs({ capturedAt: "not-a-date" }),
      ]),
    ).toBe(false);
  });
});

describe("pickBestObservation", () => {
  it("picks the highest score, preferring the slower pass on a tie", () => {
    const best = pickBestObservation([
      obs({ score: 0.7 }),
      obs({ score: 0.9, speedMps: 20 }),
      obs({ score: 0.9, speedMps: 4 }),
    ]);
    expect(best?.speedMps).toBe(4);
  });

  it("returns null for an empty list", () => {
    expect(pickBestObservation([])).toBeNull();
  });
});
