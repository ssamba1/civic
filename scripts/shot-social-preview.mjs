// Repository social-preview card.
//
// Usage: node scripts/shot-social-preview.mjs
//
// GitHub generates a generic card when a repo link is pasted into Slack,
// Discord or a submission form, and a generic card is a wasted first
// impression on the one surface that reaches people who have not opened the
// repo yet.
//
// Renders docs/images/social-preview.png at 1280x640 (GitHub's card size), 2x,
// in the product's own dark palette. Generated rather than drawn by hand so
// the numbers on it can be corrected in a diff instead of in an image editor.
//
// It cannot be applied from the command line. GitHub exposes social preview
// only through Settings > General > Social preview > Upload an image.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "docs/images";
mkdirSync(OUT, { recursive: true });

// Four numbers chosen to argue rather than decorate. The zero is the one that
// explains why the product exists: nothing waits on a person to read a form
// and decide where it goes.
const STATS = [
  ["11", "municipal divisions"],
  ["12", "city-extensible categories"],
  ["0", "manual triage steps"],
  ["1,429", "tests passing"],
];

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1280px; height:640px; display:flex; flex-direction:column;
    justify-content:space-between; padding:72px 80px;
    background:
      radial-gradient(900px 460px at 82% 12%, rgba(80,130,244,.16), transparent 62%),
      radial-gradient(760px 420px at 12% 92%, rgba(43,160,110,.13), transparent 60%),
      #0c0d10;
    color:#f2f3f5;
    font-family:Inter, -apple-system, "Segoe UI", system-ui, sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .rule { position:absolute; left:0; right:0; top:0; height:4px;
    background:linear-gradient(90deg,#e35044,#a48525,#2ba06e,#5082f4,#9c68e6); }
  .brand { display:flex; align-items:center; gap:14px; font-size:26px; font-weight:600; letter-spacing:-.01em; }
  .dot { width:13px; height:13px; border-radius:50%; background:#f2f3f5; }
  h1 { font-size:70px; line-height:1.06; font-weight:700; letter-spacing:-.033em; max-width:20ch; }
  h1 em { font-style:normal; color:#7ea2f7; }
  .sub { margin-top:22px; font-size:26px; line-height:1.45; color:#a2a7b0; max-width:44ch; font-weight:400; }
  .stats { display:flex; gap:44px; align-items:flex-start; }
  .stat .n { font-size:44px; font-weight:700; letter-spacing:-.02em; line-height:1; }
  .stat .l { margin-top:9px; font-size:15px; color:#8d939d; letter-spacing:.005em; white-space:nowrap; }
  .stat.zero .n { color:#2ba06e; }
  .foot { display:flex; justify-content:space-between; align-items:flex-end; gap:40px; }
  .tag { font-size:15px; color:#8d939d; text-align:right; line-height:1.7; white-space:nowrap; }
  .tag b { color:#c9ced6; font-weight:500; }
</style></head>
<body>
  <div class="rule"></div>
  <div>
    <div class="brand"><span class="dot"></span> Civic</div>
    <h1 style="margin-top:38px">A resident photographs it.<br><em>The work order writes itself.</em></h1>
    <div class="sub">AI-native citizen repair reporting. Photo to classified, costed,
      crew-assigned work order in one pass &mdash; no staff triage in the middle.</div>
  </div>
  <div class="foot">
    <div class="stats">
      ${STATS.map(
        ([n, l], i) =>
          `<div class="stat${n === "0" ? " zero" : ""}"><div class="n">${n}</div><div class="l">${l}</div></div>`,
      ).join("")}
    </div>
    <div class="tag"><b>Open311 GeoReport v2</b><br>Next.js 16 &middot; Supabase + PostGIS &middot; Gemini 2.5 Flash-Lite</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 640 },
  deviceScaleFactor: 2,
});
await page.setContent(html, { waitUntil: "networkidle" });
// Give the webfont a moment; a card captured mid-swap ships in the fallback.
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/social-preview.png` });
await browser.close();
console.log(`${OUT}/social-preview.png  (1280x640 @2x)`);
