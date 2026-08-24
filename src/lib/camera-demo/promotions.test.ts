import { describe, expect, it } from "vitest";

import type { DetectionExport } from "./promotions";
import { derivePromotions } from "./promotions";
import { BUS_ROUTE, positionAt } from "./route-path";

function makeExport(
  boxesPerFrame: number[],
  conf = 0.9,
  fps = 30,
): DetectionExport {
  return {
    fps,
    width: 1280,
    height: 720,
    frames: boxesPerFrame.map((n, i) => ({
      i,
      boxes: Array.from({ length: n }, () => ({
        x: 0.4,
        y: 0.6,
        w: 0.1,
        h: 0.1,
        conf,
      })),
    })),
  };
}

describe("derivePromotions", () => {
  it("empty frames promote nothing", () => {
    expect(derivePromotions(makeExport(Array(100).fill(0)))).toEqual([]);
  });

  it("needs accumulated hit-frames before first promotion", () => {
    // 5 frames with hits < minFramesWithHits 12 -> nothing
    const few = makeExport([1, 1, 1, 1, 1, ...Array(50).fill(0)]);
    expect(derivePromotions(few)).toEqual([]);
  });

  it("promotes once hits and confidence accumulate, then respects cooldown", () => {
    // 300 consecutive hit-frames at 30fps = 10s of continuous damage
    const data = makeExport(Array(300).fill(1));
    const promos = derivePromotions(data);
    expect(promos.length).toBeGreaterThanOrEqual(2);
    // cooldown: successive promotions at least ~3s apart
    for (let i = 1; i < promos.length; i++) {
      expect(promos[i].time - promos[i - 1].time).toBeGreaterThanOrEqual(3);
    }
    // deterministic replay
    expect(derivePromotions(data)).toEqual(promos);
  });

  it("low-confidence boxes never promote", () => {
    const data = makeExport(Array(300).fill(1), 0.4);
    expect(derivePromotions(data)).toEqual([]);
  });

  it("promotion locations sit on the bus route", () => {
    const data = makeExport(Array(300).fill(1));
    for (const p of derivePromotions(data)) {
      expect(p.location.lng).toBeLessThanOrEqual(-84.1);
      expect(p.location.lng).toBeGreaterThanOrEqual(-84.16);
      expect(p.location.lat).toBeGreaterThanOrEqual(34.18);
      expect(p.location.lat).toBeLessThanOrEqual(34.24);
    }
  });
});

describe("positionAt", () => {
  it("clamps and hits endpoints", () => {
    expect(positionAt(-1)).toEqual(BUS_ROUTE[0]);
    expect(positionAt(2)).toEqual(BUS_ROUTE[BUS_ROUTE.length - 1]);
  });
  it("midpoints stay inside the Cumming bbox", () => {
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const p = positionAt(t);
      expect(p.lng).toBeGreaterThanOrEqual(-84.16);
      expect(p.lng).toBeLessThanOrEqual(-84.1);
      expect(p.lat).toBeGreaterThanOrEqual(34.18);
      expect(p.lat).toBeLessThanOrEqual(34.24);
    }
  });
});
