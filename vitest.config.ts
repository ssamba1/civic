import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    // Both globs take {ts,tsx}. The tests/ half used to be `.test.ts` only,
    // which meant a `.tsx` test filed under tests/ was never collected — no
    // error, no "0 tests" line, just a file that silently does not run. The
    // asymmetry was invisible because tests/ happens to hold only .ts today
    // (RLS suites are database assertions with no JSX), so nothing had tripped
    // it yet; tests/README.md already flagged it as a known footgun rather
    // than a deliberate rule. A collection glob that quietly drops files is
    // exactly the "returns nothing" failure mode this repo distrusts.
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    globals: true,
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The Next.js "server-only" marker package isn't resolvable in the node
      // test env; stub it so server modules can be unit-tested directly.
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
