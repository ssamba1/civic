#!/usr/bin/env node
// Fetch the ONNX road-damage model the video pipeline's LLM-free detector
// runs (lib/video/detector.ts). Weights are NOT vendored in the repo — pick a
// YOLOv8-style 640×640 export trained on RDD2022 (classes D00/D10/D20/D40 →
// longitudinal_crack, transverse_crack, alligator_crack, pothole) whose
// license fits your deployment, and pass its URL:
//
//   node scripts/fetch-video-model.mjs <model-url> [out-path]
//
// Default out-path: models/road-damage.onnx (git-ignored). Then set
//   VIDEO_DETECT_MODEL_PATH=/abs/path/to/models/road-damage.onnx
// (and VIDEO_DETECT_CLASSES if the model's class order differs).
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const [url, outArg] = process.argv.slice(2);
if (!url) {
  console.error(
    "Usage: node scripts/fetch-video-model.mjs <model-url> [out-path]",
  );
  process.exit(1);
}
const out = resolve(outArg ?? "models/road-damage.onnx");

const res = await fetch(url, { redirect: "follow" });
if (!res.ok || !res.body) {
  console.error(`Download failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
await mkdir(dirname(out), { recursive: true });
await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
console.log(`Saved model to ${out}`);
console.log(`Set VIDEO_DETECT_MODEL_PATH=${out}`);
