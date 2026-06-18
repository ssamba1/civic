// Theme-aware vision-check screenshot.
// Usage: node scripts/shot-theme.mjs <url> <outPath> <light|dark> [waitMs]
// Forces the theme BEFORE first paint via addInitScript (sets the same
// localStorage key the no-flash init script reads), so we capture the real
// themed render — not the default-dark frame or a post-load flash.
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3100/city/cumming";
const out = process.argv[3] ?? "scripts/shots/theme.png";
const theme = process.argv[4] === "light" ? "light" : "dark";
const settle = Number.parseInt(process.argv[5] ?? "2500", 10);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
page.on("console", (m) => {
  if (m.type() === "error") console.log("PAGE_ERROR:", m.text());
});
page.on("pageerror", (e) => console.log("PAGE_EXCEPTION:", e.message));

// Seed the preference before any document script runs.
await page.addInitScript((t) => {
  try {
    localStorage.setItem("civic.theme", t);
  } catch {}
}, theme);

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(settle);

// Report what the DOM actually resolved to, so the capture is self-verifying.
const isDark = await page.evaluate(() =>
  document.documentElement.classList.contains("dark"),
);
await page.screenshot({ path: out });
console.log(`SHOT_OK theme=${theme} htmlDark=${isDark} -> ${out}`);
await browser.close();
