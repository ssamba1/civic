import { describe, expect, it } from "vitest";
import { stripImageMetadata } from "./exif-strip";

// ---- JPEG builders ----------------------------------------------------------
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const len = Buffer.alloc(2);
  len.writeUInt16BE(payload.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), len, payload]);
}

// Minimal SOS + a byte of "scan data" so the strip has an entropy section to
// copy verbatim.
const SOS = Buffer.concat([
  jpegSegment(0xda, Buffer.from([0x00, 0x01, 0x00, 0x00, 0x3f, 0x00])),
  Buffer.from([0xaa, 0xbb, 0xcc]),
]);

function exifApp1(gps = "GPS 33.90,-84.13"): Buffer {
  return jpegSegment(0xe1, Buffer.concat([Buffer.from("Exif\0\0"), Buffer.from(gps)]));
}

// ---- WebP builders ----------------------------------------------------------
function webpChunk(fourCC: string, data: Buffer): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(data.length);
  const pad = data.length % 2 ? Buffer.from([0x00]) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(fourCC, "latin1"), size, data, pad]);
}

function webp(chunks: Buffer[]): Buffer {
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}

// ---- PNG builders -----------------------------------------------------------
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); // strip never validates CRC
  return Buffer.concat([len, Buffer.from(type, "latin1"), data, crc]);
}

describe("stripImageMetadata — JPEG", () => {
  it("drops the EXIF APP1 (GPS) segment but keeps scan data", () => {
    const input = Buffer.concat([SOI, exifApp1(), SOS, EOI]);
    const out = stripImageMetadata(input);
    expect(out.includes(Buffer.from("GPS 33.90"))).toBe(false);
    expect(out.includes(Buffer.from([0xaa, 0xbb, 0xcc]))).toBe(true); // scan survives
    expect(out.subarray(0, 2)).toEqual(SOI);
  });

  it("drops APP13 (IPTC) and COM comment segments", () => {
    const iptc = jpegSegment(0xed, Buffer.from("Photoshop 3.0\0 caption:secret"));
    const com = jpegSegment(0xfe, Buffer.from("shot on device X at home"));
    const input = Buffer.concat([SOI, iptc, com, SOS, EOI]);
    const out = stripImageMetadata(input);
    expect(out.includes(Buffer.from("caption:secret"))).toBe(false);
    expect(out.includes(Buffer.from("shot on device X"))).toBe(false);
    expect(out.includes(Buffer.from([0xaa, 0xbb, 0xcc]))).toBe(true);
  });

  it("keeps APP0/JFIF and APP2/ICC segments", () => {
    const jfif = jpegSegment(0xe0, Buffer.from("JFIF\0"));
    const icc = jpegSegment(0xe2, Buffer.from("ICC_PROFILE\0 colors"));
    const input = Buffer.concat([SOI, jfif, icc, exifApp1(), SOS, EOI]);
    const out = stripImageMetadata(input);
    expect(out.includes(Buffer.from("JFIF"))).toBe(true);
    expect(out.includes(Buffer.from("ICC_PROFILE"))).toBe(true);
    expect(out.includes(Buffer.from("Exif"))).toBe(false);
  });

  it("returns a strictly smaller buffer when metadata was present", () => {
    const input = Buffer.concat([SOI, exifApp1(), SOS, EOI]);
    expect(stripImageMetadata(input).length).toBeLessThan(input.length);
  });

  it("passes through a clean JPEG unchanged", () => {
    const input = Buffer.concat([SOI, jpegSegment(0xe0, Buffer.from("JFIF\0")), SOS, EOI]);
    expect(stripImageMetadata(input).equals(input)).toBe(true);
  });

  it("returns the original on a desynced/malformed JPEG", () => {
    const input = Buffer.concat([SOI, Buffer.from([0x00, 0x11, 0x22, 0x33])]);
    expect(stripImageMetadata(input).equals(input)).toBe(true);
  });
});

