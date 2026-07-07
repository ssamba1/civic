// The repo ships the `playwright` package (not `@playwright/test`); its
// `playwright/test` entry re-exports the test runner.
import { defineConfig, devices } from "playwright/test";

/**
 * E2E smoke config (pnpm test:e2e). Boots the dev server unless one is
 * already running on 3000 (reuseExistingServer) so the suite works both
 * locally-iterating and cold in CI. Specs live in e2e/ — vitest owns
 * src/**\/*.test.ts and never picks these up (and vice versa).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
