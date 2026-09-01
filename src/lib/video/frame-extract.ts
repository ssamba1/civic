/**
 * Frame extraction via the system ffmpeg binary, stage 1 of the video
 * damage-mapping pipeline. No node-level image dependency: ffmpeg also
 * produces the raw RGB tensors the ONNX detector consumes and the 8×8
 * grayscale bytes aHash needs, so one external tool covers all image work.
 *
 * ffmpeg is a deploy-host requirement (documented in the runbook); every
 * entry point degrades to ok:false with an actionable error when it is
 * missing, so a clip fails visibly instead of crashing the worker.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Result } from "@/lib/types";

/** A frame sampled from a clip, on local disk. */
export interface SampledFrame {
  /** Seconds into the clip this frame was captured at. */
  tsSeconds: number;
  /** Absolute path of the JPEG on local disk (inside the work dir). */
  path: string;
}

/**
 * ffmpeg argv for sampling `fps` JPEG frames/sec from a clip.
 * Pure, unit-testable without ffmpeg installed.
 */
export function buildSampleArgs(
  inputPath: string,
  outPattern: string,
  fps: number,
): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-vf",
    `fps=${fps}`,
    "-q:v",
    "3",
    outPattern,
  ];
}

/**
 * ffmpeg argv to decode one image to raw RGB bytes at size×size on stdout,
 * the detector's input tensor source. Plain stretch (no letterbox): bbox
 * output is normalized to [0,1] frame coordinates so the distortion cancels
 * out for our purposes (localizing damage within a frame). Pure.
 */
export function buildRawRgbArgs(imagePath: string, size: number): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    imagePath,
    "-vf",
    `scale=${size}:${size}`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ];
}

/** ffmpeg argv for the 8×8 grayscale bytes aHash consumes. Pure. */
export function buildGray8Args(imagePath: string): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    imagePath,
    "-vf",
    "scale=8:8",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "pipe:1",
  ];
}

/**
 * Parse ffmpeg's `frame_%06d.jpg` output names back to timestamps. With
 * `fps=N` filter, frame k (1-based) represents t ≈ (k − 1) / N seconds. Pure.
 */
export function frameIndexToSeconds(index1Based: number, fps: number): number {
  return (index1Based - 1) / fps;
}

/** Run ffmpeg, capturing stdout as a Buffer. Rejects on spawn error/exit≠0. */
function runFfmpeg(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const errChunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => out.push(c));
    proc.stderr.on("data", (c: Buffer) => errChunks.push(c));
    proc.on("error", (err) => {
      // ENOENT = ffmpeg not installed on this host.
      reject(
        err instanceof Error && "code" in err && err.code === "ENOENT"
          ? new Error(
              "ffmpeg binary not found. Install ffmpeg on the deploy host (see docs/runbooks/video-pipeline.md)",
            )
          : err,
      );
    });
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else
        reject(
          new Error(
            `ffmpeg exited ${code}: ${Buffer.concat(errChunks).toString("utf8").slice(0, 400)}`,
          ),
        );
    });
  });
}

/**
 * Sample frames from a clip on disk into a fresh temp work dir.
 * Caller owns cleanup via the returned `cleanup` (also safe to call twice).
 */
export async function sampleFrames(
  clipPath: string,
  fps: number,
): Promise<Result<{ frames: SampledFrame[]; cleanup: () => Promise<void> }>> {
  let workDir: string;
  try {
    workDir = await mkdtemp(join(tmpdir(), "civic-frames-"));
  } catch (err) {
    return {
      ok: false,
      error: `Could not create frame work dir: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const cleanup = async () => {
    await rm(workDir, { recursive: true, force: true });
  };
  try {
    await runFfmpeg(
      buildSampleArgs(clipPath, join(workDir, "frame_%06d.jpg"), fps),
    );
    const names = (await readdir(workDir))
      .filter((n) => /^frame_\d{6}\.jpg$/.test(n))
      .sort();
    const frames = names.map((n) => {
      const idx = Number(n.slice("frame_".length, "frame_".length + 6));
      return {
        tsSeconds: frameIndexToSeconds(idx, fps),
        path: join(workDir, n),
      };
    });
    return { ok: true, data: { frames, cleanup } };
  } catch (err) {
    await cleanup();
    return {
      ok: false,
      error: `Frame extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Decode one frame to raw RGB bytes (size×size×3) for the detector. */
export async function frameToRawRgb(
  framePath: string,
  size: number,
): Promise<Result<Uint8Array>> {
  try {
    const buf = await runFfmpeg(buildRawRgbArgs(framePath, size));
    const expected = size * size * 3;
    if (buf.length !== expected) {
      return {
        ok: false,
        error: `Raw RGB decode returned ${buf.length} bytes, expected ${expected}`,
      };
    }
    return { ok: true, data: new Uint8Array(buf) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Decode one frame to 64 grayscale bytes (8×8) for aHash. */
export async function frameToGray8(
  framePath: string,
): Promise<Result<Uint8Array>> {
  try {
    const buf = await runFfmpeg(buildGray8Args(framePath));
    if (buf.length !== 64) {
      return {
        ok: false,
        error: `Gray 8×8 decode returned ${buf.length} bytes, expected 64`,
      };
    }
    return { ok: true, data: new Uint8Array(buf) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