describe("stripImageMetadata — WebP", () => {
  it("drops EXIF and XMP chunks, keeps VP8 image data", () => {
    const vp8 = webpChunk("VP8 ", Buffer.from([0x01, 0x02, 0x03, 0x04]));
    const exif = webpChunk("EXIF", Buffer.from("GPS 12.34,-56.78"));
    const xmp = webpChunk("XMP ", Buffer.from("<x:xmpmeta>location</x:xmpmeta>"));
    const input = webp([vp8, exif, xmp]);
    const out = stripImageMetadata(input);
    expect(out.includes(Buffer.from("GPS 12.34"))).toBe(false);
    expect(out.includes(Buffer.from("xmpmeta"))).toBe(false);
    expect(out.includes(Buffer.from([0x01, 0x02, 0x03, 0x04]))).toBe(true);
  });

  it("clears the VP8X EXIF/XMP presence flags", () => {
    const vp8x = webpChunk(
      "VP8X",
      Buffer.concat([Buffer.from([0x08 | 0x04]), Buffer.alloc(9)]), // EXIF+XMP flags set
    );
    const exif = webpChunk("EXIF", Buffer.from("secret gps"));
    const input = webp([vp8x, exif]);
    const out = stripImageMetadata(input);
    // Locate the VP8X chunk in output and confirm flag byte is cleared.
    const idx = out.indexOf(Buffer.from("VP8X", "latin1"));
    expect(idx).toBeGreaterThan(0);
    const flagByte = out[idx + 8];
    expect(flagByte & (0x08 | 0x04)).toBe(0);
  });

  it("rewrites the RIFF size to match the shrunken body", () => {
    const vp8 = webpChunk("VP8 ", Buffer.from([0xde, 0xad]));
    const exif = webpChunk("EXIF", Buffer.from("0123456789"));
    const input = webp([vp8, exif]);
    const out = stripImageMetadata(input);
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
  });

  it("passes through a WebP with no metadata unchanged", () => {
    const input = webp([webpChunk("VP8 ", Buffer.from([0x11, 0x22]))]);
    expect(stripImageMetadata(input).equals(input)).toBe(true);
  });
});

describe("stripImageMetadata — PNG", () => {
  it("drops eXIf and text chunks, keeps IHDR/IDAT/IEND", () => {
    const ihdr = pngChunk("IHDR", Buffer.alloc(13));
    const exif = pngChunk("eXIf", Buffer.from("MM\0* gps payload"));
    const text = pngChunk("iTXt", Buffer.from("XML:com.adobe.xmp location"));
    const idat = pngChunk("IDAT", Buffer.from([0x78, 0x9c, 0x01]));
    const iend = pngChunk("IEND", Buffer.alloc(0));
    const input = Buffer.concat([PNG_SIG, ihdr, exif, text, idat, iend]);
    const out = stripImageMetadata(input);
    expect(out.includes(Buffer.from("gps payload"))).toBe(false);
    expect(out.includes(Buffer.from("com.adobe.xmp"))).toBe(false);
    expect(out.includes(Buffer.from([0x78, 0x9c, 0x01]))).toBe(true);
    expect(out.subarray(0, 8)).toEqual(PNG_SIG);
  });

  it("passes through a clean PNG unchanged", () => {
    const input = Buffer.concat([
      PNG_SIG,
      pngChunk("IHDR", Buffer.alloc(13)),
      pngChunk("IDAT", Buffer.from([0x00])),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
    expect(stripImageMetadata(input).equals(input)).toBe(true);
  });
});

describe("stripImageMetadata — unknown/garbage input", () => {
  it("returns non-image bytes unchanged", () => {
    const input = Buffer.from("not an image at all");
    expect(stripImageMetadata(input).equals(input)).toBe(true);
  });

  it("returns tiny buffers unchanged", () => {
    const input = Buffer.from([0xff]);
    expect(stripImageMetadata(input).equals(input)).toBe(true);
  });
});
