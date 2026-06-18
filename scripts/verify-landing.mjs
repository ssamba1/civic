import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "C:\\tmp\\landing-verify";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const failed = [];
page.on("requestfailed", (r) => {
  if (/landing-shots/.test(r.url())) failed.push(r.url());
});
const statuses = {};
page.on("response", (r) => {
  if (/landing-shots/.test(r.url()))
    statuses[r.url().split("/").pop()] = r.status();
});

await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

// S2 constellation (webp shots) and S3 cohort card (text change)
for (const id of ["how", "why-join"]) {
  const el = await page.$(`#${id}`);
  if (el) {
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    await el.screenshot({ path: `${OUT}\\section-${id}.png` });
  }
}

console.log("landing-shots responses:", JSON.stringify(statuses, null, 1));
console.log("FAILED landing-shots requests:", failed);
await browser.close();
