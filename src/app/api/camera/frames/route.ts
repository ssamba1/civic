import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { ingestFrameBatch } from "@/lib/camera/ingest";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { lookupApiKey } from "@/lib/open311/api-keys";

const logger = createLogger("[camera-frames]");

/**
 * POST /api/camera/frames
 *
 * Fleet dashcam frame batch upload (CAMERA_LIABILITY_PIPELINE.md §4.2).
 * Auth: `api_keys` (migration 028), SHA-256 hash lookup, scope `camera:ingest`.
 * No user session — the uploader is a depot script, not a browser.
 *
 * Idempotent on `(deviceId, frame.externalId)`: replaying a batch is free, which
 * is what makes the 503-and-retry posture below safe.
 *
 * Failure posture (spec §6): the detector sidecar being down is NOT an error the
 * uploader can fix, so it returns 503 with `retryable: true` and the batch is
 * re-sent later. Nothing here may crash the request — camera ingest must never
 * take down report creation from other sources.
 */

const SCOPE = "camera:ingest";

/** Guard against a device shipping a whole route in one request body. */
const MAX_FRAMES_PER_BATCH = 200;

const FrameSchema = z.object({
  externalId: z.string().min(1).max(200),
  capturedAt: z.iso.datetime({ offset: true }),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  headingDeg: z.number().min(0).max(360).nullish(),
  speedMps: z.number().min(0).max(120).nullish(),
  imageBase64OrUrl: z.string().min(1),
});

const FrameBatchSchema = z.object({
  deviceId: z.uuid(),
  frames: z.array(FrameSchema).min(1).max(MAX_FRAMES_PER_BATCH),
});

function err(
  status: number,
  error: string,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit before body parsing or the key check, so a leaked key can't
    // drive unbounded storage writes and Gemini spend.
    const rl = checkRateLimit(`camera_frames:${clientIp(request)}`, {
      windowMs: 60_000,
      max: 60,
    });
    if (!rl.allowed) return err(429, "rate_limited");

    const apiKey =
      request.headers.get("x-api-key") ??
      request.nextUrl.searchParams.get("api_key");
    if (!apiKey) return err(401, "api_key_required");

    const partner = await lookupApiKey(apiKey);
    // No legacy env-key fallback here: unlike Open311 this is a brand-new
    // surface, so every caller gets a scoped per-partner key from day one.
    if (!partner) return err(401, "api_key_invalid");
    if (!partner.scopes.includes(SCOPE)) {
      return err(403, "missing_scope", { required: SCOPE });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return err(400, "invalid_json");
    }

    const parsed = FrameBatchSchema.safeParse(raw);
    if (!parsed.success) {
      return err(400, "invalid_input", {
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    const batch = parsed.data;

    const db = createServerClient();
    const { data: device, error: deviceErr } = await db
      .from("camera_devices")
      .select("id, city_id, active")
      .eq("id", batch.deviceId)
      .maybeSingle();
    if (deviceErr) {
      logger.error("device_lookup_failed", undefined, {
        error: deviceErr.message,
      });
      return err(503, "temporarily_unavailable", { retryable: true });
    }
    if (!device) return err(404, "unknown_device");
    const deviceRow = device as {
      id: string;
      city_id: string;
      active: boolean;
    };
    if (!deviceRow.active) return err(403, "device_inactive");

    // A city-pinned key may only push frames for its own city's devices.
    if (partner.cityId && partner.cityId !== deviceRow.city_id) {
      return err(403, "device_outside_key_city");
    }

    const result = await ingestFrameBatch({
      deviceId: deviceRow.id,
      cityId: deviceRow.city_id,
      frames: batch.frames,
    });

    if (!result.ok) {
      const { code, message, retryable } = result.error;
      logger.warn("ingest_failed", { code, message, retryable });
      // Retryable failures are infrastructure, not caller error: 503 tells the
      // depot uploader to re-send the identical batch (idempotency makes the
      // already-ingested frames no-ops).
      return err(retryable ? 503 : 500, code, { retryable });
    }

    return NextResponse.json(
      {
        deviceId: deviceRow.id,
        framesReceived: batch.frames.length,
        detectionsStored: result.data.detectionsStored,
        promotedReportIds: result.data.promotedReportIds,
        frames: result.data.frames,
      },
      { status: 202 },
    );
  } catch (e) {
    // Last-resort guard: an ingest crash must surface as a retryable 503, never
    // as an unhandled rejection that takes the route down.
    logger.error("camera_frames_unhandled", e);
    return err(503, "temporarily_unavailable", { retryable: true });
  }
}
