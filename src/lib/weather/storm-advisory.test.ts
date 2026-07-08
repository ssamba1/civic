// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// Stub out network + db dependencies before importing storm-advisory
vi.mock("./nws-client", () => ({
  fetchRecentAlerts: vi.fn(),
}));

vi.mock("./baseline", () => ({
  getCategoryDailyBaseline: vi.fn(),
}));

import { fetchRecentAlerts } from "./nws-client";
import { getCategoryDailyBaseline } from "./baseline";
import { buildStormAdvisory } from "./storm-advisory";
import type { NwsAlert } from "./nws-client";
import { FORECAST_WINDOW_HOURS } from "./storm-config";

function makeAlert(event: string, overrides: Partial<NwsAlert> = {}): NwsAlert {
  return {
    id: `alert-${event}`,
    event,
    headline: `${event} in effect`,
    severity: "Severe",
    areaDesc: "Test County",
    effective: new Date().toISOString(),
    expires: new Date(Date.now() + 3_600_000).toISOString(),
    status: "active",
    ...overrides,
  };
}

describe("buildStormAdvisory", () => {
  it("returns no-storm advisory when alerts array is empty", async () => {
    vi.mocked(fetchRecentAlerts).mockResolvedValue([]);
    vi.mocked(getCategoryDailyBaseline).mockResolvedValue({});

    const result = await buildStormAdvisory();
    expect(result.hasActiveOrRecentStorm).toBe(false);
    expect(result.alerts).toHaveLength(0);
    expect(result.headlineAlert).toBeNull();
    expect(result.overallMultiplier).toBe(1);
    expect(result.categoryBreakdown).toHaveLength(0);
    expect(result.forecastWindowHours).toBe(FORECAST_WINDOW_HOURS);
    expect(result.generatedAt).toBeTruthy();
  });

  it("sets hasActiveOrRecentStorm=true when alerts match a profile", async () => {
    vi.mocked(fetchRecentAlerts).mockResolvedValue([
      makeAlert("Tornado Warning"),
    ]);
    vi.mocked(getCategoryDailyBaseline).mockResolvedValue({ tree_down: 2 });

    const result = await buildStormAdvisory();
    expect(result.hasActiveOrRecentStorm).toBe(true);
    expect(result.overallMultiplier).toBe(6);
  });

  it("picks the highest-tier alert as the headline", async () => {
    const wind = makeAlert("Wind Advisory");
    const tornado = makeAlert("Tornado Warning");
    vi.mocked(fetchRecentAlerts).mockResolvedValue([wind, tornado]);
    vi.mocked(getCategoryDailyBaseline).mockResolvedValue({});

    const result = await buildStormAdvisory();
    expect(result.headlineAlert).toBe(tornado);
  });

  it("takes the max multiplier per category across multiple alerts", async () => {
    // Both affect tree_down: wind (×2) and tornado (×6). Expected: 6
    const wind = makeAlert("High Wind Warning");
    const tornado = makeAlert("Tornado Warning");
    vi.mocked(fetchRecentAlerts).mockResolvedValue([wind, tornado]);
    vi.mocked(getCategoryDailyBaseline).mockResolvedValue({ tree_down: 10 });

    const result = await buildStormAdvisory();
    const treeDown = result.categoryBreakdown.find(
      (c) => c.category === "tree_down",
    );
    expect(treeDown).toBeDefined();
    expect(treeDown!.multiplier).toBe(6);
  });

  it("computes predictedCount correctly from baseline", async () => {
    // drainage daily avg = 5, flash flood multiplier = 4, window = 48h = 2 days
    // expected = round(5 * 4 * 2) = 40
    vi.mocked(fetchRecentAlerts).mockResolvedValue([
      makeAlert("Flash Flood Warning"),
    ]);
    vi.mocked(getCategoryDailyBaseline).mockResolvedValue({ drainage: 5 });

    const result = await buildStormAdvisory();
    const drainage = result.categoryBreakdown.find(
      (c) => c.category === "drainage",
    );
    expect(drainage).toBeDefined();
    expect(drainage!.predictedCount).toBe(
      Math.round(5 * 4 * (FORECAST_WINDOW_HOURS / 24)),
    );
  });

  it("sets predictedCount to null when baselineDailyAvg is 0", async () => {
    vi.mocked(fetchRecentAlerts).mockResolvedValue([
      makeAlert("Flash Flood Warning"),
    ]);
    vi.mocked(getCategoryDailyBaseline).mockResolvedValue({});

    const result = await buildStormAdvisory();
    const drainage = result.categoryBreakdown.find(
      (c) => c.category === "drainage",
    );
    expect(drainage).toBeDefined();
    expect(drainage!.predictedCount).toBeNull();
  });

  it("skips alerts with no matching profile", async () => {
    vi.mocked(fetchRecentAlerts).mockResolvedValue([
      makeAlert("Heat Advisory"),
    ]);
    vi.mocked(getCategoryDailyBaseline).mockResolvedValue({});

    const result = await buildStormAdvisory();
    expect(result.hasActiveOrRecentStorm).toBe(false);
    expect(result.overallMultiplier).toBe(1);
  });

  it("sorts categoryBreakdown descending by predictedCount", async () => {
    vi.mocked(fetchRecentAlerts).mockResolvedValue([
      makeAlert("Flash Flood Warning"),
    ]);
    vi.mocked(getCategoryDailyBaseline).mockResolvedValue({
      drainage: 10,
      water_leak: 2,
      sidewalk_damage: 5,
      pothole: 1,
    });

    const result = await buildStormAdvisory();
    const counts = result.categoryBreakdown.map((c) => c.predictedCount ?? 0);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]);
    }
  });
});
