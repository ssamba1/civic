// Clay asset generator for the Bento hero — cohesive claymorphism set → public/landing-clay/ webp.
//
// Two providers:
//   PROVIDER=pollinations (default) — keyless FLUX, genuinely free, no billing. For the free preview.
//   PROVIDER=gemini                 — gemini-3.1-flash-image; needs BILLING enabled (free tier = 0 quota).
//                                     Higher quality + true pixel-edit heal (fixed = edit of broken).
//
//   node scripts/gen-clay.mjs anchor                                   # anchor only (Pollinations)
//   node scripts/gen-clay.mjs all                                      # full set (Pollinations)
//   PROVIDER=gemini node --env-file=.env.local scripts/gen-clay.mjs all  # full set (Gemini, billed)
//
// NOTE: Gemini free tier no longer serves image models (429, limit:0). Enable billing to use PROVIDER=gemini.
// FLUX seed is fixed so broken/fixed share composition (FLUX has no pixel-edit API).

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// pnpm strict: sharp is not hoisted to top-level node_modules — resolve from the store.
const sharp = require(
  fileURLToPath(
    new URL(
      "../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js",
      import.meta.url,
    ),
  ),
);

const PROVIDER = process.env.PROVIDER || "pollinations";
const SEED = 42; // fixed → FLUX keeps composition stable across broken/fixed + prop set

const KEY = process.env.GEMINI_API_KEY;
if (PROVIDER === "gemini" && !KEY)
  throw new Error("GEMINI_API_KEY missing — run with --env-file=.env.local");

const MODEL = "gemini-3.1-flash-image";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;

const OUT = fileURLToPath(new URL("../public/landing-clay/", import.meta.url));
const RAW = `${OUT}_raw/`; // keep source PNGs for re-compression / debugging
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });

// Shared style spine — every prompt inherits this so the set reads as one material.
const STYLE =
  "soft claymorphism 3D render, matte modeling-clay material with subtle fingerprint texture, " +
  "soft pastel palette with a single bright blue accent (#3b6ef6), soft diffuse studio lighting with no harsh shadows, " +
  "orthographic 45-degree isometric angle with no vanishing point, cute rounded chunky toy proportions, " +
  "isolated centered on a flat off-white (#f4f2ee) background, Blender clay-toy look, high detail, no text, no watermark";

const ASPECT_WH = { "4:3": [1024, 768], "1:1": [1024, 1024] };

// Returns a raw image Buffer (JPEG from Pollinations, PNG from Gemini).
// ref (Gemini only): base64 PNG of the anchor for style/geometry conditioning.
async function generate({ prompt, ref, aspect = "1:1" }) {
  const full = `${prompt}. ${STYLE}`;

  if (PROVIDER === "pollinations") {
    const [w, h] = ASPECT_WH[aspect] || ASPECT_WH["1:1"];
    const u = `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?width=${w}&height=${h}&nologo=true&model=flux&seed=${SEED}`;
    const r = await fetch(u);
    if (!r.ok) throw new Error(`pollinations ${r.status}: ${(await r.text()).slice(0, 120)}`);
    return Buffer.from(await r.arrayBuffer());
  }

  // gemini
  const parts = [{ text: full }];
  if (ref) parts.push({ inlineData: { mimeType: "image/png", data: ref } });
  const r = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { imageConfig: { aspectRatio: aspect } } }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`gemini ${j.error.code}: ${j.error.message}`);
  const b64 = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!b64) {
    const txt = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join(" ") ?? "no image";
    throw new Error(`gemini no image: ${txt.slice(0, 200)}`);
  }
  return Buffer.from(b64, "base64");
}

async function save(name, buf, { width = 640, ext = "jpg" } = {}) {
  writeFileSync(`${RAW}${name}.${ext}`, buf);
  await sharp(buf)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toFile(`${OUT}${name}.webp`);
  const kb = (Buffer.byteLength(readFileSync(`${OUT}${name}.webp`)) / 1024).toFixed(1);
  console.log(`  ✓ ${name}.webp (${kb} KB)`);
}

// Shared scene spine so broken/fixed share layout on FLUX (same seed + same base).
const SCENE =
  "A tiny cute isometric neighborhood block on a rounded platform: two small pastel suburban houses, a few trees, " +
  "a short curved residential road running through the middle";

const BROKEN_PROMPT =
  `${SCENE}, with ONE large obvious dark cracked pothole crater in the middle of the road ` +
  "and one clearly broken bent-over streetlight leaning at an angle";

const FIXED_PROMPT =
  `${SCENE}, with a perfectly smooth freshly-paved clean road (no potholes) ` +
  "and one upright streetlight glowing with a soft warm light";

async function run() {
  const mode = process.argv[2] || "anchor";
  console.log(`gen-clay: provider=${PROVIDER}${PROVIDER === "gemini" ? ` model=${MODEL}` : ""} mode=${mode}`);
  const ext = PROVIDER === "pollinations" ? "jpg" : "png";

  // 1. Style anchor — the broken neighborhood. Gemini reuses its bytes as a ref.
  console.log("→ neighborhood-broken (anchor)");
  const anchor = await generate({ prompt: BROKEN_PROMPT, aspect: "4:3" });
  await save("neighborhood-broken", anchor, { width: 960, ext });

  if (mode === "anchor") {
    console.log("anchor done. review public/landing-clay/neighborhood-broken.webp, then run `all`.");
    return;
  }

  // 2. Fixed / healed scene. Gemini: pixel-edit the anchor (geometry locked).
  //    FLUX: same seed + same SCENE base, only the damage clause differs → near-same layout.
  console.log("→ neighborhood-fixed");
  const fixed = await generate(
    PROVIDER === "gemini"
      ? {
          prompt:
            "Edit this exact scene: repair the pothole so the road is smooth and freshly paved, " +
            "straighten the streetlight so it stands upright and glows softly, " +
            "keep every house, tree and camera angle identical",
          ref: anchor.toString("base64"),
          aspect: "4:3",
        }
      : { prompt: FIXED_PROMPT, aspect: "4:3" },
  );
  await save("neighborhood-fixed", fixed, { width: 960, ext });

  // 3. Supporting props + tile icons. Gemini conditions on the anchor for material match.
  const refB64 = PROVIDER === "gemini" ? anchor.toString("base64") : undefined;
  const pieces = [
    { name: "pin", prompt: "A single map location pin with a rounded teardrop head and a small circle hole", width: 360 },
    { name: "streetlight", prompt: "A single cute street lamp post with a glowing warm bulb", width: 360 },
    { name: "icon-triage", prompt: "A single small icon: a smartphone with a glowing blue AI spark above it", width: 360 },
    { name: "icon-open311", prompt: "A single small icon: two rounded arrows forming a data-sync loop between two boxes", width: 360 },
    { name: "icon-dashboard", prompt: "A single small icon: a rounded bar chart with an upward blue trend line", width: 360 },
  ];
  for (const p of pieces) {
    console.log(`→ ${p.name}`);
    const buf = await generate({ prompt: p.prompt, ref: refB64, aspect: "1:1" });
    await save(p.name, buf, { width: p.width, ext });
  }

  console.log(`\ndone → ${OUT}`);
}

run().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
