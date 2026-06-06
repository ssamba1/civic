// @vitest-environment node
import { sniffImageMime } from "@/lib/image/sniff-mime";

/**
 * sniffImageMime is pure and dependency-free (no DOM, network, DB, env, or
 * imported modules), so there is nothing to mock — these tests are fully
 * deterministic and feed it raw bytes directly.
 */

// Build a Uint8Array from a list of byte values, padded to `length` with zeros.
function bytes(values: number[], length = values.length): Uint8Array {
  const buf = new Uint8Array(Math.max(length, values.length));
  buf.set(values);
  return buf;
}

// ASCII string -> byte values.
function ascii(str: string): number[] {
  return Array.from(str, (c) => c.charCodeAt(0));
}

describe("sniffImageMime — magic-byte detection", () => {
  it("detects JPEG (FF D8 FF)", () => {
    expect(sniffImageMime(bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe(
      "image/jpeg",
    );
  });

  it("detects JPEG with exactly 3 bytes (minimum length)", () => {
    expect(sniffImageMime(bytes([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
  });

  it("detects PNG (89 50 4E 47)", () => {
    expect(
      sniffImageMime(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("image/png");
  });

  it('detects GIF (47 49 46 38 — "GIF8")', () => {
    // "GIF89a"
    expect(sniffImageMime(bytes(ascii("GIF89a")))).toBe("image/gif");
    // "GIF87a" — also begins with GIF8
    expect(sniffImageMime(bytes(ascii("GIF87a")))).toBe("image/gif");
  });

  it("detects WebP (RIFF....WEBP)", () => {
    // bytes 0-3 "RIFF", 4-7 size (any), 8-11 "WEBP"
    const webp = [...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WEBP")];
    expect(sniffImageMime(bytes(webp))).toBe("image/webp");
  });

  it("returns null for RIFF container that is not WEBP (e.g. WAV)", () => {
    const wav = [...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WAVE")];
    expect(sniffImageMime(bytes(wav))).toBeNull();
  });

  it("detects HEIC (ftyp + heic brand)", () => {
    // bytes 0-3 box size, 4-7 "ftyp", 8-11 brand
    const heic = [0x00, 0x00, 0x00, 0x18, ...ascii("ftyp"), ...ascii("heic")];
    expect(sniffImageMime(bytes(heic))).toBe("image/heic");
  });

  it("detects HEIF across all recognized brands", () => {
    const brands = [
      "heic",
      "heix",
      "hevc",
      "heim",
      "heis",
      "hevx",
      "mif1",
      "msf1",
    ];
    for (const brand of brands) {
      const data = [0x00, 0x00, 0x00, 0x18, ...ascii("ftyp"), ...ascii(brand)];
      expect(sniffImageMime(bytes(data))).toBe("image/heic");
    }
  });

  it("returns null for ftyp box with an unknown (non-HEIF) brand (e.g. mp4)", () => {
    const mp4 = [0x00, 0x00, 0x00, 0x18, ...ascii("ftyp"), ...ascii("mp42")];
    expect(sniffImageMime(bytes(mp4))).toBeNull();
  });
});

describe("sniffImageMime — unknown, empty, and truncated inputs", () => {
  it("returns null for unknown bytes", () => {
    expect(
      sniffImageMime(bytes([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])),
    ).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(sniffImageMime(new Uint8Array(0))).toBeNull();
  });

  it("returns null for truncated JPEG (only 2 of 3 magic bytes)", () => {
    expect(sniffImageMime(bytes([0xff, 0xd8]))).toBeNull();
  });

  it("returns null for truncated PNG (only 3 of 4 magic bytes)", () => {
    expect(sniffImageMime(bytes([0x89, 0x50, 0x4e]))).toBeNull();
  });

  it("returns null for truncated WebP (RIFF present but < 12 bytes)", () => {
    // "RIFF" + size, but no room for the WEBP tag
    const truncated = [...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00];
    expect(sniffImageMime(bytes(truncated))).toBeNull();
  });

  it("returns null for truncated HEIC (ftyp present but < 12 bytes)", () => {
    const truncated = [0x00, 0x00, 0x00, 0x18, ...ascii("ftyp")];
    expect(sniffImageMime(bytes(truncated))).toBeNull();
  });

  it("does not misfire on a near-JPEG (FF D8 followed by wrong third byte)", () => {
    // Third byte must be 0xFF; 0x00 here must not match.
    expect(sniffImageMime(bytes([0xff, 0xd8, 0x00]))).toBeNull();
  });
});

describe("sniffImageMime — input type acceptance", () => {
  const pngBytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  it("accepts a Uint8Array", () => {
    const u8 = new Uint8Array(pngBytes);
    expect(sniffImageMime(u8)).toBe("image/png");
  });

  it("accepts an ArrayBuffer", () => {
    const u8 = new Uint8Array(pngBytes);
    // Pass the underlying ArrayBuffer directly.
    expect(sniffImageMime(u8.buffer)).toBe("image/png");
  });

  it("accepts a Node Buffer", () => {
    const buf = Buffer.from(pngBytes);
    expect(sniffImageMime(buf)).toBe("image/png");
  });

  it("treats a Uint8Array view with a non-zero byteOffset correctly", () => {
    // Buffer.from(view) shares memory; a subarray creates a view with an offset.
    // sniffImageMime reads via indices relative to the view, so this must work.
    const backing = new Uint8Array([0x00, 0x00, ...pngBytes]);
    const view = backing.subarray(2); // offset 2, length 8, sees the PNG signature
    expect(sniffImageMime(view)).toBe("image/png");
  });
});
