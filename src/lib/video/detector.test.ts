import { describe, expect, it } from "vitest";
import { decodeYoloOutput, iou, nms, rgbToChwFloat } from "./detector";

const CLASSES = [
  "longitudinal_crack",
  "transverse_crack",
  "alligator_crack",
  "pothole",
] as const;

describe("rgbToChwFloat", () => {
  it("deinterleaves RGB into CHW planes normalized to [0,1]", () => {
    // 2×2 image, 4 pixels: R=255, G=0, B=51 everywhere.
    const size = 2;
    const rgb = new Uint8Array(size * size * 3);
    for (let i = 0; i < size * size; i++) {
      rgb[i * 3] = 255;
      rgb[i * 3 + 1] = 0;
      rgb[i * 3 + 2] = 51;
    }
    const chw = rgbToChwFloat(rgb, size);
    expect(chw.length).toBe(12);
    expect([...chw.slice(0, 4)]).toEqual([1, 1, 1, 1]);
    expect([...chw.slice(4, 8)]).toEqual([0, 0, 0, 0]);
    expect(chw[8]).toBeCloseTo(0.2);
  });
});

describe("iou / nms", () => {
  it("iou of identical boxes is 1, disjoint is 0", () => {
    const a = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    expect(iou(a, a)).toBeCloseTo(1);
    expect(iou(a, { x: 0.8, y: 0.8, w: 0.1, h: 0.1 })).toBe(0);
  });

  it("nms suppresses same-class overlaps, keeps other classes", () => {
    const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    const near = { x: 0.11, y: 0.11, w: 0.2, h: 0.2 };
    const kept = nms(
      [
        { class: "pothole", confidence: 0.9, bbox: box },
        { class: "pothole", confidence: 0.7, bbox: near },
        { class: "alligator_crack", confidence: 0.6, bbox: near },
      ],
      0.45,
    );
    expect(kept).toHaveLength(2);
    expect(kept[0]).toMatchObject({ class: "pothole", confidence: 0.9 });
  });
});

describe("decodeYoloOutput", () => {
  const SIZE = 640;
  const ATTRS = 4 + CLASSES.length;

  /** Build a channel-first [1, attrs, n] tensor with the given boxes. */
  function channelFirst(
    boxes: { cx: number; cy: number; w: number; h: number; scores: number[] }[],
    n: number,
  ): Float32Array {
    const data = new Float32Array(ATTRS * n);
    boxes.forEach((b, j) => {
      data[0 * n + j] = b.cx;
      data[1 * n + j] = b.cy;
      data[2 * n + j] = b.w;
      data[3 * n + j] = b.h;
      b.scores.forEach((s, c) => {
        data[(4 + c) * n + j] = s;
      });
    });
    return data;
  }

  it("decodes a channel-first tensor and normalizes the bbox", () => {
    const n = 3;
    const data = channelFirst(
      [{ cx: 320, cy: 320, w: 64, h: 64, scores: [0, 0, 0, 0.8] }],
      n,
    );
    const dets = decodeYoloOutput(data, [1, ATTRS, n], CLASSES, 0.3, SIZE);
    expect(dets).toHaveLength(1);
    expect(dets[0].class).toBe("pothole");
    expect(dets[0].confidence).toBeCloseTo(0.8);
    expect(dets[0].bbox.x).toBeCloseTo(0.45);
    expect(dets[0].bbox.w).toBeCloseTo(0.1);
  });

  it("decodes the transposed [1, n, attrs] layout identically", () => {
    const n = 2;
    const data = new Float32Array(n * ATTRS);
    // box 1 (row 0): pothole at center
    data.set([320, 320, 64, 64, 0, 0, 0, 0.9], 0);
    const dets = decodeYoloOutput(data, [1, n, ATTRS], CLASSES, 0.3, SIZE);
    expect(dets).toHaveLength(1);
    expect(dets[0].class).toBe("pothole");
  });

  it("drops boxes below the confidence threshold", () => {
    const n = 1;
    const data = channelFirst(
      [{ cx: 320, cy: 320, w: 64, h: 64, scores: [0.2, 0, 0, 0] }],
      n,
    );
    expect(decodeYoloOutput(data, [1, ATTRS, n], CLASSES, 0.3, SIZE)).toEqual(
      [],
    );
  });

  it("clamps boxes that extend past the frame", () => {
    const n = 1;
    const data = channelFirst(
      [{ cx: 630, cy: 10, w: 100, h: 100, scores: [0, 0.9, 0, 0] }],
      n,
    );
    const [det] = decodeYoloOutput(data, [1, ATTRS, n], CLASSES, 0.3, SIZE);
    expect(det.bbox.x + det.bbox.w).toBeLessThanOrEqual(1);
    expect(det.bbox.y).toBe(0);
  });

  it("keeps the right edge put when the left edge clamps to 0", () => {
    // cx=20, w=100 -> the true box spans [-30, 70] px. Clamping only the left
    // edge and keeping w produced [0, 100] — the same width, translated right,
    // pointing at a different part of the road. The right edge must stay at 70.
    const n = 1;
    const data = channelFirst(
      [{ cx: 20, cy: 300, w: 100, h: 40, scores: [0, 0, 0, 0.9] }],
      n,
    );
    const [det] = decodeYoloOutput(data, [1, ATTRS, n], CLASSES, 0.3, SIZE);
    expect(det.bbox.x).toBe(0);
    expect(det.bbox.x + det.bbox.w).toBeCloseTo(70 / SIZE, 6);
    expect(det.bbox.w).toBeCloseTo(70 / SIZE, 6);
  });

  it("keeps the bottom edge put when the top edge clamps to 0", () => {
    const n = 1;
    const data = channelFirst(
      [{ cx: 300, cy: 10, w: 40, h: 100, scores: [0, 0, 0, 0.9] }],
      n,
    );
    const [det] = decodeYoloOutput(data, [1, ATTRS, n], CLASSES, 0.3, SIZE);
    expect(det.bbox.y).toBe(0);
    expect(det.bbox.y + det.bbox.h).toBeCloseTo(60 / SIZE, 6);
  });

  it("clamps the far edge without moving the near edge", () => {
    // Box runs off the right of the frame: near edge stays, far edge clamps.
    const n = 1;
    const data = channelFirst(
      [{ cx: 620, cy: 300, w: 80, h: 40, scores: [0, 0, 0, 0.9] }],
      n,
    );
    const [det] = decodeYoloOutput(data, [1, ATTRS, n], CLASSES, 0.3, SIZE);
    expect(det.bbox.x).toBeCloseTo(580 / SIZE, 6);
    expect(det.bbox.x + det.bbox.w).toBeCloseTo(1, 6);
  });

  it("returns [] for unrecognized dims", () => {
    expect(
      decodeYoloOutput(new Float32Array(8), [1, 2, 4], CLASSES, 0.3, SIZE),
    ).toEqual([]);
    expect(
      decodeYoloOutput(new Float32Array(8), [8], CLASSES, 0.3, SIZE),
    ).toEqual([]);
  });
});
