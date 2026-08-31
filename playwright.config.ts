// The repo ships the `playwright` package (not `@playwright/test`); its
// `playwright/test` entry re-exports the test runner.
import { defineConfig, devices } from "playwright/test";

/**
 * E2E smoke config (pnpm test:e2e). Boots the dev server unless one is
 * already running on 3000 (reuseExistingServer) so the suite works both
 * locally-iterating and cold in CI. Specs live in e2e/ — vitest owns
 * src/**\/*.test.ts and never picks these up (and vice versa).
 */
// Port is env-driven because this checkout gets run side by side with forks of
// it. With 3000 hardcoded AND reuseExistingServer on, the suite silently
// ATTACHES to whatever dev server already holds that port — i.e. runs these
// specs against the other checkout and reports its results as ours. Set
// E2E_PORT to keep the two apart.
const PORT = process.env.E2E_PORT ?? "3000";
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
