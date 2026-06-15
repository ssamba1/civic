import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.TEMP + "\\civic-inspect";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(6000);

const H = await page.evaluate(() => document.documentElement.scrollHeight);
console.log("docHeight:", H, "errors:", JSON.stringify(errors.slice(0, 5)));
const steps = Math.min(Math.ceil(H / 900), 10);
for (let i = 0; i < steps; i++) {
  await page.evaluate((y) => window.scrollTo(0, y), i * 900);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}\\scroll-${String(i).padStart(2, "0")}.png` });
}
await browser.close();
console.log("shots:", OUT, "steps:", steps);
