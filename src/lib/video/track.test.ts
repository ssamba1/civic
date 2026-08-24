import { describe, expect, it } from "vitest";
import { interpolateTrack, parseTrack } from "./track";

describe("parseTrack", () => {
  it("returns [] for non-arrays", () => {
    expect(parseTrack(null)).toEqual([]);
    expect(parseTrack("nope")).toEqual([]);
    expect(parseTrack({ t: 0 })).toEqual([]);
  });

  it("drops malformed and out-of-range points, keeps valid ones sorted", () => {
    const track = parseTrack([
      { t: 5, lng: -84.14, lat: 34.2 },
      { t: 0, lng: -84.15, lat: 34.21 },
      { t: 2, lng: 999, lat: 34.2 }, // lng out of range
      { t: "x", lng: -84.14, lat: 34.2 }, // non-numeric t
      "garbage",
    ]);
    expect(track.map((p) => p.t)).toEqual([0, 5]);
  });
});

describe("interpolateTrack", () => {
  const track = parseTrack([
    { t: 0, lng: 0, lat: 0 },
    { t: 10, lng: 10, lat: 20 },
  ]);

  it("null for an empty track", () => {
    expect(interpolateTrack([], 5)).toBeNull();
  });

  it("clamps before the first and after the last point", () => {
    expect(interpolateTrack(track, -5)).toEqual({ lng: 0, lat: 0 });
    expect(interpolateTrack(track, 99)).toEqual({ lng: 10, lat: 20 });
  });

  it("linearly interpolates between bracketing points", () => {
    expect(interpolateTrack(track, 5)).toEqual({ lng: 5, lat: 10 });
    const quarter = interpolateTrack(track, 2.5);
    expect(quarter?.lng).toBeCloseTo(2.5);
    expect(quarter?.lat).toBeCloseTo(5);
  });

  it("handles duplicate timestamps without dividing by zero", () => {
    const dup = parseTrack([
      { t: 1, lng: 0, lat: 0 },
      { t: 1, lng: 4, lat: 4 },
    ]);
    const p = interpolateTrack(dup, 1);
    expect(p).not.toBeNull();
    expect(Number.isFinite(p?.lng ?? Number.NaN)).toBe(true);
  });
});
