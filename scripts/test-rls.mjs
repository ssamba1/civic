// Cross-platform runner for the opt-in RLS integration tests.
// Sets RUN_RLS_TESTS=1 (so tests/rls/* leaves skip mode) and forwards any extra
// args to vitest. Dep-free — avoids needing cross-env for Windows/posix parity.
//
//   node scripts/test-rls.mjs                 # run RLS suite
//   CHECK_MIGRATION_012=1 node scripts/test-rls.mjs  # also assert 012 applied
import { spawn } from "node:child_process";
import { join } from "node:path";

// Resolve the locally-installed vitest binary (not on PATH).
const bin = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.CMD" : "vitest",
);
const child = spawn(bin, ["run", "tests/rls", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, RUN_RLS_TESTS: "1" },
  cwd: process.cwd(),
});
child.on("exit", (code) => process.exit(code ?? 1));
