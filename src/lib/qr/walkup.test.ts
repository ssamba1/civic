// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("buildWalkupUrl", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://civic.example/");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("encodes lat/lng at ~1m precision and appends asset", async () => {
    const { buildWalkupUrl } = await import("./walkup");
    const url = buildWalkupUrl({
      lat: 34.207123,
      lng: -84.14056,
      asset: "bus-stop-42",
    });
    expect(url).toBe(
      "https://civic.example/report?lat=34.20712&lng=-84.14056&asset=bus-stop-42",
    );
  });

  it("omits asset when blank and trims the trailing slash on the base", async () => {
    const { buildWalkupUrl } = await import("./walkup");
    const url = buildWalkupUrl({ lat: 1, lng: 2, asset: "  " });
    expect(url).toBe("https://civic.example/report?lat=1.00000&lng=2.00000");
  });
});
