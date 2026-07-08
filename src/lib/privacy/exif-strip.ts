// Server-side image metadata strip (LCP-20), defense-in-depth behind the
// client-side canvas re-encode (canvas output is already metadata-free).
// Runs on the raw bytes immediately before any storage upload so a tampered
// or non-canvas client can never land EXIF/GPS/IPTC in a bucket.
//
// Dependency-free by design: walks the container structure (JPEG segments,
// WebP RIFF chunks, PNG chunks) and drops metadata blocks. Any buffer that
// doesn't parse cleanly is returned unchanged — corrupting a photo is worse
// than passing through bytes the client already sanitized.

/** JPEG markers that carry metadata. APP0 (JFIF) and APP2 (ICC) are kept —
 * dropping ICC shifts colors and neither carries PII. */
const JPEG_DROP_MARKERS = new Set([
  0xe1, // APP1: EXIF (incl. GPS) + XMP
  0xed, // APP13: Photoshop IRB / IPTC (caption, creator, location)
  0xfe, // COM: free-text comment
]);

function stripJpeg(buf: Buffer): Buffer {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const out: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let pos = 2;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) return buf; // desynced — bail, return original
    const marker = buf[pos + 1];
    // Standalone markers (TEM, RST0-7) have no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    // SOS: entropy-coded data follows — copy the remainder verbatim.
    if (marker === 0xda) {
      out.push(buf.subarray(pos));
      return Buffer.concat(out);
    }
    if (marker === 0xd9) {
      // EOI before SOS — malformed but harmless; keep it and stop.
      out.push(buf.subarray(pos, pos + 2));
      return Buffer.concat(out);
    }
    const len = buf.readUInt16BE(pos + 2);
    if (len < 2 || pos + 2 + len > buf.length) return buf;
    if (!JPEG_DROP_MARKERS.has(marker)) {
      out.push(buf.subarray(pos, pos + 2 + len));
    }
    pos += 2 + len;
  }
  return buf; // never reached SOS — malformed, return original
}

/** WebP RIFF chunks that carry metadata. */
const WEBP_DROP_CHUNKS = new Set(["EXIF", "XMP "]);
const VP8X_EXIF_FLAG = 0x08;
const VP8X_XMP_FLAG = 0x04;

function stripWebp(buf: Buffer): Buffer {
  if (
    buf.length < 12 ||
    buf.toString("latin1", 0, 4) !== "RIFF" ||
    buf.toString("latin1", 8, 12) !== "WEBP"
  ) {
    return buf;
  }
  const chunks: Buffer[] = [];
  let pos = 12;
  let dropped = false;
  while (pos + 8 <= buf.length) {
    const fourCC = buf.toString("latin1", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const padded = size + (size % 2); // chunks are word-aligned
    if (pos + 8 + size > buf.length) return buf;
    if (WEBP_DROP_CHUNKS.has(fourCC)) {
      dropped = true;
    } else {
      const chunk = Buffer.from(buf.subarray(pos, pos + 8 + padded));
      if (fourCC === "VP8X" && size >= 1) {
        // Clear the EXIF/XMP presence flags so the header stays consistent
        // with the chunks we removed.
        chunk[8] &= ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG);
      }
      chunks.push(chunk);
    }
    pos += 8 + padded;
  }
  if (!dropped) return buf;
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length + 4, 4); // + "WEBP" fourCC
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** PNG chunks that carry metadata (eXIf incl. GPS; text chunks can hold
 * XMP/IPTC dumps). All are ancillary — decoders ignore their absence. */
const PNG_DROP_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(buf: Buffer): Buffer {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) return buf;
  const out: Buffer[] = [buf.subarray(0, 8)];
  let pos = 8;
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const total = 12 + len; // length + type + data + CRC
    if (pos + total > buf.length) return buf;
    if (!PNG_DROP_CHUNKS.has(type)) {
      out.push(buf.subarray(pos, pos + total));
    }
    pos += total;
    if (type === "IEND") break;
  }
  return Buffer.concat(out);
}

/**
 * Strip EXIF/XMP/IPTC/comment metadata from a JPEG, WebP, or PNG buffer.
 * Format is sniffed from magic bytes; unknown or malformed input is returned
 * unchanged (the client-side canvas re-encode is the primary sanitizer —
 * this layer must never turn a valid photo into a broken one).
 */
export function stripImageMetadata(buf: Buffer): Buffer {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return stripJpeg(buf);
  }
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF") {
    return stripWebp(buf);
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) {
    return stripPng(buf);
  }
  return buf;
}
