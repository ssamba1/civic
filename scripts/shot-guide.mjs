// Page-guide screenshot capture.
//
// Usage: node scripts/shot-guide.mjs [baseUrl]
//
// Produces the one image per GUIDES entry that the "What is this page?" modal
// shows above its copy. Same principle as shot-readme.mjs: real running app
// against a seeded database, so the guide cannot show a product that no longer
// exists. Re-run after a UI change.
//
// Requires: a dev server (`pnpm dev -p 5173`) with DEV_AUTH_BYPASS=1 so staff
// routes render without a sign-in round trip.
//
// Dark theme only. The modal renders the shot inside its own surface, so a
// light capture on a dark app (or the reverse) reads as a foreign object; one
// dark asset under a subtle border is the cheaper, better-looking answer than
// doubling 26 files for a theme the image is never seen alone in.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:5173";
const CITY = process.env.SHOT_CITY ?? "cumming";
const OUT = "public/guide";
mkdirSync(OUT, { recursive: true });

// 1280 at 1x. These ship in the bundle, one per route, so the budget is real:
// a retina capture of the same frame is ~4x the bytes for detail nobody reads
// inside a 640px-wide modal thumbnail.
const VIEWPORT = { width: 1280, height: 800 };
const MAX_BYTES = 200 * 1024;

/** Guide key -> asset basename. Keys carry slashes; files cannot. */
const fileFor = (key) => key.replaceAll("/", "-");

// A full sweep is a ~10 minute run against a dev server that has been observed
// wedging partway through. SHOT_ONLY=map,grid re-captures just those keys
// instead of paying for the whole set again.
const ONLY = process.env.SHOT_ONLY
  ? new Set(process.env.SHOT_ONLY.split(",").map((s) => s.trim()))
  : null;
const wanted = (key) => !ONLY || ONLY.has(key);

/**
 * Force dark before first paint. Setting the key in an init script rather than
 * clicking the toggle avoids capturing the flash between default and chosen
 * theme.
 */
async function forceDark(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("civic.theme", "dark");
    } catch {}
  });
}

/**
 * Re-encode anything over budget as a palette PNG, dropping the palette until
 * it fits. The guide paths are `.png` by contract, so this quantizes rather
 * than switching to JPEG — and flat dashboard UI quantizes almost losslessly.
 * Map and video frames are the only surfaces that need it, and they need it
 * badly (~1.5 MB -> ~150 KB).
 */
function shrink(file) {
  const path = `${OUT}/${file}.png`;
  const tmp = `${OUT}/${file}.tmp.png`;
  for (const colors of [256, 128, 64]) {
    if (statSync(path).size <= MAX_BYTES) return;
    try {
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-i",
          path,
          "-vf",
          `split[a][b];[a]palettegen=max_colors=${colors}[p];[b][p]paletteuse=dither=sierra2_4a`,
          tmp,
        ],
        { stdio: "ignore" },
      );
      if (statSync(tmp).size < statSync(path).size) {
        rmSync(path, { force: true });
        renameSync(tmp, path);
      } else {
        rmSync(tmp, { force: true });
      }
    } catch {
      rmSync(tmp, { force: true });
      console.warn(`  ! ffmpeg missing — ${file}.png left at full size`);
      return;
    }
  }
}

/**
 * Capture one surface. `settle` exists because MapLibre and deck.gl load async
 * and capturing early yields a blank frame — which in the guide would look
 * like a broken map rather than a screenshot taken too soon.
 */
async function shot(page, path, key, settle = 2500) {
  const file = fileFor(key);
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  // A wedged dev server answers 500 with a body that screenshots perfectly
  // well — a black rectangle reading "Internal Server Error" that would ship
  // as the guide's picture of the page. Fail the capture instead.
  if (!res?.ok()) throw new Error(`HTTP ${res?.status() ?? "no response"}`);
  // Park the pointer off every interactive surface: it rests at 0,0 otherwise,
  // and a hovercard opened there lands in the asset covering the tile behind.
  await page.mouse.move(2, 2);
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${OUT}/${file}.png` });
  shrink(file);
  const kb = Math.round(statSync(`${OUT}/${file}.png`).size / 1024);
  console.log(`  ${file}.png  ${String(kb).padStart(4)} KB  <-  ${path}`);
}

/**
 * First href on `listPath` matching `pattern`, as a pathname. Dynamic-segment
 * guides (a member, a crew, a contractor) are captured against whatever the
 * demo corpus actually holds — hardcoding an id here would silently start
 * capturing 404s the next time the corpus is reseeded.
 */
async function firstLink(page, listPath, pattern) {
  await page.goto(`${BASE}${listPath}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const href = await page.evaluate((re) => {
    const rx = new RegExp(re);
    for (const a of document.querySelectorAll("a[href]")) {
      const u = new URL(a.getAttribute("href"), location.href);
      if (rx.test(u.pathname)) return u.pathname;
    }
    return null;
  }, pattern);
  return href;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  colorScheme: "dark",
});
const page = await ctx.newPage();
await forceDark(page);
// A cold Next dev server compiles each route on first hit, and a heavy route
// has been observed taking 90s. The default 30s timeout would fail the run for
// a reason that is not a defect.
page.setDefaultNavigationTimeout(180_000);
page.setDefaultTimeout(180_000);

