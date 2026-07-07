import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SCRIPT_HASHES, SW_REGISTER, THEME_INIT } from "./inline-scripts";

// The drift guard: if either inline script changes (even whitespace), its CSP
// hash in SCRIPT_HASHES no longer matches and the browser silently blocks the
// script in prod — a failure tsc/build can't catch. This test turns that into
// a red suite instead.
function cspHash(script: string): string {
  return `'sha256-${createHash("sha256").update(script).digest("base64")}'`;
}

describe("CSP inline-script hashes", () => {
  it("THEME_INIT hash matches SCRIPT_HASHES.themeInit", () => {
    expect(cspHash(THEME_INIT)).toBe(SCRIPT_HASHES.themeInit);
  });

  it("SW_REGISTER hash matches SCRIPT_HASHES.swRegister", () => {
    expect(cspHash(SW_REGISTER)).toBe(SCRIPT_HASHES.swRegister);
  });
});
