"use server";

import { after } from "next/server";
import { z } from "zod/v4";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import { getStaffAccessForCity } from "@/lib/staff-access";
import type { Result } from "@/lib/types";
import { VIDEO_MAX_CLIP_BYTES, VIDEO_PIPELINE } from "@/lib/video/config";
import { type DecideOutcome, decideCluster } from "@/lib/video/decide";
import { processClip } from "@/lib/video/pipeline";
import { parseTrack } from "@/lib/video/track";

const logger = createLogger("[video-actions]");

const CLIPS_BUCKET = "video-clips";
const FRAMES_BUCKET = "video-frames";
const DEFAULT_UPLOAD_FEED_NAME = "Manual uploads";

/**
 * Gate every action three ways: feature flag ON, caller is REAL staff for the
 * slug (demo personas can't feed video into a city), and the city exists.
 * Returns the resolved city id + caller id.
 */
async function requireVideoStaff(
  slug: string,
): Promise<Result<{ cityId: string; userId: string }>> {
  if (!VIDEO_PIPELINE) return { ok: false, error: "video_pipeline_disabled" };
  const access = await getStaffAccessForCity(slug);
  if (access !== "real") return { ok: false, error: "forbidden" };
  const user = await getAuthUser();
  // The dev bypass grants "real" without a session; refuse writes there too —
  // clips need an attributable creator (reports.reporter_id is NOT NULL).
  if (!user) return { ok: false, error: "forbidden" };
  const db = createServerClient();
  const { data: city } = await db
    .from("cities")
    .select("id")
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();
  if (!city) return { ok: false, error: "unknown_city" };
  return { ok: true, data: { cityId: city.id, userId: user.id } };
}

const registerUploadSchema = z.object({
  slug: z.string().min(1),
  fileName: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive(),
});

/**
 * Step 1 of upload: mint a signed upload URL into the private video-clips
 * bucket. The browser PUTs the file straight to storage — a 200 MB clip never
 * transits a server action body.
 */
