// @vitest-environment node
import type { BoundaryGeometry } from "@/lib/onboarding/tiger";
import { pointInBoundary } from "./geo";
import { generateSyntheticReports } from "./synthetic";

// A unit square; every bbox sample lands inside, so all points must be in-boundary.
const square: BoundaryGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ],
  ],
};

const NOW = 1_700_000_000_000;
const VALID_STATUS = new Set([
  "open",
  "dispatched",
  "in_progress",
  "closed",
  "rejected",
]);

describe("generateSyntheticReports", () => {
  it("is deterministic for a given seed", () => {
    const a = generateSyntheticReports({
      boundary: square,
      count: 50,
      seed: 7,
      now: NOW,
    });
    const b = generateSyntheticReports({
      boundary: square,
      count: 50,
      seed: 7,
      now: NOW,
    });
    expect(a).toEqual(b);
  });

  it("generates the requested count, all inside the boundary", () => {
    const r = generateSyntheticReports({
      boundary: square,
      count: 120,
      seed: 3,
      now: NOW,
    });
    expect(r).toHaveLength(120);
    for (const rep of r) {
      expect(pointInBoundary(rep.location.lng, rep.location.lat, square)).toBe(
        true,
      );
    }
  });

  it("emits valid, non-emergency, source-tagged rows", () => {
    const r = generateSyntheticReports({
      boundary: square,
      count: 100,
      seed: 5,
      now: NOW,
    });
    for (const rep of r) {
      expect(rep.source).toBe("synthetic");
      expect(rep.sourceExternalId).toBeTruthy();
      expect(rep.severity).toBeGreaterThanOrEqual(1);
      expect(rep.severity).toBeLessThanOrEqual(5);
      expect(VALID_STATUS.has(rep.status)).toBe(true);
      expect(new Date(rep.createdAt).getTime()).toBeLessThanOrEqual(NOW);
      // No NormalizedReport carries is_emergency; synthetic never forces dispatch.
      expect(rep).not.toHaveProperty("is_emergency");
    }
  });

  it("gives closed reports a resolvedAt at/after creation and not in the future", () => {
    const r = generateSyntheticReports({
      boundary: square,
      count: 200,
      seed: 9,
      now: NOW,
    });
    const closed = r.filter((x) => x.status === "closed");
    expect(closed.length).toBeGreaterThan(0);
    for (const c of closed.filter((x) => x.resolvedAt)) {
      const created = new Date(c.createdAt).getTime();
      const resolved = new Date(c.resolvedAt as string).getTime();
      expect(resolved).toBeGreaterThanOrEqual(created);
      expect(resolved).toBeLessThanOrEqual(NOW);
    }
  });

  it("front-loads activity toward the present (recency curve)", () => {
    const span = 180;
    const r = generateSyntheticReports({
      boundary: square,
      count: 400,
      seed: 2,
      now: NOW,
      spanDays: span,
    });
    const ageDays = (iso: string) =>
      (NOW - new Date(iso).getTime()) / 86_400_000;
    const recent = r.filter((x) => ageDays(x.createdAt) < span / 2).length;
    expect(recent).toBeGreaterThan(r.length / 2);
  });

  it("returns [] for a degenerate boundary", () => {
    const degenerate: BoundaryGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0, 0],
          [0, 0],
        ],
      ],
    };
    expect(
      generateSyntheticReports({ boundary: degenerate, now: NOW }),
    ).toEqual([]);
  });
});
