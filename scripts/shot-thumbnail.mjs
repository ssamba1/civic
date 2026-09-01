// Submission thumbnail, 3:2.
//
// Usage: node scripts/shot-thumbnail.mjs
//
// Produces docs/images/thumbnail.png at 1500x1000 (3:2), 2x. Separate from
// scripts/shot-social-preview.mjs, which is 1280x640 (2:1) for GitHub's Open
// Graph slot — the two crops are different enough that one image cannot serve
// both without something important being cut off.
//
// Composed to survive a gallery. A submission thumbnail is first seen a few
// hundred pixels wide next to a hundred others, so this is built to be legible
// at that size: one statement, one accent, four numbers, and nothing that turns
// to mush when it is scaled down. The product screenshots do that job in the
// README, where they are seen full width.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "docs/images";
mkdirSync(OUT, { recursive: true });

// Four numbers chosen to argue rather than decorate. The zero is the one that
// explains why the product exists: nothing waits on a person to read a form.
const STATS = [
  ["11", "municipal divisions"],
  ["12", "city-extensible categories"],
  ["0", "manual triage steps"],
  ["1,436", "tests passing"],
];

// The category ramp from src/app/globals.css — the same hues the product uses
// to colour reports on the map.
const RAMP = ["#e35044", "#a48525", "#2ba06e", "#5082f4", "#9c68e6", "#d052a8"];

// The pipeline, in the order it actually runs. Shown because a thumbnail that
// only asserts "the work order writes itself" is a claim; showing the four
// stages is the mechanism, and it fills the middle band that 3:2 opens up.
const STAGES = [
  ["Photo", "#e35044"],
  ["AI classify", "#5082f4"],
  ["Costed work order", "#2ba06e"],
  ["Crew dispatched", "#9c68e6"],
];

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    width:1500px;height:1000px;position:relative;overflow:hidden;
    display:flex;flex-direction:column;justify-content:space-between;
    padding:76px 88px 72px;
    background:
      radial-gradient(1100px 600px at 84% 8%, rgba(80,130,244,.18), transparent 62%),
      radial-gradient(900px 520px at 6% 96%, rgba(43,160,110,.14), transparent 62%),
      #0c0d10;
    color:#f2f3f5;
    font-family:Inter,-apple-system,"Segoe UI",system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .ramp{position:absolute;left:0;right:0;top:0;height:6px;display:flex}
  .ramp span{flex:1}
  .head{display:flex;align-items:center;justify-content:space-between;gap:40px}
  .brand{display:flex;align-items:center;gap:17px;font-size:33px;font-weight:600;letter-spacing:-.01em}
  .dot{width:16px;height:16px;border-radius:50%;background:#f2f3f5}
  .spec{font-size:21px;color:#c9ced6;font-weight:500;white-space:nowrap}
  h1{margin-top:58px;font-size:82px;line-height:1.08;font-weight:700;letter-spacing:-.034em}
  h1 em{font-style:normal;color:#7ea2f7}
  .sub{margin-top:30px;font-size:30px;line-height:1.45;color:#a2a7b0;white-space:nowrap;font-weight:400}
  .flow{display:flex;align-items:center;gap:22px}
  .stage{display:flex;align-items:center;gap:14px;
    border:1px solid rgba(255,255,255,.11);border-radius:999px;
    padding:15px 26px;background:rgba(255,255,255,.035);
    font-size:24px;font-weight:500;color:#dfe3e8;white-space:nowrap}
  .stage i{width:11px;height:11px;border-radius:50%;display:block}
  .arrow{color:#5b616b;font-size:26px;line-height:1}
  .foot{display:flex;flex-direction:column;gap:26px}
  .stats{display:flex;gap:72px;align-items:flex-start}
  .n{font-size:58px;font-weight:700;letter-spacing:-.02em;line-height:1}
  .l{margin-top:11px;font-size:20px;color:#8d939d;white-space:nowrap}
  .zero .n{color:#2ba06e}
  .tag{font-size:20px;color:#7f858f;white-space:nowrap}
</style></head>
<body>
  <div class="ramp">${RAMP.map((c) => `<span style="background:${c}"></span>`).join("")}</div>

  <div>
    <div class="head">
      <div class="brand"><span class="dot"></span> Civic</div>
      <div class="spec">Open311 GeoReport v2</div>
    </div>
    <h1>A resident photographs it.<br><em>The work order writes itself.</em></h1>
    <div class="sub">AI-native citizen repair reporting &mdash; no staff triage
      in the middle.</div>
  </div>

  <div class="flow">
    ${STAGES.map(
      ([label, colour], i) =>
        `${i ? '<span class="arrow">&rarr;</span>' : ""}<div class="stage"><i style="background:${colour}"></i>${label}</div>`,
    ).join("")}
  </div>

  <div class="foot">
    <div class="stats">
      ${STATS.map(
        ([n, l]) =>
          `<div class="${n === "0" ? "zero" : ""}"><div class="n">${n}</div><div class="l">${l}</div></div>`,
      ).join("")}
    </div>
    <div class="tag">Next.js 16 &middot; Supabase + PostGIS &middot; Gemini 2.5 Flash-Lite</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1500, height: 1000 },
  deviceScaleFactor: 2,
});
await page.setContent(html, { waitUntil: "networkidle" });
// A card captured mid-swap ships in the fallback face.
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/thumbnail.png` });
await browser.close();
console.log(`${OUT}/thumbnail.png  (1500x1000, 3:2 @2x)`);