export async function registerClipUpload(
  input: z.infer<typeof registerUploadSchema>,
): Promise<Result<{ storagePath: string; signedUrl: string }>> {
  const parsed = registerUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const gate = await requireVideoStaff(parsed.data.slug);
  if (!gate.ok) return gate;
  if (parsed.data.sizeBytes > VIDEO_MAX_CLIP_BYTES) {
    return { ok: false, error: "clip_too_large" };
  }
  const ext = parsed.data.fileName
    .toLowerCase()
    .match(/\.(mp4|mov|webm|mkv)$/)?.[1];
  if (!ext) return { ok: false, error: "unsupported_format" };

  const db = createServerClient();
  const storagePath = `${gate.data.cityId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await db.storage
    .from(CLIPS_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (error || !data) {
    logger.error("signed upload url failed", error ?? undefined, {
      storagePath,
    });
    return { ok: false, error: "upload_url_failed" };
  }
  return { ok: true, data: { storagePath, signedUrl: data.signedUrl } };
}

const finalizeClipSchema = z.object({
  slug: z.string().min(1),
  storagePath: z.string().min(1),
  startLng: z.number().min(-180).max(180).nullable(),
  startLat: z.number().min(-90).max(90).nullable(),
  // Optional [{t,lng,lat}] GPS track (dashcam companion export). Re-validated
  // server-side by parseTrack — malformed points are dropped, not stored.
  gpsTrack: z.unknown().optional(),
});

/**
 * Step 2: register the uploaded object as a video_clips row and kick off
 * stage-1 processing in the background (same after() lifecycle as async
 * classify). Returns immediately with the clip id.
 */
export async function finalizeClip(
  input: z.infer<typeof finalizeClipSchema>,
): Promise<Result<{ clipId: string }>> {
  const parsed = finalizeClipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const gate = await requireVideoStaff(parsed.data.slug);
  if (!gate.ok) return gate;
  const { cityId, userId } = gate.data;

  // A signed-URL path is caller-controlled on re-submit — re-anchor it to the
  // caller's own city folder so one city's staff can't register another's clip.
  if (!parsed.data.storagePath.startsWith(`${cityId}/`)) {
    return { ok: false, error: "forbidden" };
  }

  const db = createServerClient();

  // Find-or-create the city's default upload feed.
  let feedId: string;
  const { data: feed } = await db
    .from("video_feeds")
    .select("id")
    .eq("city_id", cityId)
    .eq("kind", "upload")
    .eq("name", DEFAULT_UPLOAD_FEED_NAME)
    .maybeSingle<{ id: string }>();
  if (feed) {
    feedId = feed.id;
  } else {
    const { data: created, error: feedErr } = await db
      .from("video_feeds")
      .insert({
        city_id: cityId,
        kind: "upload",
        name: DEFAULT_UPLOAD_FEED_NAME,
        created_by: userId,
      })
      .select("id")
      .single<{ id: string }>();
    if (feedErr || !created) {
      logger.error("feed create failed", feedErr ?? undefined, { cityId });
      return { ok: false, error: "feed_create_failed" };
    }
    feedId = created.id;
  }

  const track = parseTrack(parsed.data.gpsTrack);
  const hasStart =
    parsed.data.startLng !== null && parsed.data.startLat !== null;
  const { data: clip, error: clipErr } = await db
    .from("video_clips")
    .insert({
      feed_id: feedId,
      city_id: cityId,
      storage_path: parsed.data.storagePath,
      captured_at: new Date().toISOString(),
      start_location: hasStart
        ? `SRID=4326;POINT(${parsed.data.startLng} ${parsed.data.startLat})`
        : null,
      gps_track: track.length > 0 ? track : null,
      status: "pending",
      created_by: userId,
    })
    .select("id")
    .single<{ id: string }>();
  if (clipErr || !clip) {
    logger.error("clip insert failed", clipErr ?? undefined, { cityId });
    return { ok: false, error: "clip_insert_failed" };
  }

  after(async () => {
    try {
      await processClip(clip.id);
    } catch (err) {
      // processClip self-logs handled failures; this is the unexpected-throw
      // backstop, mirroring submitReport's async-classify pattern.
      logger.error("processClip threw", err, { clipId: clip.id });
      await db
        .from("video_clips")
        .update({ status: "failed", error: "unhandled processing error" })
        .eq("id", clip.id);
    }
  });

  return { ok: true, data: { clipId: clip.id } };
}

const escalateSchema = z.object({
  slug: z.string().min(1),
  clusterId: z.uuid(),
});

/** Manual stage-2 trigger for a candidate/monitoring cluster. */
export async function escalateClusterNow(
  input: z.infer<typeof escalateSchema>,
): Promise<Result<DecideOutcome>> {
  const parsed = escalateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const gate = await requireVideoStaff(parsed.data.slug);
  if (!gate.ok) return gate;

  const db = createServerClient();
  const { data: cluster } = await db
    .from("video_detection_clusters")
    .select("id, city_id")
    .eq("id", parsed.data.clusterId)
    .maybeSingle<{ id: string; city_id: string }>();
  if (!cluster || cluster.city_id !== gate.data.cityId) {
    return { ok: false, error: "not_found" };
  }
  return decideCluster(cluster.id);
}

const frameUrlSchema = z.object({
  slug: z.string().min(1),
  framePath: z.string().min(1),
});

/**
 * Short-lived signed URL for one evidence frame. Frames are unblurred city
 * footage in a private bucket — staff-only, city-scoped by path prefix, and
 * the URL expires in 10 minutes.
 */
export async function getFrameUrl(
  input: z.infer<typeof frameUrlSchema>,
): Promise<Result<{ url: string }>> {
  const parsed = frameUrlSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const gate = await requireVideoStaff(parsed.data.slug);
  if (!gate.ok) return gate;
  if (!parsed.data.framePath.startsWith(`${gate.data.cityId}/`)) {
    return { ok: false, error: "forbidden" };
  }
  const db = createServerClient();
  const { data, error } = await db.storage
    .from(FRAMES_BUCKET)
    .createSignedUrl(parsed.data.framePath, 600);
  if (error || !data) return { ok: false, error: "sign_failed" };
  return { ok: true, data: { url: data.signedUrl } };
}
