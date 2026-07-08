// @vitest-environment node
//
// Contract test for the privacy blur engine (blur.ts is modify-forbidden —
// this only observes its boundary). Verifies the { blurred: webp, original:
// jpeg } contract, the fallback-region path (no FaceDetector), the 1280px
// output cap, and that the source bitmap is released. The canvas/bitmap
// browser APIs are stubbed since the test runs in node.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// bitmapToJpeg is the "original" encoder — stub it to a sentinel Blob so we can
// assert it's the value returned as `original`. vi.hoisted so the mock fn is
// available to the hoisted vi.mock factory.
const { originalJpeg, bitmapToJpeg } = vi.hoisted(() => {
  const originalJpeg = new Blob(["jpeg-bytes"], { type: "image/jpeg" });
  return {
    originalJpeg,
    bitmapToJpeg: vi.fn(() => Promise.resolve(originalJpeg)),
  };
});
vi.mock("@/lib/image/normalize", () => ({ bitmapToJpeg }));

// Capture the 2D-context calls so we can assert a blur was applied.
let ctxCalls: string[];
function makeCtx() {
  const rec = (name: string) => () => ctxCalls.push(name);
  return {
    scale: rec("scale"),
    drawImage: rec("drawImage"),
    save: rec("save"),
    restore: rec("restore"),
    beginPath: rec("beginPath"),
    rect: rec("rect"),
    clip: rec("clip"),
    set filter(v: string) {
      ctxCalls.push(`filter:${v}`);
    },
    get filter() {
      return "";
    },
  };
}

let lastCanvas: { width: number; height: number };
function installBrowserStubs(bmp: { width: number; height: number }) {
  vi.stubGlobal("createImageBitmap", () =>
    Promise.resolve({ ...bmp, close: vi.fn() }),
  );
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => makeCtx(),
        toBlob: (cb: (b: Blob) => void, type: string, _q?: number) =>
          cb(new Blob(["webp-bytes"], { type })),
      };
      lastCanvas = canvas;
      return canvas;
    },
  });
  // FaceDetector deliberately left undefined → deterministic fallback path.
}

import { blurFacesAndPlates } from "./blur";

beforeEach(() => {
  ctxCalls = [];
  bitmapToJpeg.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("blurFacesAndPlates contract", () => {
  it("returns a webp blurred blob + the jpeg original", async () => {
    installBrowserStubs({ width: 800, height: 600 });
    const out = await blurFacesAndPlates(new Blob(["src"]));
    expect(out.blurred.type).toBe("image/webp");
    expect(out.original).toBe(originalJpeg);
    expect(bitmapToJpeg).toHaveBeenCalledOnce();
  });

  it("applies a blur filter to the fallback regions (no FaceDetector)", async () => {
    installBrowserStubs({ width: 800, height: 600 });
    await blurFacesAndPlates(new Blob(["src"]));
    const blurred = ctxCalls.filter((c) => c.startsWith("filter:blur("));
    // fallback face region (top third) + plate region (bottom third) = 2 blurs
    expect(blurred.length).toBeGreaterThanOrEqual(2);
    expect(ctxCalls).toContain("clip");
  });

  it("caps the blurred canvas long edge at 1280px", async () => {
    installBrowserStubs({ width: 4000, height: 3000 });
    await blurFacesAndPlates(new Blob(["src"]));
    // 4000 long edge -> scaled to 1280; height 3000 * (1280/4000) = 960
    expect(Math.max(lastCanvas.width, lastCanvas.height)).toBe(1280);
    expect(lastCanvas.width).toBe(1280);
    expect(lastCanvas.height).toBe(960);
  });

  it("does not upscale a small image", async () => {
    installBrowserStubs({ width: 400, height: 300 });
    await blurFacesAndPlates(new Blob(["src"]));
    expect(lastCanvas.width).toBe(400);
    expect(lastCanvas.height).toBe(300);
  });
});
