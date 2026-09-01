// Server-side face/plate blur for camera ingest (CAMERA_LIABILITY_PIPELINE.md §4.5).
//
// ────────────────────────────────────────────────────────────────────────────
// HARD RULE, NON-NEGOTIABLE
// On ANY failure (sidecar down, timeout, bad response, model error, empty
// body) this returns { ok: false } and the CALLER MUST DROP THE CROP.
// There is NO fallback path. An unblurred byte must never be persisted
// anywhere, not to `photos-public`, not to `photos-raw`, not to a temp
// object, not to a log. Dropping evidence is always cheaper than publishing
// a face or a plate. Do not add a "degraded mode" here.
// ────────────────────────────────────────────────────────────────────────────
//
// This is a NEW path that exists only because camera ingest has no client to
// blur in. The client-side path (`blur.ts`, agents.md rule #2) is untouched and
// remains the only blur for resident uploads.

import "server-only";

import { createLogger } from "@/lib/logger";
import type { Result } from "@/lib/types";

const logger = createLogger("blur-server");

/** Sidecar must answer within this budget; a slow blur is a failed blur. */
const BLUR_TIMEOUT_MS = 15_000;

/** Stamped onto camera crops so a model upgrade can trigger a re-blur (migration 040). */
export const SERVER_BLUR_VERSION = "server-blur-v1";

export interface BlurredCrop {
  bytes: Uint8Array;
  /** Value for the existing `blur_version` column. */
  blurVersion: string;
  /** Regions the model redacted, telemetry only, never coordinates of a person. */
  regionsRedacted: number;
}

function detectorBaseUrl(): string | null {
  const url = process.env.DETECTOR_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

/**
 * Blur faces and license plates in a crop by calling the detector sidecar's
 * `/blur` endpoint. Returns the redacted bytes, or `{ ok: false }`, in which
 * case the caller drops the crop entirely (see the hard rule above).
 */
export async function blurServerSide(
  imageBytes: Uint8Array,
  opts: { contentType?: string; signal?: AbortSignal } = {},
): Promise<Result<BlurredCrop>> {
  const base = detectorBaseUrl();
  if (!base) {
    logger.error("blur_sidecar_unconfigured", undefined, {
      detail: "DETECTOR_URL is unset, dropping crop rather than publishing it",
    });
    return { ok: false, error: "blur_unavailable" };
  }
  if (imageBytes.byteLength === 0) {
    return { ok: false, error: "blur_empty_input" };
  }

  const timeout = AbortSignal.timeout(BLUR_TIMEOUT_MS);
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, timeout])
    : timeout;

  try {
    const res = await fetch(`${base}/blur`, {
      method: "POST",
      headers: {
        "Content-Type": opts.contentType ?? "application/octet-stream",
      },
      // Copy into a plain ArrayBuffer view: a Uint8Array over a SharedArrayBuffer
      // is not a valid BodyInit.
      body: new Uint8Array(imageBytes).slice().buffer as ArrayBuffer,
      signal,
    });

    if (!res.ok) {
      logger.error("blur_sidecar_status", undefined, { status: res.status });
      return { ok: false, error: "blur_failed" };
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0) {
      logger.error("blur_sidecar_empty_body");
      return { ok: false, error: "blur_failed" };
    }

    // The sidecar reports what it redacted in a header so the response body can
    // stay raw bytes. A missing header is not a failure. 0 regions is a legal
    // outcome for a crop with no faces or plates in it.
    const regionsHeader = res.headers.get("x-blur-regions");
    const regionsRedacted = Number.parseInt(regionsHeader ?? "0", 10);

    return {
      ok: true,
      data: {
        bytes: buf,
        blurVersion: res.headers.get("x-blur-version") ?? SERVER_BLUR_VERSION,
        regionsRedacted: Number.isFinite(regionsRedacted) ? regionsRedacted : 0,
      },
    };
  } catch (err) {
    // Includes network failure, DNS failure, and the abort timeout. Every one of
    // them means: no blurred bytes exist, so no bytes get persisted.
    logger.error("blur_sidecar_unreachable", err);
    return { ok: false, error: "blur_unavailable" };
  }
}
