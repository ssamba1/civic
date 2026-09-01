// Submission thumbnail, 3:2, high resolution.
//
// Usage:
//   node scripts/shot-thumbnail.mjs             # compose from the saved plate
//   node scripts/shot-thumbnail.mjs --capture   # re-shoot the plate (needs a dev server)
//
// Produces docs/images/thumbnail.jpg at 3600x2400 (3:2).
//
// The composition is the product, not a card about the product. The backdrop is
// a real capture of the landing page's live map — Cumming, the seeded reports
// as coloured pins, the "Fixed" markers, and the three callouts naming the
// actual pipeline stages — with the landing page's own wordmark and value card
// hidden so this can carry its own type instead.
//
// Light rather than dark on purpose: a gallery of hackathon thumbnails is
// almost entirely dark cards, and this product's own landing page is light.
//
// JPEG rather than PNG because the backdrop is a map, which PNG stores terribly:
// the plate alone is 5.2 MB as PNG. Type stays crisp at 3600px wide.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "docs/images";
const PLATE = `${OUT}/.map-plate.png`;
const BASE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3100";
mkdirSync(OUT, { recursive: true });

/** Re-shoot the map backdrop from the running app. */
async function capturePlate(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1800, height: 1200 },
    deviceScaleFactor: 2,
  });
  const p = await ctx.newPage();
  p.setDefaultNavigationTimeout(180_000);
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(9000); // MapLibre tiles + the pin animation settling
  // Hide the landing page's own furniture so only the map and its report pins
  // remain — this file supplies its own wordmark and headline.
  await p.evaluate(() => {
    const hide = (el) => {
      if (el?.style) el.style.visibility = "hidden";
    };
    for (const el of document.querySelectorAll("body *")) {
      const t = (el.textContent || "").trim();
      if (/^Civic$/.test(t) && el.getBoundingClientRect().height > 90) hide(el);
      if (t.startsWith("Turn a resident") && el.getBoundingClientRect().width > 300) hide(el);
      if (/^Report an issue/.test(t) && el.tagName === "A") hide(el);
    }
  });
  await p.mouse.move(2, 2);
  await p.waitForTimeout(1200);
  await p.screenshot({ path: PLATE });
  await ctx.close();
  console.log(`  plate captured: ${PLATE}`);
}

const browser = await chromium.launch();

if (process.argv.includes("--capture") || !existsSync(PLATE)) {
  await capturePlate(browser);
}
if (!existsSync(PLATE)) {
  console.error(`no backdrop at ${PLATE} — run with --capture and a dev server up`);
  process.exit(1);
}

const plate = `data:image/png;base64,${readFileSync(PLATE).toString("base64")}`;
const RAMP = ["#e35044", "#a48525", "#2ba06e", "#5082f4", "#9c68e6", "#d052a8"];

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1800px;height:1200px;position:relative;overflow:hidden;
    font-family:Inter,-apple-system,"Segoe UI",system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;background:#eef1f4}
  /* The plate is the same 3:2 as this canvas, so object-position would do
     nothing — cover fills it exactly. Scale and offset instead, to push the
     dense pin cluster to the right of the frame where the type is not. */
  /* The plate is the same 3:2 as this canvas, so object-position would do
     nothing — cover fills it exactly. Scale and offset instead, to bring the
     dense pin cluster into the band that stays visible. */
  .plate{position:absolute;width:165%;height:165%;left:-16%;top:-8%;
    object-fit:cover}
  /* A horizontal split, not a diagonal scrim. A diagonal left the headline
     running over live map pins, and type over a busy map is unreadable at any
     size. Map above, words below, with a short fade across the seam. */
  .fade{position:absolute;left:0;right:0;top:38%;height:16%;
    background:linear-gradient(180deg, rgba(247,249,251,0) 0%, rgba(247,249,251,1) 100%)}
  .band{position:absolute;left:0;right:0;bottom:0;height:46%;background:#f7f9fb}
  .ramp{position:absolute;left:0;right:0;top:0;height:9px;display:flex;z-index:3}
  .ramp span{flex:1}
  .wrap{position:absolute;left:96px;bottom:92px;z-index:2}
  .brand{display:flex;align-items:center;gap:19px;font-size:38px;font-weight:600;
    letter-spacing:-.012em;color:#0f172a}
  .dot{width:19px;height:19px;border-radius:50%;background:#0f172a}
  h1{margin-top:34px;font-size:96px;line-height:1.06;font-weight:700;
    letter-spacing:-.038em;color:#0f172a}
  h1 em{font-style:normal;color:#2f6ae0}
  .sub{margin-top:32px;font-size:31px;line-height:1.42;color:#48515f;font-weight:400}
</style></head>
<body>
  <img class="plate" src="${plate}">
  <div class="fade"></div>
  <div class="band"></div>
  <div class="ramp">${RAMP.map((c) => `<span style="background:${c}"></span>`).join("")}</div>
  <div class="wrap">
    <div class="brand"><span class="dot"></span> Civic</div>
    <h1>A resident photographs it.<br><em>The work order writes itself.</em></h1>
    <div class="sub">AI classifies the photo, prices the repair, routes it to a crew.<br>No staff triage in the middle.</div>
  </div>
</body></html>`;

const page = await browser.newPage({
  viewport: { width: 1800, height: 1200 },
  deviceScaleFactor: 2,
});
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/thumbnail.png` });
await browser.close();

// PNG -> JPEG: the backdrop is a map, and PNG stores that terribly.
try {
  execFileSync(
    "ffmpeg",
    ["-y", "-i", `${OUT}/thumbnail.png`, "-q:v", "2", `${OUT}/thumbnail.jpg`],
    { stdio: "ignore" },
  );
  rmSync(`${OUT}/thumbnail.png`, { force: true });
  console.log(`${OUT}/thumbnail.jpg  (3600x2400, 3:2)`);
} catch {
  console.warn("ffmpeg missing — left thumbnail.png in place");
}
