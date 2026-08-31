// README screenshot capture.
//
// Usage: node scripts/shot-readme.mjs [baseUrl]
//
// Produces the images the README embeds, from a REAL running app against a
// seeded database — not mockups. Re-run it after a UI change rather than
// letting the README drift into showing a product that no longer exists.
//
// Requires: a dev server (`pnpm dev`) and a seeded city (`pnpm db:seed`).
// Staff surfaces need demo mode ON, i.e. NEXT_PUBLIC_DEMO_MODE unset —
// persona sign-in is gated on it, so a `0` build has no way to log in and
// every staff shot comes back as a logged-out shell.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const CITY = process.env.SHOT_CITY ?? "cumming";
const OUT = "docs/images";
mkdirSync(OUT, { recursive: true });

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 402, height: 874 }; // iPhone 16 logical size

/**
 * Sign in through the demo persona form and land on the persona's home.
 *
 * Scoped to the form that owns the username field: /login renders the real
 * Supabase auth form alongside the persona form, and an unscoped
 * button[type=submit] resolves to the wrong one.
 */
async function signIn(page, username, password) {
  // A cold Next dev server compiles each route on first hit, and a heavy route
  // has been observed taking 90s. The default 30s navigation timeout fails the
  // whole run for a reason that is not a defect.
  page.setDefaultNavigationTimeout(180_000);
  page.setDefaultTimeout(180_000);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const form = page.locator('form:has(input[name="username"])');
  await form.locator('input[name="username"]').fill(username);
  await form.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
    form.locator('button[type="submit"]').first().click(),
  ]);
}

/**
 * Capture one surface. `settle` exists because MapLibre loads tiles async and
 * capturing early yields a blank white frame — which would look like a broken
 * map in the README rather than a screenshot taken too soon.
 */
async function shot(page, path, name, { settle = 2500, full = false } = {}) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  // Park the pointer off every interactive surface: the cursor rests at 0,0
  // otherwise, and a hovercard opened there lands in the README covering the
  // tile behind it.
  await page.mouse.move(2, 2);
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log(`  ${name}.png  <-  ${path}`);
}

/**
 * Force the app's own theme before first paint.
 *
 * The README serves light and dark variants of the staff screenshots through
 * <picture>, so a reader on GitHub's dark theme does not get a page of glaring
 * white rectangles. Setting the key in an init script rather than clicking the
 * toggle avoids capturing the flash between default and chosen theme.
 */
async function forceTheme(page, theme) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("civic.theme", t);
    } catch {}
  }, theme);
}

const browser = await chromium.launch();

// -- Staff surfaces, both themes -------------------------------------------
for (const theme of ["light", "dark"]) {
  const suffix = theme === "dark" ? "-dark" : "";
  const ctx = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  const page = await ctx.newPage();
  await forceTheme(page, theme);
  await signIn(page, "admintest", "admintest");
  console.log(`staff (${theme}):`);
  await shot(page, `/city/${CITY}`, `dashboard${suffix}`, { settle: 3500 });
  await shot(page, `/city/${CITY}/routing`, `routing${suffix}`, {
    settle: 3500,
  });
  await shot(page, `/city/${CITY}/analytics`, `analytics${suffix}`, {
    settle: 3500,
  });
  await shot(page, `/city/${CITY}/grid`, `grid${suffix}`, { settle: 3500 });
  await shot(page, `/city/${CITY}/video`, `video${suffix}`, { settle: 3500 });
  await ctx.close();
}

// -- The map, at 1x --------------------------------------------------------
// Separate context purely to drop deviceScaleFactor: a retina MapLibre canvas
// encodes to ~5 MB of PNG, which is not a thing to put in a README.
{
  const ctx = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  await forceTheme(page, "dark");
  await signIn(page, "admintest", "admintest");
  console.log("map (1x):");
  await shot(page, `/city/${CITY}/map`, "map", { settle: 8000 });
  await ctx.close();

  // The basemap is mostly photography, which PNG stores terribly: the same
  // frame is over a megabyte as PNG and a fraction of that as JPEG with no
  // visible difference. The README references map.jpg.
  try {
    execFileSync(
      "ffmpeg",
      ["-y", "-i", `${OUT}/map.png`, "-q:v", "4", `${OUT}/map.jpg`],
      { stdio: "ignore" },
    );
    rmSync(`${OUT}/map.png`, { force: true });
    console.log("  map.jpg  (converted, map.png removed)");
  } catch {
    console.warn("  ffmpeg missing: map.png left, but the README wants map.jpg");
  }
}

// -- Resident surfaces, on a phone, both themes ----------------------------
for (const theme of ["light", "dark"]) {
  const suffix = theme === "dark" ? "-dark" : "";
  const ctx = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: theme,
  });
  const page = await ctx.newPage();
  await forceTheme(page, theme);
  console.log(`resident (phone, ${theme}):`);
  await shot(page, "/report", `report${suffix}`, { settle: 2500 });
  await ctx.close();
}

await browser.close();
console.log("\ndone.");
