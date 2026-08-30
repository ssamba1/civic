#!/usr/bin/env node
/**
 * One command to make a fresh deployment look like the demo.
 *
 * The seed had grown to a dozen scripts that had to be run by hand in an
 * order nobody had written down, and a partial run fails quietly rather than
 * loudly: no `cities` row and the resident submit dead-ends on "No city
 * configured"; no crews and nine of the demo logins silently fall back to a
 * generic portal; no video seeds and the clip theater renders all zeros, which
 * looks worse than a 404.
 *
 * Every step is idempotent, so re-running is safe and is the intended way to
 * top up a database that drifted. Steps are ordered by dependency: the city and
 * its reports exist before anything that references them.
 *
 * Usage:
 *   pnpm demo:seed              run every step
 *   pnpm demo:seed --only=video run one step (repeatable: --only=a --only=b)
 *   pnpm demo:seed --list       show the steps and exit
 *   pnpm demo:seed --continue   keep going after a failing step
 *
 * Requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

/** Load .env.local so child processes inherit the credentials. */
function loadEnv() {
  const p = resolve(ROOT, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

/**
 * `required: false` marks a step whose absence degrades the demo but does not
 * break it — a missing contractor costs you one screen, a missing city costs
 * you the whole thing.
 */
const STEPS = [
  {
    key: "core",
    label: "City, staff users, reports, work orders",
    cmd: ["pnpm", ["exec", "tsx", "supabase/seed/index.ts"]],
    required: true,
  },
  {
    key: "crews",
    label: "Crew units (the 9 crew-portal logins resolve to these)",
    cmd: ["node", ["supabase/seed/demo-crews.mjs"]],
    required: true,
  },
  {
    key: "documents",
    label: "City documents corpus (powers the RAG console)",
    cmd: ["node", ["scripts/seed-city-documents.mjs"]],
    required: false,
  },
  {
    key: "contractor",
    label: "Northside Paving contractor, contract docs, warranty",
    cmd: ["node", ["scripts/seed-demo-contractor.mjs"]],
    required: false,
  },
  {
    key: "video",
    label: "Video clip row",
    cmd: ["node", ["scripts/seed-demo-video.mjs"]],
    required: false,
  },
  {
    key: "video-clusters",
    label: "Video detection clusters",
    cmd: ["node", ["scripts/seed-demo-video-clusters.mjs"]],
    required: false,
  },
  {
    key: "video-reports",
    label: "Reports generated from video clusters",
    cmd: ["node", ["scripts/seed-demo-video-reports.mjs"]],
    required: false,
  },
  {
    key: "redate",
    label: "Re-date the corpus to now (seeded timestamps drift)",
    cmd: ["node", ["scripts/redate-demo-corpus.mjs"]],
    required: false,
  },
];

const argv = process.argv.slice(2);
const only = argv
  .filter((a) => a.startsWith("--only="))
  .map((a) => a.slice("--only=".length));
const keepGoing = argv.includes("--continue");

if (argv.includes("--list")) {
  console.log("Steps (in order):\n");
  for (const s of STEPS) {
    console.log(
      `  ${s.key.padEnd(16)} ${s.required ? "required" : "optional"}  ${s.label}`,
    );
  }
  process.exit(0);
}

loadEnv();

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing credentials. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and\n" +
      "SUPABASE_SERVICE_ROLE_KEY in .env.local before seeding.",
  );
  process.exit(1);
}

const selected = only.length ? STEPS.filter((s) => only.includes(s.key)) : STEPS;
if (only.length && selected.length !== only.length) {
  const known = STEPS.map((s) => s.key).join(", ");
  console.error(`Unknown --only step. Available: ${known}`);
  process.exit(1);
}

console.log(`Seeding demo data against ${url}\n`);

const results = [];
for (const [i, step] of selected.entries()) {
  const n = `[${i + 1}/${selected.length}]`;
  console.log(`${n} ${step.label} …`);
  const [bin, args] = step.cmd;
  const r = spawnSync(bin, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  const ok = r.status === 0;
  results.push({ ...step, ok });
  if (ok) {
    console.log(`${n} ok\n`);
    continue;
  }
  console.error(`${n} FAILED (exit ${r.status})\n`);
  if (step.required && !keepGoing) {
    console.error(
      `Stopping: "${step.key}" is required and everything after it depends on it.\n` +
        "Fix the error above, then re-run — every step is idempotent.\n" +
        "Pass --continue to push past failures anyway.",
    );
    process.exit(1);
  }
}

const failed = results.filter((r) => !r.ok);
console.log("─".repeat(60));
for (const r of results) {
  console.log(`  ${r.ok ? "ok  " : "FAIL"}  ${r.key.padEnd(16)} ${r.label}`);
}
if (failed.length) {
  console.log(
    `\n${failed.length} step(s) failed. The demo will render, but the surfaces ` +
      "they feed will be empty.",
  );
  process.exit(1);
}
console.log("\nAll steps completed. Demo data is ready.");
