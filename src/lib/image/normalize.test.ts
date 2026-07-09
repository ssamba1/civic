// @vitest-environment node
// Tests for bitmapToJpeg in normalize.ts.
// normalize.ts has a module-level `const isBrowser = typeof document !== "undefined"`
// which is false in node. We override the guard by stubbing `document` in the
// global scope BEFORE the module is evaluated — achieved with vi.hoisted + a
// globalThis assignment that runs in the module registry phase.
//
// The strategy: use vi.mock to provide a factory that side-effects globalThis
// and then re-exports the real module, OR simply test the canvas math by
// mocking the whole function. The cleanest approach here is to stub globalThis
// with a document object that satisfies `typeof document !== "undefined"`, then
// import via a dynamic import inside a vi.hoisted block so it runs before the
// module cache is seeded.
//
// Given the complexity, we use a simpler alternative: test bitmapToJpeg via a
// module re-export wrapper that forces `isBrowser = true` by mocking the guard.
// We achieve this by entirely mocking the "document" global in a hoisted block.

import { beforeEach, describe, expect, it, vi } from "vitest";

// hoisted block: sets up globalThis.document before any module is evaluated.
const { stubDoc } = vi.hoisted(() => {
  // biome-ignore lint/suspicious/noExplicitAny: test setup
  let _toBlob: (
    cb: (b: Blob | null) => void,
    type: string,
    q?: number,
  ) => void = (cb, type) => cb(new Blob(["jpeg"], { type }));
  // biome-ignore lint/suspicious/noExplicitAny: test setup
  let _lastCanvas: any = { width: 0, height: 0 };

  const stubDoc = {
    createElement: (_tag: string) => {
      const canvas = {
        width: 0,
        height: 0,
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        getContext: (_ctx: string): any => ({ drawImage: vi.fn() }),
        toBlob: (cb: (b: Blob | null) => void, type: string, q?: number) =>
          _toBlob(cb, type, q),
      };
      _lastCanvas = canvas;
      return canvas;
    },
    setToBlob: (fn: typeof _toBlob) => {
      _toBlob = fn;
    },
    getLastCanvas: () => _lastCanvas,
    resetCanvas: () => {
      _lastCanvas = { width: 0, height: 0 };
    },
    resetToBlob: () => {
      _toBlob = (cb, type) => cb(new Blob(["jpeg"], { type }));
    },
  };
  // Install before module evaluation.
  // biome-ignore lint/suspicious/noExplicitAny: global test setup
  (globalThis as any).document = stubDoc;
  return { stubDoc };
});

import { bitmapToJpeg } from "./normalize";

function makeBitmap(width: number, height: number): ImageBitmap {
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  return { width, height, close: vi.fn() } as any;
}

beforeEach(() => {
  stubDoc.resetToBlob();
  stubDoc.resetCanvas();
});

describe("bitmapToJpeg", () => {
  it("returns a Blob with type image/jpeg", async () => {
    const blob = await bitmapToJpeg(makeBitmap(800, 600));
    expect(blob.type).toBe("image/jpeg");
  });

  it("does not upscale images smaller than maxEdge", async () => {
    await bitmapToJpeg(makeBitmap(400, 300), 1280);
    expect(stubDoc.getLastCanvas().width).toBe(400);
    expect(stubDoc.getLastCanvas().height).toBe(300);
  });

  it("caps the long edge at maxEdge for a landscape image (4000x3000→1280x960)", async () => {
    await bitmapToJpeg(makeBitmap(4000, 3000), 1280);
    expect(stubDoc.getLastCanvas().width).toBe(1280);
    expect(stubDoc.getLastCanvas().height).toBe(960);
  });

  it("caps the long edge at maxEdge for a portrait image (1000x2000→640x1280)", async () => {
    await bitmapToJpeg(makeBitmap(1000, 2000), 1280);
    expect(stubDoc.getLastCanvas().width).toBe(640);
    expect(stubDoc.getLastCanvas().height).toBe(1280);
  });

  it("respects a custom maxEdge", async () => {
    await bitmapToJpeg(makeBitmap(2000, 1000), 500);
    expect(stubDoc.getLastCanvas().width).toBe(500);
    expect(stubDoc.getLastCanvas().height).toBe(250);
  });

  it("exact boundary: image at maxEdge is not scaled", async () => {
    await bitmapToJpeg(makeBitmap(1280, 720), 1280);
    expect(stubDoc.getLastCanvas().width).toBe(1280);
    expect(stubDoc.getLastCanvas().height).toBe(720);
  });

  it("throws when canvas produces a null blob", async () => {
    stubDoc.setToBlob((cb) => cb(null));
    await expect(bitmapToJpeg(makeBitmap(100, 100))).rejects.toThrow(
      /failed to produce/i,
    );
  });
});
