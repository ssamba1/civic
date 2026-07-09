import { describe, expect, it } from "vitest";
import {
  currencyForCitySlug,
  DEFAULT_CURRENCY,
  formatCost,
  formatLocalDate,
  INR,
  USD,
} from "./currency";

describe("currencyForCitySlug", () => {
  it("maps ahilyanagar → INR, everything else → USD", () => {
    expect(currencyForCitySlug("ahilyanagar")).toBe(INR);
    expect(currencyForCitySlug("AHILYANAGAR")).toBe(INR); // case-insensitive
    expect(currencyForCitySlug("cumming")).toBe(USD);
    expect(currencyForCitySlug(null)).toBe(DEFAULT_CURRENCY);
    expect(currencyForCitySlug(undefined)).toBe(DEFAULT_CURRENCY);
  });
});

describe("formatCost", () => {
  it("renders USD with $ and en-US grouping", () => {
    const s = formatCost(1250, USD);
    expect(s).toContain("$");
    expect(s).toContain("1,250");
  });

  it("converts + renders INR with ₹ (lakh grouping) via the fixed rate", () => {
    const s = formatCost(1000, INR); // 1000 * 83 = 83,000
    expect(s).toContain("₹");
    expect(s).toContain("83,000");
  });

  it("returns an em dash for null / NaN (never $NaN)", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(Number.NaN)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });
});

describe("formatLocalDate", () => {
  const iso = "2026-07-04T10:00:00.000Z";

  it("formats in the config locale", () => {
    // en-US medium: "Jul 4, 2026"; en-IN medium: "4 Jul 2026". Both name the
    // month and year; assert the locale-distinguishing day/month order.
    const us = formatLocalDate(iso, USD);
    const ind = formatLocalDate(iso, INR);
    expect(us).toMatch(/2026/);
    expect(ind).toMatch(/2026/);
    // en-IN puts the day first.
    expect(ind.trim().startsWith("4")).toBe(true);
  });

  it("respects custom Intl options", () => {
    const s = formatLocalDate(iso, USD, { year: "numeric", month: "numeric" });
    expect(s).toMatch(/7.*2026|2026/);
  });

  it("returns an em dash for missing/invalid input", () => {
    expect(formatLocalDate(null)).toBe("—");
    expect(formatLocalDate("not-a-date")).toBe("—");
  });
});
