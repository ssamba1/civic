/**
 * Detect an image's MIME type from its leading magic bytes.
 *
 * Pure, dependency-free, no DOM. Works in any runtime. Returns `null` when the
 * bytes don't match a recognized image signature.
 */

const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "heim",
  "heis",
  "hevx",
  "mif1",
  "msf1",
]);

function toBytes(input: Uint8Array | ArrayBuffer | Buffer): Uint8Array {
  if (input instanceof Uint8Array) {
    // Covers Node Buffer too (Buffer extends Uint8Array).
    return input;
  }
  return new Uint8Array(input);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(bytes[offset + i]);
  }
  return out;
}

export function sniffImageMime(
  input: Uint8Array | ArrayBuffer | Buffer,
): string | null {
  const bytes = toBytes(input);

  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  // GIF: 47 49 46 38  ("GIF8")
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }

  // WebP: bytes 0-3 "RIFF" AND bytes 8-11 "WEBP"
  if (
    bytes.length >= 12 &&
    asciiAt(bytes, 0, 4) === "RIFF" &&
    asciiAt(bytes, 8, 4) === "WEBP"
  ) {
    return "image/webp";
  }

  // HEIC/HEIF: bytes 4-7 "ftyp" AND brand at bytes 8-11 in the HEIF brand set
  if (
    bytes.length >= 12 &&
    asciiAt(bytes, 4, 4) === "ftyp" &&
    HEIF_BRANDS.has(asciiAt(bytes, 8, 4))
  ) {
    return "image/heic";
  }

  return null;
}
