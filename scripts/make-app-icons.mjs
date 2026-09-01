// Generate the PWA icons the manifest declares.
//
// Usage: node scripts/make-app-icons.mjs
//
// public/manifest.json has always declared /icons/icon-192.png and
// /icons/icon-512.png. public/icons/ did not exist, so both 404'd and every
// "Add to Home Screen" on a phone got the browser's default glyph — on a
// product whose whole resident flow is a phone.
//
// Rendered rather than hand-drawn so the mark stays in step with the app: the
// wordmark's filled dot, the brand's near-black ground, and the manifest's own
// theme_color. Maskable-safe: the mark sits inside the 80% safe area, so a
// launcher that crops to a circle or squircle never clips it.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "public/icons";
mkdirSync(OUT, { recursive: true });

// Matches manifest.json theme_color and the wordmark in the app header.
const INK = "#0f172a";
const MARK = "#f7f7f8";
const ACCENT = "#5082f4";

/** One icon at `size`, drawn in a viewBox so it scales exactly. */
const page = (size) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent}
  svg{display:block}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${INK}"/>
  <!-- Safe area is the middle 80%; everything below stays inside r=205 of centre. -->
  <!-- The map pin: what a resident drops on a problem. -->
  <path d="M256 118c-59 0-107 47-107 105 0 74 92 156 103 165a6 6 0 0 0 8 0c11-9 103-91 103-165 0-58-48-105-107-105z"
        fill="none" stroke="${MARK}" stroke-width="26" stroke-linejoin="round"/>
  <!-- The filled dot from the "● Civic" wordmark, sitting in the pin's head. -->
  <circle cx="256" cy="223" r="42" fill="${ACCENT}"/>
</svg>
</body></html>`;

const browser = await chromium.launch();
for (const size of [192, 512]) {
  const p = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await p.setContent(page(size), { waitUntil: "load" });
  await p.locator("svg").screenshot({
    path: `${OUT}/icon-${size}.png`,
    omitBackground: true,
  });
  await p.close();
  console.log(`${OUT}/icon-${size}.png`);
}
await browser.close();
