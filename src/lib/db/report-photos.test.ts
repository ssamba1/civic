import { describe, expect, it } from "vitest";
import { buildPhotoPaths } from "./report-photos";

describe("buildPhotoPaths", () => {
  const CITY = "city-uuid-123";
  const REPORT = "report-uuid-456";

  it("returns empty array for count=0", () => {
    expect(buildPhotoPaths(CITY, REPORT, 0)).toEqual([]);
  });

  it("single photo (count=1): idx 0 only", () => {
    const paths = buildPhotoPaths(CITY, REPORT, 1);
    expect(paths).toHaveLength(1);
    expect(paths[0].publicPath).toBe(`${CITY}/${REPORT}/0.webp`);
    expect(paths[0].rawPath).toBe(`${CITY}/${REPORT}/0.jpg`);
  });

  it("six photos: indices 0-5, correct extensions", () => {
    const paths = buildPhotoPaths(CITY, REPORT, 6);
    expect(paths).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      expect(paths[i].publicPath).toBe(`${CITY}/${REPORT}/${i}.webp`);
      expect(paths[i].rawPath).toBe(`${CITY}/${REPORT}/${i}.jpg`);
    }
  });

  it("indices are sequential (0-based)", () => {
    const paths = buildPhotoPaths(CITY, REPORT, 4);
    const indices = paths.map((p) => {
      const m = p.publicPath.match(/\/(\d+)\.webp$/);
      return m ? Number(m[1]) : -1;
    });
    expect(indices).toEqual([0, 1, 2, 3]);
  });

  it("folder prefix contains cityId and reportId", () => {
    const paths = buildPhotoPaths("c1", "r1", 2);
    for (const p of paths) {
      expect(p.publicPath).toMatch(/^c1\/r1\//);
      expect(p.rawPath).toMatch(/^c1\/r1\//);
    }
  });

  it("publicPath ends with .webp, rawPath ends with .jpg", () => {
    const paths = buildPhotoPaths(CITY, REPORT, 3);
    for (const p of paths) {
      expect(p.publicPath).toMatch(/\.webp$/);
      expect(p.rawPath).toMatch(/\.jpg$/);
    }
  });
});
