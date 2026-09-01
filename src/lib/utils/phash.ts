"use client";

// Bit-count lookup table for each nibble (0-15).
const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/**
 * Compute a 64-bit average hash (aHash) of an image and return it as a
 * 16-character lowercase hex string.  Runs in the browser via Canvas.
 *
 * Algorithm:
 *   1. Draw the image into an 8×8 canvas (64 pixels).
 *   2. Convert to grayscale using ITU-R BT.601 coefficients.
 *   3. Compute the mean pixel brightness.
 *   4. For each pixel: bit = 1 if brightness ≥ mean, else 0.
 *   5. Pack the 64 bits into a 16-char hex string (MSB first).
 *
 * Returns "0000000000000000" on any error so callers never have to handle
 * rejection, a zero hash scores 0.5 (neutral) in the similarity formula.
 */
export function computeAHash(imageDataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve("0000000000000000");
          return;
        }
        ctx.drawImage(img, 0, 0, 8, 8);
        const { data } = ctx.getImageData(0, 0, 8, 8);

        const grays = new Float32Array(64);
        for (let i = 0; i < 64; i++) {
          grays[i] =
            0.299 * data[i * 4] +
            0.587 * data[i * 4 + 1] +
            0.114 * data[i * 4 + 2];
        }
        let sum = 0;
        for (let i = 0; i < 64; i++) sum += grays[i];
        const avg = sum / 64;

        // Pack 64 bits into 8 bytes, then encode as 16 hex chars.
        let hex = "";
        for (let byte = 0; byte < 8; byte++) {
          let b = 0;
          for (let bit = 0; bit < 8; bit++) {
            if (grays[byte * 8 + bit] >= avg) b |= 1 << (7 - bit);
          }
          hex += b.toString(16).padStart(2, "0");
        }
        resolve(hex);
      } catch {
        resolve("0000000000000000");
      }
    };
    img.onerror = () => resolve("0000000000000000");
    img.src = imageDataUrl;
  });
}

/**
 * Hamming distance between two 16-char hex hashes (0 = identical, 64 = opposite).
 */
export function hammingDistance(a: string, b: string): number {
  let dist = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dist += NIBBLE_BITS[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  }
  return dist;
}

/**
 * Visual similarity score in [0, 1]. 1 = pixel-identical, 0 = completely different.
 * Treats a zero-length or mismatched hash as neutral (0.5).
 */
export function phashSimilarity(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 0.5;
  return 1 - hammingDistance(a, b) / 64;
}
