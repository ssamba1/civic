#!/usr/bin/env node
/**
 * Stages a `next build --output standalone` bundle so it can actually be run.
 *
 * Next writes `.next/standalone/server.js` with its node_modules traced in, but
 * deliberately does NOT copy two things into it:
 *   .next/static  — the hashed JS/CSS chunks every page requests
 *   public/       — icons, the manifest, the service worker, landing imagery,
 *                   and the Cesium runtime that scripts/copy-cesium-assets.mjs
 *                   generates
 * Without them `node .next/standalone/server.js` boots and serves HTML, and
 * every asset in that HTML 404s — an unstyled, non-interactive page rather than
 * an error anyone can act on. Copying them is documented as the caller's job.
 *
 * `.env.local` is carried across when present so a local `pnpm prod` runs
 * against the same configuration `pnpm dev` did.
 *
 * Node fs rather than a shell copy so this behaves identically on Windows,
 * macOS, Linux and CI — same reason as scripts/copy-cesium-assets.mjs.
 */
import { copyFileSync, cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error(
    "[standalone-assets] .next/standalone not found — run `next build` with " +
      "`output: \"standalone\"` first (see next.config.ts).",
  );
  process.exit(1);
}

cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), {
  recursive: true,
});
cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });

const envLocal = join(root, ".env.local");
if (existsSync(envLocal)) copyFileSync(envLocal, join(standalone, ".env.local"));

console.log(`[standalone-assets] staged static + public -> ${standalone}`);
