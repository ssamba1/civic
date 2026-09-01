// Vision-check screenshot helper.
// Usage: node scripts/shot.mjs <url> <outPath> [waitMs]
// Waits for the MapLibre canvas + a settle delay so async tile loads finish
// before capture (capturing too early on a tile-loading map yields a blank
// white frame, which would falsely "confirm" the very bug we're checking).
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3000/";
const out = process.argv[3] ?? "scripts/shots/shot.png";
const settle = Number.parseInt(process.argv[4] ?? "5000", 10);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
// Surface page console errors so a blank render is diagnosable, not silent.
page.on("console", (m) => {
  if (m.type() === "error") console.log("PAGE_ERROR:", m.text());
});
page.on("pageerror", (e) => console.log("PAGE_EXCEPTION:", e.message));

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

// Wait for the GL canvas to exist, then prefer an explicit idle hook the
// backdrop exposes on window; fall back to a fixed settle for the baseline
// (which has no hook).
await page.waitForSelector("canvas.maplibregl-canvas", { timeout: 30000 }).catch(() => {});
const hadHook = await page
  .waitForFunction("window.__civicMapIdle === true", { timeout: 12000 })
  .then(() => true)
  .catch(() => false);
if (!hadHook) await page.waitForTimeout(settle);
else await page.waitForTimeout(800); // let pin/orbit settle one beat past idle

await page.screenshot({ path: out });
console.log(`SHOT_OK hook=${hadHook} -> ${out}`);
await browser.close();