const c = `/city/${CITY}`;

// -- Static routes ---------------------------------------------------------
/** [guide key, path, settle ms] */
const STATIC = [
  ["index", c, 3500],
  ["map", `${c}/map`, 9000],
  ["grid", `${c}/grid`, 3500],
  ["routing", `${c}/routing`, 3500],
  ["analytics", `${c}/analytics`, 3500],
  ["analytics/heatmap", `${c}/analytics/heatmap`, 7000],
  ["browse", `${c}/browse`, 3000],
  ["calendar", `${c}/calendar`, 3000],
  ["duplicates", `${c}/duplicates`, 3000],
  ["video", `${c}/video`, 4000],
  ["members", `${c}/members`, 3000],
  ["hotspots", `${c}/hotspots`, 6000],
  ["leaderboard", `${c}/leaderboard`, 3000],
  ["trending", `${c}/trending`, 3000],
  ["qr", `${c}/qr`, 3000],
  ["report/chat", `${c}/report/chat`, 3000],
  ["report-pack", `${c}/report-pack`, 3000],
  ["documents", `${c}/documents`, 3000],
  ["user/my-reports", "/user/my-reports", 3000],
  ["user/map", "/user/map", 8000],
  ["user/trending", "/user/trending", 3000],
  ["user/pulse", "/user/pulse", 3000],
  ["user/updates", "/user/updates", 3000],
];

console.log("static routes:");
const missing = [];
for (const [key, path, settle] of STATIC) {
  if (!wanted(key)) continue;
  try {
    await shot(page, path, key, settle);
  } catch (err) {
    missing.push([key, err.message.split("\n")[0]]);
    console.warn(`  ! ${key} skipped — ${err.message.split("\n")[0]}`);
  }
}

// -- Dynamic-segment routes ------------------------------------------------
// `team` is the one dynamic guide whose id space is static (lib/teams), so it
// needs no discovery. The rest are corpus-dependent; where the demo corpus
// holds no instance, the entry ships without a screenshot and the modal falls
// back to its content-only layout.
console.log("dynamic routes:");
const TEAM = "streets_roads";
const DYNAMIC = [
  ["team", `${c}/team/${TEAM}`, 3500],
  ["team/schedule", `${c}/team/${TEAM}/schedule`, 3000],
  ["team/route", `${c}/team/${TEAM}/route`, 7000],
  ["team/field", `${c}/team/${TEAM}/field`, 3000],
];

// The first row of the members table is whoever is signed in — under
// DEV_AUTH_BYPASS that is the developer's own account, and this asset ships
// in a public repo. Capture a synthetic demo member instead; SHOT_MEMBER_ID
// names it, and the fallback scrape is a last resort for a corpus that has
// no demo admin.
const memberHref = wanted("members/detail")
  ? process.env.SHOT_MEMBER_ID
    ? `${c}/members/${process.env.SHOT_MEMBER_ID}`
    : await firstLink(page, `${c}/members`, "/members/[^/]+$")
  : null;
if (memberHref) DYNAMIC.push(["members/detail", memberHref, 3000]);
else if (wanted("members/detail"))
  missing.push(["members/detail", "no member link in the demo corpus"]);

// Crew types come from the seeded DEFAULT_CREW_TYPES list, so like `team`
// the id space is effectively static; the city index links to a crew only
// once one has work on it. Prefer a real link, fall back to the seeded type.
const crewHref = wanted("crew")
  ? ((await firstLink(page, c, "/crew/[^/]+$")) ?? `${c}/crew/paving`)
  : null;
if (crewHref) DYNAMIC.push(["crew", crewHref, 3500]);
else missing.push(["crew", "no crew link in the demo corpus"]);

const contractorHref = wanted("contractors/detail")
  ? await firstLink(page, c, "/contractors/[^/]+$")
  : null;
if (contractorHref) DYNAMIC.push(["contractors/detail", contractorHref, 3000]);
else if (wanted("contractors/detail"))
  missing.push(["contractors/detail", "no contractor link in the demo corpus"]);

for (const [key, path, settle] of DYNAMIC) {
  if (!wanted(key)) continue;
  try {
    await shot(page, path, key, settle);
  } catch (err) {
    missing.push([key, err.message.split("\n")[0]]);
    console.warn(`  ! ${key} skipped — ${err.message.split("\n")[0]}`);
  }
}

await ctx.close();
await browser.close();

const files = readdirSync(OUT).filter((f) => f.endsWith(".png"));
const total = files.reduce((n, f) => n + statSync(`${OUT}/${f}`).size, 0);
console.log(`\n${files.length} images, ${Math.round(total / 1024)} KB total.`);
// `fallback` is intentionally absent: it is not a route, it is the copy shown
// when the path matches no entry, so there is nothing to photograph.
if (missing.length > 0) {
  console.log("no screenshot:");
  for (const [key, why] of missing) console.log(`  ${key} — ${why}`);
}
