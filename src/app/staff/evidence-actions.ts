"use server";

/**
 * Video-detection evidence lookup for the grid's issue explorer.
 *
 * A camera-detected report carries the static placeholder as its public photo
 * (hard rule 2, the real frame is unblurred street footage and never leaves
 * the private `video-frames` bucket). Staff, however, need the actual evidence:
 * this resolves report → cluster → best detection → a short-lived signed URL
 * for the WHOLE frame plus the detector's own bounding box.
 *
 * The gate is a privacy boundary, not a convenience. The caller supplies only a
 * report id; the city is resolved FROM that report, so a city-A staffer can't
 * pass the check on their own slug while reading a city-B frame.
 */

import { createServerClient } from "@/lib/db/client";
import { getStaffAccessForCity } from "@/lib/staff-access";
import type { Result } from "@/lib/types";

const FRAMES_BUCKET = "video-frames";
/** Long enough for an operator to look; short enough that a leaked URL rots. */
const SIGNED_URL_TTL_SECONDS = 600;

/** Normalized 0..1, top-left origin, same convention as the video console. */
export interface EvidenceBox {
  x: number;
  y: number;
  w: number;
  h: number;
  conf?: number;
}

export interface ReportEvidence {
  url: string;
  box: EvidenceBox | null;
  label: string;
}

/**
 * `bbox` is jsonb: a legacy or half-written row can hold null, a string, or
 * partial keys. Anything that isn't four finite numbers yields no box at all.
 * A NaN-positioned overlay would be worse than showing the bare frame.
 */
function parseBox(raw: unknown): EvidenceBox | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const nums = (["x", "y", "w", "h"] as const).map((k) => Number(b[k]));
  if (!nums.every((n) => Number.isFinite(n))) return null;
  const [x, y, w, h] = nums as [number, number, number, number];
  const conf = Number(b.conf);
  return { x, y, w, h, conf: Number.isFinite(conf) ? conf : undefined };
}

export async function getReportEvidenceFrame(
  reportId: string,
): Promise<Result<ReportEvidence>> {
  if (typeof reportId !== "string" || reportId.length === 0) {
    return { ok: false, error: "invalid_input" };
  }

  const db = createServerClient();

  const { data: report } = await db
    .from("reports")
    .select("id, city_id")
    .eq("id", reportId)
    .maybeSingle<{ id: string; city_id: string }>();
  if (!report) return { ok: false, error: "not_found" };

  const { data: city } = await db
    .from("cities")
    .select("slug")
    .eq("id", report.city_id)
    .maybeSingle<{ slug: string }>();
  if (!city) return { ok: false, error: "not_found" };

  // Gate BEFORE any storage work, a failed caller never reaches a signed URL,
  // and the failure text carries no frame path either.
  const access = await getStaffAccessForCity(city.slug);
  if (access !== "real") return { ok: false, error: "forbidden" };

  const { data: cluster } = await db
    .from("video_detection_clusters")
    .select("id, class, max_confidence, best_detection_id")
    .eq("report_id", reportId)
    .maybeSingle<{
      id: string;
      class: string;
      max_confidence: number;
      best_detection_id: string | null;
    }>();
  // No cluster, or a cluster the detector never picked a best frame for: the
  // caller keeps the placeholder rather than seeing an arbitrary frame.
  if (!cluster?.best_detection_id) return { ok: false, error: "no_evidence" };

  const { data: detection } = await db
    .from("damage_detections")
    .select("frame_path, bbox, class, confidence")
    .eq("id", cluster.best_detection_id)
    .maybeSingle<{
      frame_path: string;
      bbox: unknown;
      class: string;
      confidence: number;
    }>();
  if (!detection?.frame_path) return { ok: false, error: "no_evidence" };

  const { data: signed } = await db.storage
    .from(FRAMES_BUCKET)
    .createSignedUrl(detection.frame_path, SIGNED_URL_TTL_SECONDS);
  if (!signed?.signedUrl) return { ok: false, error: "frame_unavailable" };

  return {
    ok: true,
    data: {
      url: signed.signedUrl,
      box: parseBox(detection.bbox),
      label: `${detection.class} · ${Number(detection.confidence).toFixed(2)}`,
    },
  };
}
