import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getServerEnv memoizes on first success, so each case resets the module
// registry (vi.resetModules) and re-imports to get a fresh, uncached instance.

const REQUIRED = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "svc-role-key",
  GEMINI_API_KEY: "gemini-key",
};

describe("server env — production rate-limit guard", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    for (const [k, v] of Object.entries(REQUIRED)) process.env[k] = v;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...original };
  });

  it("rejects production without RATE_LIMIT_TRUSTED_HEADER", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.RATE_LIMIT_TRUSTED_HEADER;
    const { getServerEnv } = await import("./env");
    expect(() => getServerEnv()).toThrow(/RATE_LIMIT_TRUSTED_HEADER/);
  });

  it("accepts production with a trusted header set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.RATE_LIMIT_TRUSTED_HEADER = "x-real-ip";
    const { getServerEnv } = await import("./env");
    expect(getServerEnv().RATE_LIMIT_TRUSTED_HEADER).toBe("x-real-ip");
  });

  it("does not require the header outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.RATE_LIMIT_TRUSTED_HEADER;
    const { getServerEnv } = await import("./env");
    expect(() => getServerEnv()).not.toThrow();
  });
});
