// Capture the live civic-light hero map to a static plate the landing ships
// instead of rendering maplibre-gl + deck.gl (~1.85MB JS) on every visit.
//
// Run against a server that still mounts the LIVE map — i.e. with ?tweaks=1,
// which is the only path that mounts ZampMapBackdropLazy now (see ZampHero).
//
//   node scripts/capture-hero-map.mjs [baseUrl]
//   default baseUrl = http://localhost:3100
//
// Produces public/landing-shots/hero-map.jpg. We hide the scrim + attribution
// before the shot so the plate is the raw, filtered map: the scrim stays a live
// CSS overlay in <StaticHeroMap> (resolution-independent, seats the wordmark),
// and a static credit line replaces the baked-in attribution badge.
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3100";
// mapMarkers=0: shoot the bare basemap — the report field is DOM pins now
// (MapPinStory severity scatter), not pixels baked into the plate.
const url = `${base}/?tweaks=1&mapPreset=civic-light&mapMarkers=0`;
const out = "public/landing-shots/hero-map.jpg";

const browser = await chromium.launch();
const page = await browser.newPage({
  // 16:10 plate at ~2400px — sharp on HiDPI, still a few-hundred-KB JPEG. The
  // hero is full-bleed and the plate is object-fit:cover, so exact AR is moot.
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1.5,
});
page.on("console", (m) => {
  if (m.type() === "error") console.log("PAGE_ERROR:", m.text());
});
page.on("pageerror", (e) => console.log("PAGE_EXCEPTION:", e.message));

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

await page
  .waitForSelector("canvas.maplibregl-canvas", { timeout: 30000 })
  .catch(() => {});
const idle = await page
  .waitForFunction("window.__civicMapIdle === true", { timeout: 15000 })
  .then(() => true)
  .catch(() => false);
// One beat past idle so the final tiles fade in (fadeDuration 150) and the
// opening easeTo has fully settled at the base camera.
await page.waitForTimeout(idle ? 1200 : 6000);

// The backdrop is inset-0 full-bleed, so the wordmark, glass card, nav and
// tweaks panel all stack ON TOP of it — an element screenshot would clip to the
// map's box but still show everything above it. Isolate the map pixels instead:
// hide the whole page via `visibility`, re-show ONLY the map container's subtree
// (visibility inherits), then drop the scrim + attribution so the JPEG is the
// bare, filtered map. A plain viewport screenshot now captures just the plate.
const isolated = await page.evaluate(() => {
  const c = document.querySelector('[data-hero-bg="map"]');
  if (!(c instanceof HTMLElement)) return false;
  document.body.style.visibility = "hidden";
  c.style.visibility = "visible";
  // Scrim is the last child of the container — keep it out of the plate.
  if (c.lastElementChild instanceof HTMLElement)
    c.lastElementChild.style.visibility = "hidden";
  document
    .querySelectorAll(".maplibregl-ctrl, .maplibregl-control-container")
    .forEach((el) => {
      if (el instanceof HTMLElement) el.style.display = "none";
    });
  // The Next.js dev-tools indicator (the "N · 1 Issue" toast) renders in a
  // <nextjs-portal> mounted on <html>, outside <body>, so the visibility trick
  // above doesn't reach it. It's dev-only (absent in prod) — drop it so it
  // isn't baked into the plate. Also nuke any other non-body top-level node.
  document
    .querySelectorAll("nextjs-portal, [data-nextjs-toast], #__next-build-watcher")
    .forEach((el) => {
      if (el instanceof HTMLElement) el.style.display = "none";
    });
  for (const node of Array.from(document.documentElement.children)) {
    if (node !== document.body && node instanceof HTMLElement)
      node.style.visibility = "hidden";
  }
  return true;
});
if (!isolated) {
  console.log("CAPTURE_FAIL: no [data-hero-bg=map] — is ?tweaks=1 mounting the live map?");
  await browser.close();
  process.exit(1);
}
// Let the map repaint one frame after the attribution control is removed.
await page.waitForTimeout(250);
await page.screenshot({ path: out, type: "jpeg", quality: 88 });
console.log(`CAPTURE_OK idle=${idle} -> ${out}`);
await browser.close();
