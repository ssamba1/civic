// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BASELINE_LOOKBACK_DAYS,
  CITY_CENTER,
  FORECAST_WINDOW_HOURS,
  LOOKBACK_HOURS,
  NWS_TIMEOUT_MS,
  NWS_USER_AGENT,
  profileForEvent,
  STORM_PROFILES,
} from "./storm-config";

describe("storm-config constants", () => {
  it("CITY_CENTER has valid lat/lng for Cumming GA", () => {
    expect(CITY_CENTER.lat).toBeGreaterThan(33);
    expect(CITY_CENTER.lat).toBeLessThan(36);
    expect(CITY_CENTER.lng).toBeLessThan(-80);
    expect(CITY_CENTER.lng).toBeGreaterThan(-90);
  });

  it("NWS_USER_AGENT is a non-empty string", () => {
    expect(typeof NWS_USER_AGENT).toBe("string");
    expect(NWS_USER_AGENT.length).toBeGreaterThan(10);
  });

  it("NWS_TIMEOUT_MS is a positive number", () => {
    expect(NWS_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it("LOOKBACK_HOURS is a positive number", () => {
    expect(LOOKBACK_HOURS).toBeGreaterThan(0);
  });

  it("FORECAST_WINDOW_HOURS is a positive number", () => {
    expect(FORECAST_WINDOW_HOURS).toBeGreaterThan(0);
  });

  it("BASELINE_LOOKBACK_DAYS is a positive number", () => {
    expect(BASELINE_LOOKBACK_DAYS).toBeGreaterThan(0);
  });

  it("STORM_PROFILES is non-empty", () => {
    expect(STORM_PROFILES.length).toBeGreaterThan(0);
  });

  it("every STORM_PROFILE entry has valid shape", () => {
    for (const entry of STORM_PROFILES) {
      expect(entry.matches).toBeInstanceOf(RegExp);
      expect(entry.profile.multiplier).toBeGreaterThan(1);
      expect(Array.isArray(entry.profile.categories)).toBe(true);
      expect(entry.profile.categories.length).toBeGreaterThan(0);
      expect(typeof entry.profile.tier).toBe("number");
      expect(entry.profile.tier).toBeGreaterThan(0);
    }
  });

  it("tiers are unique across all profiles", () => {
    const tiers = STORM_PROFILES.map((e) => e.profile.tier);
    const unique = new Set(tiers);
    expect(unique.size).toBe(tiers.length);
  });
});

describe("profileForEvent", () => {
  it("returns null for an unknown event", () => {
    expect(profileForEvent("Heat Advisory")).toBeNull();
  });

  it("matches tornado warning (tier 100, multiplier 6)", () => {
    const p = profileForEvent("Tornado Warning");
    expect(p).not.toBeNull();
    expect(p?.tier).toBe(100);
    expect(p?.multiplier).toBe(6);
    expect(p?.categories).toContain("tree_down");
  });

  it("matches flash flood warning", () => {
    const p = profileForEvent("Flash Flood Warning");
    expect(p).not.toBeNull();
    expect(p?.tier).toBe(90);
    expect(p?.categories).toContain("drainage");
  });

  it("does NOT match plain flood warning against flash flood pattern", () => {
    const p = profileForEvent("Flood Warning");
    // should match the (?<!flash )flood warning profile (tier 65), not flash flood
    expect(p).not.toBeNull();
    expect(p?.tier).toBe(65);
  });

  it("matches severe thunderstorm warning (case insensitive)", () => {
    const p = profileForEvent("SEVERE THUNDERSTORM WARNING");
    expect(p).not.toBeNull();
    expect(p?.multiplier).toBe(3);
  });

  it("matches wind advisory", () => {
    const p = profileForEvent("Wind Advisory");
    expect(p).not.toBeNull();
    expect(p?.multiplier).toBe(1.3);
  });

  it("matches hurricane warning", () => {
    const p = profileForEvent("Hurricane Warning");
    expect(p).not.toBeNull();
    expect(p?.tier).toBe(95);
  });
});
