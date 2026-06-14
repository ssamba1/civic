/**
 * Golden-set classification eval.
 *
 * Runs the REAL production classification prompt + schema (imported from
 * src/lib/ai) against a human-labeled golden set and reports accuracy. This is
 * the harness research flagged as missing: verify-classify.mjs only proves the
 * pipeline RUNS (1x1 px JPEG); this measures whether it is CORRECT.
 *
 * Ground truth: tests/golden/manifest.json
 * Photos:       tests/golden/images/<image>   (not committed)
 * Output:       tests/golden/results.json + console summary
 *
 * Run:  pnpm eval         (needs GEMINI_API_KEY; auto-loads .env.local if present)
 *
 * Metrics:
 *   - category accuracy (exact match)
 *   - severity MAE + within-1 accuracy
 *   - is_emergency precision / recall / FALSE-NEGATIVE RATE (the liability metric:
 *     a missed real emergency that auto-dispatch would never see)
 *   - mean confidence, and confidence split by correct/incorrect (calibration)
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  classificationSchema,
  GEMINI_CLASSIFICATION_SCHEMA,
} from "../src/lib/ai/classification-schema";
import {
  CLASSIFICATION_PROMPT,
  CLASSIFICATION_SYSTEM_PROMPT,
} from "../src/lib/ai/prompt";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const GOLDEN_DIR = join(ROOT, "tests", "golden");
const IMAGES_DIR = join(GOLDEN_DIR, "images");
const MODEL = "gemini-2.5-flash";

// --- Minimal .env.local loader (tsx does not auto-load dotenv) --------------
function loadEnvLocal(): void {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

interface GoldenSample {
  image: string;
  expected: { category: string; severity: number; is_emergency: boolean };
}

function mimeFor(file: string): string {
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const m = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return m ? m[1].trim() : trimmed;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY not set (add to .env.local or env). Aborting.");
    process.exit(1);
  }

  const manifestPath = join(GOLDEN_DIR, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    samples: GoldenSample[];
  };
  const samples = manifest.samples ?? [];

  // Only evaluate samples whose image file actually exists locally.
  const present = samples.filter((s) => existsSync(join(IMAGES_DIR, s.image)));
  const missing = samples.filter((s) => !existsSync(join(IMAGES_DIR, s.image)));

  if (missing.length) {
    console.log(
      `⚠ ${missing.length} manifest sample(s) have no image in tests/golden/images/ — skipped: ${missing
        .map((s) => s.image)
        .join(", ")}`,
    );
  }
  if (!present.length) {
    console.log(
      "No golden images found. Drop photos into tests/golden/images/ and label them in manifest.json, then re-run.",
    );
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: CLASSIFICATION_SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GEMINI_CLASSIFICATION_SCHEMA,
    },
  });

  interface Row {
    image: string;
    expCategory: string;
    gotCategory: string;
    categoryOk: boolean;
    expSeverity: number;
    gotSeverity: number;
    expEmergency: boolean;
    gotEmergency: boolean;
    confidence: number;
    error?: string;
  }

  const rows: Row[] = [];
  for (const s of present) {
    const bytes = readFileSync(join(IMAGES_DIR, s.image));
    try {
      const res = await model.generateContent([
        CLASSIFICATION_PROMPT,
        {
          inlineData: {
            data: bytes.toString("base64"),
            mimeType: mimeFor(s.image),
          },
        },
      ]);
      const parsed = classificationSchema.safeParse(
        JSON.parse(stripCodeFences(res.response.text())),
      );
      if (!parsed.success) {
        rows.push({
          image: s.image,
          expCategory: s.expected.category,
          gotCategory: "PARSE_FAIL",
          categoryOk: false,
          expSeverity: s.expected.severity,
          gotSeverity: 0,
          expEmergency: s.expected.is_emergency,
          gotEmergency: false,
          confidence: 0,
          error: "validation failed",
        });
        continue;
      }
      const c = parsed.data;
      rows.push({
        image: s.image,
        expCategory: s.expected.category,
        gotCategory: c.category,
        categoryOk: c.category === s.expected.category,
        expSeverity: s.expected.severity,
        gotSeverity: c.severity,
        expEmergency: s.expected.is_emergency,
        gotEmergency: c.is_emergency,
        confidence: c.confidence,
      });
      console.log(
        `${c.category === s.expected.category ? "✓" : "✗"} ${s.image}  exp=${s.expected.category}/${s.expected.severity} got=${c.category}/${c.severity} emg=${c.is_emergency}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rows.push({
        image: s.image,
        expCategory: s.expected.category,
        gotCategory: "API_ERROR",
        categoryOk: false,
        expSeverity: s.expected.severity,
        gotSeverity: 0,
        expEmergency: s.expected.is_emergency,
        gotEmergency: false,
        confidence: 0,
        error: message,
      });
      console.log(`! ${s.image}  API error: ${message}`);
    }
  }

  // --- Aggregate metrics -----------------------------------------------------
  const n = rows.length;
  const scored = rows.filter((r) => !r.error);
  const categoryAcc = scored.filter((r) => r.categoryOk).length / (scored.length || 1);
  const sevAbsErr = scored.map((r) => Math.abs(r.gotSeverity - r.expSeverity));
  const sevMAE = sevAbsErr.reduce((a, b) => a + b, 0) / (scored.length || 1);
  const sevWithin1 =
    scored.filter((r) => Math.abs(r.gotSeverity - r.expSeverity) <= 1).length /
    (scored.length || 1);

  // is_emergency as positive class
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const r of scored) {
    if (r.expEmergency && r.gotEmergency) tp++;
    else if (!r.expEmergency && r.gotEmergency) fp++;
    else if (r.expEmergency && !r.gotEmergency) fn++;
    else tn++;
  }
  const emgPrecision = tp + fp ? tp / (tp + fp) : null;
  const emgRecall = tp + fn ? tp / (tp + fn) : null;
  const falseNegRate = tp + fn ? fn / (tp + fn) : null;

  const correctConf = scored.filter((r) => r.categoryOk).map((r) => r.confidence);
  const wrongConf = scored.filter((r) => !r.categoryOk).map((r) => r.confidence);
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  const summary = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    samples: n,
    scored: scored.length,
    errored: n - scored.length,
    categoryAccuracy: round(categoryAcc),
    severityMAE: round(sevMAE),
    severityWithin1: round(sevWithin1),
    emergency: {
      tp,
      fp,
      fn,
      tn,
      precision: round(emgPrecision),
      recall: round(emgRecall),
      falseNegativeRate: round(falseNegRate),
    },
    confidence: {
      meanWhenCorrect: round(mean(correctConf)),
      meanWhenWrong: round(mean(wrongConf)),
    },
  };

  console.log("\n──────── EVAL SUMMARY ────────");
  console.log(`samples scored:       ${summary.scored}/${summary.samples}`);
  console.log(`category accuracy:    ${pct(summary.categoryAccuracy)}`);
  console.log(`severity MAE:         ${summary.severityMAE}`);
  console.log(`severity within ±1:   ${pct(summary.severityWithin1)}`);
  console.log(
    `emergency recall:     ${pct(summary.emergency.recall)}  (precision ${pct(summary.emergency.precision)})`,
  );
  console.log(
    `🚨 emergency FALSE-NEGATIVE rate: ${pct(summary.emergency.falseNegativeRate)}  (${fn} missed of ${tp + fn} real)`,
  );
  console.log(
    `confidence calibration: correct=${summary.confidence.meanWhenCorrect ?? "—"} wrong=${summary.confidence.meanWhenWrong ?? "—"}`,
  );
  console.log("──────────────────────────────\n");

  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    join(GOLDEN_DIR, "results.json"),
    JSON.stringify({ summary, rows }, null, 2),
  );
  console.log("Wrote tests/golden/results.json");
}

function round(v: number | null): number | null {
  return v === null ? null : Math.round(v * 1000) / 1000;
}
function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
