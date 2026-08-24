/**
 * Server-side aHash — the same 64-bit average hash the client blur pipeline
 * computes for report photos (photo_phash), so hashes are comparable across
 * both intake channels. Pure functions; the 8×8 grayscale bytes come from
 * ffmpeg (frame-extract.ts).
 */

/** 64 gray bytes (8×8) → 16-char hex aHash. Bit i = pixel i >= mean. */
export function ahashFromGray8x8(gray: Uint8Array): string {
  if (gray.length !== 64) {
    throw new Error(`ahashFromGray8x8 expects 64 bytes, got ${gray.length}`);
  }
  let sum = 0;
  for (const v of gray) sum += v;
  const mean = sum / 64;
  let hex = "";
  for (let nibble = 0; nibble < 16; nibble++) {
    let bits = 0;
    for (let b = 0; b < 4; b++) {
      const i = nibble * 4 + b;
      bits = (bits << 1) | (gray[i] >= mean ? 1 : 0);
    }
    hex += bits.toString(16);
  }
  return hex;
}

const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** Hamming distance between two hex aHashes (same as report dedup scoring). */
export function hammingDistance(a: string, b: string): number {
  let dist = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dist += NIBBLE_BITS[(parseInt(a[i], 16) ^ parseInt(b[i], 16)) & 0xf];
  }
  return dist;
}
