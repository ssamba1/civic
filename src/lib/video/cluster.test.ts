import { describe, expect, it } from "vitest";
import {
  type ClusterableDetection,
  groupDetections,
  haversineMeters,
} from "./cluster";

const BASE = { lng: -84.1402, lat: 34.2073 }; // Cumming, GA

/** A point `meters` east of BASE (small-offset approximation). */
function eastOf(meters: number) {
  const dLng = meters / (111_320 * Math.cos((BASE.lat * Math.PI) / 180));
  return { lng: BASE.lng + dLng, lat: BASE.lat };
}

function det(
  index: number,
  overrides: Partial<ClusterableDetection> = {},
): ClusterableDetection {
  return {
    index,
    class: "pothole",
    confidence: 0.6,
    location: BASE,
    phash: null,
    ...overrides,
  };
}

describe("haversineMeters", () => {
  it("zero for identical points", () => {
    expect(haversineMeters(BASE, BASE)).toBe(0);
  });

  it("~10m for a 10m offset", () => {
    expect(haversineMeters(BASE, eastOf(10))).toBeGreaterThan(9);
    expect(haversineMeters(BASE, eastOf(10))).toBeLessThan(11);
  });
});

describe("groupDetections", () => {
  it("groups same-class detections within the radius", () => {
    const groups = groupDetections(
      [
        det(0),
        det(1, { location: eastOf(5) }),
        det(2, { location: eastOf(10) }),
      ],
      15,
      10,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].indices.sort()).toEqual([0, 1, 2]);
  });

  it("splits detections beyond the radius", () => {
    const groups = groupDetections(
      [det(0), det(1, { location: eastOf(200) })],
      15,
      10,
    );
    expect(groups).toHaveLength(2);
  });

  it("never merges different classes at the same spot", () => {
    const groups = groupDetections(
      [det(0), det(1, { class: "alligator_crack" })],
      15,
      10,
    );
    expect(groups).toHaveLength(2);
  });

  it("GPS-less detections group by near-duplicate phash", () => {
    const groups = groupDetections(
      [
        det(0, { location: null, phash: "ffffffff00000000" }),
        det(1, { location: null, phash: "ffffffff00000001" }),
        det(2, { location: null, phash: "0000000000000000" }),
      ],
      15,
      10,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].indices.sort()).toEqual([0, 1]);
  });

  it("GPS-less without phash never groups", () => {
    const groups = groupDetections(
      [det(0, { location: null }), det(1, { location: null })],
      15,
      10,
    );
    expect(groups).toHaveLength(2);
  });

  it("picks the highest-confidence member as best", () => {
    const groups = groupDetections(
      [
        det(0, { confidence: 0.4 }),
        det(1, { confidence: 0.9, location: eastOf(3) }),
        det(2, { confidence: 0.6, location: eastOf(6) }),
      ],
      15,
      10,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].bestIndex).toBe(1);
    expect(groups[0].maxConfidence).toBe(0.9);
    expect(groups[0].location).toEqual(eastOf(3));
  });
});
