import { describe, expect, it } from "vitest";
import { isSupportedLocale, pickLocale } from "./locale";

describe("isSupportedLocale", () => {
  it("returns true for supported codes", () => {
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("es")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(true);
    expect(isSupportedLocale("zh")).toBe(true);
  });

  it("returns false for unknown codes", () => {
    expect(isSupportedLocale("xx")).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
    expect(isSupportedLocale("")).toBe(false);
  });
});

describe("pickLocale", () => {
  it("defaults to en when nothing provided", () => {
    expect(pickLocale(null, null)).toBe("en");
    expect(pickLocale(undefined, undefined)).toBe("en");
  });

  it("uses query param over accept-language", () => {
    expect(pickLocale("fr,en;q=0.8", "es")).toBe("es");
  });

  it("falls back to accept-language when no query param", () => {
    expect(pickLocale("es-MX,es;q=0.9,en;q=0.8", null)).toBe("es");
  });

  it("matches language subtag from accept-language", () => {
    expect(pickLocale("fr-CA,fr;q=0.9", null)).toBe("fr");
  });

  it("falls back to en for unsupported accept-language", () => {
    expect(pickLocale("ja,ko;q=0.9", null)).toBe("en");
  });

  it("ignores unsupported query param and tries accept-language", () => {
    expect(pickLocale("es,en", "xx")).toBe("es");
  });

  it("returns en when query param is unsupported and no valid accept-language", () => {
    expect(pickLocale("ja", "ru")).toBe("en");
  });

  it("handles zh from accept-language", () => {
    expect(pickLocale("zh-TW,zh;q=0.9", null)).toBe("zh");
  });
});
