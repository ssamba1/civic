// @vitest-environment node
import type { BoundaryGeometry } from "@/lib/onboarding/tiger";
import { boundingBox, pointInBoundary } from "./geo";

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

// Big square with a square hole in the middle (ring 2).
const squareWithHole: BoundaryGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [-2, -2],
      [2, -2],
      [2, 2],
      [-2, 2],
      [-2, -2],
    ],
    [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
      [-0.5, -0.5],
    ],
  ],
};

const twoSquares: BoundaryGeometry = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-3, -3],
        [-2, -3],
        [-2, -2],
        [-3, -2],
        [-3, -3],
      ],
    ],
    [
      [
        [2, 2],
        [3, 2],
        [3, 3],
        [2, 3],
        [2, 2],
      ],
    ],
  ],
};

describe("boundingBox", () => {
  it("spans all positions", () => {
    expect(boundingBox(square)).toEqual({
      minLng: -1,
      minLat: -1,
      maxLng: 1,
      maxLat: 1,
    });
  });
  it("handles MultiPolygon extent", () => {
    expect(boundingBox(twoSquares)).toEqual({
      minLng: -3,
      minLat: -3,
      maxLng: 3,
      maxLat: 3,
    });
  });
});

describe("pointInBoundary", () => {
  it("detects inside / outside a simple polygon", () => {
    expect(pointInBoundary(0, 0, square)).toBe(true);
    expect(pointInBoundary(5, 5, square)).toBe(false);
  });

  it("excludes points inside a hole", () => {
    expect(pointInBoundary(1.5, 1.5, squareWithHole)).toBe(true); // in ring, outside hole
    expect(pointInBoundary(0, 0, squareWithHole)).toBe(false); // inside hole
  });

  it("matches any polygon of a MultiPolygon", () => {
    expect(pointInBoundary(-2.5, -2.5, twoSquares)).toBe(true);
    expect(pointInBoundary(2.5, 2.5, twoSquares)).toBe(true);
    expect(pointInBoundary(0, 0, twoSquares)).toBe(false);
  });
});
