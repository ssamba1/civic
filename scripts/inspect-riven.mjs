import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.TEMP + "\\riven-inspect";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("https://riven-research.vercel.app", { waitUntil: "networkidle" });
await page.waitForTimeout(6000);

const info = await page.evaluate(() => {
  const root = document.querySelector("#root") ?? document.body;
  const topLevel = [...root.querySelectorAll(":scope > div, :scope > main, :scope > section")]
    .slice(0, 5)
    .map((el) => el.className);
  const sections = [...document.querySelectorAll("section, footer, header, nav")].map((el) => ({
    tag: el.tagName,
    cls: String(el.className).slice(0, 120),
    h: Math.round(el.getBoundingClientRect().height),
  }));
  const h1 = document.querySelector("h1");
  const big = [...document.querySelectorAll("*")]
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) > 100)
    .map((el) => ({
      cls: String(el.className).slice(0, 80),
      font: getComputedStyle(el).fontFamily.slice(0, 60),
      size: getComputedStyle(el).fontSize,
      text: (el.textContent || "").trim().slice(0, 30),
    }));
  const canvases = [...document.querySelectorAll("canvas")].map((c) => ({
    w: c.width,
    h: c.height,
    cls: String(c.className).slice(0, 80),
    parentCls: String(c.parentElement?.className ?? "").slice(0, 80),
  }));
  return {
    title: document.title,
    bodyClass: document.body.className,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyFont: getComputedStyle(document.body).fontFamily.slice(0, 80),
    docHeight: document.documentElement.scrollHeight,
    topLevel,
    sections,
    h1: h1 ? { text: h1.textContent?.trim().slice(0, 80), font: getComputedStyle(h1).fontFamily.slice(0, 60), size: getComputedStyle(h1).fontSize } : null,
    big,
    canvases,
  };
});
console.log(JSON.stringify(info, null, 1));

const H = info.docHeight;
const steps = Math.min(Math.ceil(H / 900), 10);
for (let i = 0; i < steps; i++) {
  await page.evaluate((y) => window.scrollTo(0, y), i * 900);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}\\scroll-${String(i).padStart(2, "0")}.png` });
}
await browser.close();
console.log("shots:", OUT, "steps:", steps);
