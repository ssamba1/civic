// Records the README's demo loop from the running app and encodes it to GIF.
//
// Usage: node scripts/shot-readme-gif.mjs [baseUrl]
//
// Produces docs/images/demo.gif: the routing page, easing from the live flow
// chart — resident reports fanning through the classifier into twelve
// categories, eleven divisions and their crews — down through the divisions to
// the crews that actually receive the work.
//
// That path is chosen because it is the product's whole argument in one motion.
// A still of this page shows a diagram; the motion shows that every node is
// carrying a real count from a real database.
//
// Requires a dev server, a seeded city, and demo mode ON so the staff persona
// can sign in. Requires ffmpeg on PATH for the encode.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const CITY = process.env.SHOT_CITY ?? "cumming";
const OUT = "docs/images";
const TMP = "docs/images/.video";
mkdirSync(OUT, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 780 },
  deviceScaleFactor: 1,
  recordVideo: { dir: TMP, size: { width: 1280, height: 780 } },
});
const page = await ctx.newPage();
// A cold Next dev server compiles each route on first hit; the default 30s
// navigation timeout fails the run for a reason that is not a defect.
page.setDefaultNavigationTimeout(180_000);
page.setDefaultTimeout(180_000);

// Sign in as staff. Scoped to the form owning the username field because
// /login also renders the real auth form; an unscoped submit hits the wrong one.
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
const form = page.locator('form:has(input[name="username"])');
await form.locator('input[name="username"]').fill("admintest");
await form.locator('input[name="password"]').fill("admintest");
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
  form.locator('button[type="submit"]').first().click(),
]);

// Warm the route before the recording matters: the first paint of the flow
// chart is a layout pass, and capturing it makes the GIF open on a jump.
await page.goto(`${BASE}/city/${CITY}/routing`, { waitUntil: "networkidle" });
await page.waitForTimeout(4000);
await page.mouse.move(2, 2); // park the pointer so no hovercard opens mid-take

// Ease down the page rather than jumping, so the GIF reads as a walkthrough
// instead of a cut. Small steps at ~30fps for the length of the scroll.
const total = await page.evaluate(() =>
  Math.max(0, document.body.scrollHeight - window.innerHeight),
);
const steps = 90;
for (let i = 0; i <= steps; i++) {
  const t = i / steps;
  const eased = t < 0.5 ? 2 * t * t : 1 - (1 - t) ** 2 / 2; // ease-in-out
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(eased * total));
  await page.waitForTimeout(33);
}
await page.waitForTimeout(2000); // hold at the bottom so the crews can be read

await ctx.close(); // flushes the video file
await browser.close();

const webm = readdirSync(TMP).find((f) => f.endsWith(".webm"));
if (!webm) throw new Error("playwright wrote no video");
const src = join(TMP, webm);

// Two-pass palette encode. A single-pass GIF of a page full of small text is
// unreadable; generating a palette first keeps the type crisp at a size GitHub
// will inline.
// SKIP drops the warm-up head: the run holds still for four seconds while the
// flow chart settles, and four seconds of a motionless page is a third of the
// file for none of the story. 64 colours rather than 256 because this page is
// flat UI fills plus text, which quantises well — the same frames are 10.4 MB
// at 900px/12fps/full palette and 3.3 MB here, with the type still legible.
const SKIP = "4.0";
const palette = join(TMP, "palette.png");
execFileSync(
  "ffmpeg",
  ["-y", "-ss", SKIP, "-i", src, "-vf",
   "fps=10,scale=720:-1:flags=lanczos,palettegen=max_colors=64:stats_mode=diff", palette],
  { stdio: "ignore" },
);
execFileSync(
  "ffmpeg",
  [
    "-y", "-ss", SKIP, "-i", src, "-i", palette,
    "-lavfi",
    "fps=10,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5",
    join(OUT, "demo.gif"),
  ],
  { stdio: "ignore" },
);

renameSync(src, join(TMP, "source.webm"));
console.log(`wrote ${OUT}/demo.gif`);
