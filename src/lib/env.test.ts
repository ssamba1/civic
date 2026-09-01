import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getServerEnv memoizes on first success, so each case resets the module
// registry (vi.resetModules) and re-imports to get a fresh, uncached instance.

const REQUIRED = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "svc-role-key",
  GEMINI_API_KEY: "gemini-key",
};

/** Both production-only guards must be satisfied to reach a successful parse. */
const PROD_SECRETS = {
  RATE_LIMIT_TRUSTED_HEADER: "x-real-ip",
  PUBLIC_TOKEN_SALT: "test-salt",
};

describe("server env, production rate-limit guard", () => {
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
    for (const [k, v] of Object.entries(PROD_SECRETS)) process.env[k] = v;
    const { getServerEnv } = await import("./env");
    expect(getServerEnv().RATE_LIMIT_TRUSTED_HEADER).toBe("x-real-ip");
  });

  // Report ids are published through the Open311 API, so a default salt makes
  // sha256(salt:reportId) (every resident's status URL) computable by anyone.
  it("rejects production without PUBLIC_TOKEN_SALT", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.RATE_LIMIT_TRUSTED_HEADER = "x-real-ip";
    delete process.env.PUBLIC_TOKEN_SALT;
    const { getServerEnv } = await import("./env");
    expect(() => getServerEnv()).toThrow(/PUBLIC_TOKEN_SALT/);
  });

  it("does not require the salt outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.PUBLIC_TOKEN_SALT;
    const { getServerEnv } = await import("./env");
    expect(() => getServerEnv()).not.toThrow();
  });

  it("does not require the header outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.RATE_LIMIT_TRUSTED_HEADER;
    const { getServerEnv } = await import("./env");
    expect(() => getServerEnv()).not.toThrow();
  });
});
