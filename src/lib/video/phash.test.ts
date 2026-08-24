import { describe, expect, it } from "vitest";
import { ahashFromGray8x8, hammingDistance } from "./phash";

describe("ahashFromGray8x8", () => {
  it("throws on wrong length", () => {
    expect(() => ahashFromGray8x8(new Uint8Array(10))).toThrow();
  });

  it("uniform image hashes to all-ones (every pixel >= mean)", () => {
    const gray = new Uint8Array(64).fill(128);
    expect(ahashFromGray8x8(gray)).toBe("ffffffffffffffff");
  });

  it("half-bright/half-dark image sets exactly the bright bits", () => {
    const gray = new Uint8Array(64);
    gray.fill(255, 0, 32);
    expect(ahashFromGray8x8(gray)).toBe("ffffffff00000000");
  });

  it("is 16 lowercase hex chars", () => {
    const gray = new Uint8Array(64).map((_, i) => (i * 37) % 256);
    expect(ahashFromGray8x8(gray)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("hammingDistance", () => {
  it("identical hashes are distance 0", () => {
    expect(hammingDistance("ffffffffffffffff", "ffffffffffffffff")).toBe(0);
  });

  it("fully inverted hashes are distance 64", () => {
    expect(hammingDistance("ffffffffffffffff", "0000000000000000")).toBe(64);
  });

  it("single-nibble difference counts its bits", () => {
    expect(hammingDistance("f000000000000000", "e000000000000000")).toBe(1);
  });
});
