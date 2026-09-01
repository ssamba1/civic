"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod/v4";
import { runClassifyPipeline } from "@/lib/ai/classify-pipeline";
import { ASYNC_CLASSIFY } from "@/lib/ai/config";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { createServerClient } from "@/lib/db/client";
import { buildPhotoPaths } from "@/lib/db/report-photos";
import { createSSRClient } from "@/lib/db/ssr-client";
import { evaluateReportLiability } from "@/lib/liability/evaluate";
import { createLogger } from "@/lib/logger";
import { stripImageMetadata } from "@/lib/privacy/exif-strip";
import { redactPII } from "@/lib/privacy/pii-redact";
import type { Classification, Result } from "@/lib/types";
import { emitWebhook } from "@/lib/webhooks/deliver";

const logger = createLogger("[submit-report]");

const submitReportSchema = z.object({
  // Multi-photo arrays (base64, no data-URL prefix). All photos are
  // blurred client-side before reaching this action. Blurred → public bucket,
  // original → raw bucket.  Min 1, max 6 photos per submission.
  // idx 0 is the PRIMARY photo; it also populates reports.photo_public_url /
  // photo_raw_url so all existing display sites keep working unchanged.
  photosBlurred: z
    .array(z.string().min(1))
    .min(1, "At least one blurred photo is required")
    .max(6, "Maximum 6 photos per report"),
  photosOriginal: z
    .array(z.string().min(1))
    .min(1, "At least one original photo is required")
    .max(6, "Maximum 6 photos per report"),
  location: z
    .object({
      lng: z.number().min(-180).max(180),
      lat: z.number().min(-90).max(90),
    })
    .nullable(),
  // Trim then coerce empty/whitespace-only to null so "   " can't land in the
  // DB as a phantom address/description that pollutes lists and filters.
  address: z
    .string()
    .transform((s) => s.trim())
    .transform((s) => (s.length > 0 ? s : null))
    .nullable(),
  description: z
    .string()
    .max(500)
    .transform((s) => s.trim())
    .transform((s) => (s.length > 0 ? s : null))
    .nullable(),
  // Trim each tag and drop blanks so empty-string tags don't enter the corpus.
  tags: z
    .array(z.string().max(40))
    .max(8)
    .default([])
    .transform((arr) => arr.map((t) => t.trim()).filter((t) => t.length > 0)),
  // Per-photo aHash array computed client-side. First entry feeds dedup (same
  // role as the former scalar phash). Optional for backward-compat.
  phashes: z.array(z.string()).optional(),
});

type SubmitReportInput = z.infer<typeof submitReportSchema>;

const PUBLIC_BUCKET = "photos-public";
const RAW_BUCKET = "photos-raw";

// Demo default city. Fresh guest/anon submitters have no public.users row, and
// no-GPS submits have no coordinate. Both fall back to this city. Set to
// Ahilyanagar, Maharashtra so any report created on the live site routes into
// the Ahilyanagar civic console (single lever for the demo). Center is the
// Ahilyanagar (formerly Ahmednagar) city center.
const DEFAULT_CITY_SLUG = "ahilyanagar";
const DEFAULT_CITY_CENTER = { lat: 19.0948, lng: 74.748 };

function fallbackClassification(reason: string): Classification {
  return {
    category: "other",
    subcategory: "unclassified",
    severity: 3,
    hazard_radius_m: 0,
    visible_size_estimate: "unknown",
    is_emergency: false,
    confidence: 0,
    reasoning: reason,
    no_issue_detected: false,
    alternate_categories: [],
  };
}

/**
 * Liability attribution (spec §3.2) runs after classification, because the
 * warranty join needs the report's category. Strictly best-effort: it is only
 * ever called post-response, it swallows every failure, and a missing verdict
 * degrades the UI to an "unknown" badge. A resident's report must never fail
 * because the city has no paving schedule loaded.
 */
async function evaluateLiabilityBestEffort(reportId: string): Promise<void> {
  try {
    const result = await evaluateReportLiability(reportId);
    if (!result.ok) {
      logger.warn("liability evaluation returned an error", {
        reportId,
        error: result.error,
      });
    }
  } catch (err) {
    logger.error("liability evaluation threw", err, { reportId });
  }
}

export async function submitReport(
  input: SubmitReportInput,
): Promise<Result<{ id: string; classification: Classification }>> {
  const parsed = submitReportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) };
  }
  const { photosBlurred, photosOriginal, location, address, tags, phashes } =
    parsed.data;

  // Both arrays must be the same length (validated here, not just in schema).
  if (photosBlurred.length !== photosOriginal.length) {
    return { ok: false, error: "Photo arrays length mismatch" };
  }

  // Redact PII from the public-facing description before it is stored.
  // The raw (pre-redaction) text is intentionally not persisted. The
  // description column is public-readable via Open311; no PII should land there.
  const description = parsed.data.description
    ? redactPII(parsed.data.description).redacted
    : parsed.data.description;

  // reports.location is NOT NULL geography(POINT,4326). When GPS is unavailable,
  // fall back to the demo city center so submission never dead-ends.
  const coord = location ?? DEFAULT_CITY_CENTER;

  // Auth via cookie-aware SSR client.
  const ssr = await createSSRClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthenticated" };
  }

  const service = createServerClient();

  // Resolve the reporter's city. New anon/guest/OAuth users have no public.users
  // row (no signup trigger), so self-heal: create one defaulted to DEFAULT_CITY_SLUG.
  let cityId: string | null = null;
  const { data: profile } = await ssr
    .from("users")
    .select("city_id")
    .eq("id", user.id)
    .single<{ city_id: string }>();
  if (profile?.city_id) {
    cityId = profile.city_id;
  } else {
    const { data: city } = await service
      .from("cities")
      .select("id")
      .eq("slug", DEFAULT_CITY_SLUG)
      .single<{ id: string }>();
    if (city?.id) {
      // Create the row only if missing (ON CONFLICT DO NOTHING). A plain upsert
      // here re-writes role="resident" onto an EXISTING staff/admin row whose
      // city_id merely happens to be null, silently demoting them. ignoreDuplicates
      // prevents that; role is only ever set on a true insert.
      await service.from("users").upsert(
        {
          id: user.id,
          city_id: city.id,
          role: "resident",
          email: user.email ?? null,
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      // If the row already existed with a null city_id, backfill ONLY the city so
      // the report can be scoped, never touch role/email of an existing user.
      await service
        .from("users")
        .update({ city_id: city.id })
        .eq("id", user.id)
        .is("city_id", null);
      cityId = city.id;
    }
  }
  if (!cityId) {
    return { ok: false, error: "No city configured. Contact support." };
  }

  const reportId = crypto.randomUUID();
  const photoCount = photosBlurred.length;
  const paths = buildPhotoPaths(cityId, reportId, photoCount);

  // Upload via service role: storage RLS has no INSERT policy (folder-scoping
  // can't be set via the pooler), so the service role performs the writes.
  // Privacy is preserved because the blur already ran client-side; the
  // server-side EXIF strip is defense-in-depth against a non-canvas client
  // sneaking GPS/device metadata past the blur (LCP-20).
  //
  // Multi-photo: upload all photos. On any failure, clean up all already-uploaded
  // objects for this report before returning the error.
  const uploadedPublicPaths: string[] = [];
  const uploadedRawPaths: string[] = [];

  for (let i = 0; i < photoCount; i++) {
    const { publicPath, rawPath } = paths[i];

    const { error: pubErr } = await service.storage
      .from(PUBLIC_BUCKET)
      .upload(
        publicPath,
        stripImageMetadata(Buffer.from(photosBlurred[i], "base64")),
        { contentType: "image/webp", upsert: false },
      );
    if (pubErr) {
      // Roll back all uploads done so far.
      if (uploadedPublicPaths.length > 0)
        await service.storage.from(PUBLIC_BUCKET).remove(uploadedPublicPaths);
      if (uploadedRawPaths.length > 0)
        await service.storage.from(RAW_BUCKET).remove(uploadedRawPaths);
      return {
        ok: false,
        error: `Photo ${i} upload failed: ${pubErr.message}`,
      };
    }
    uploadedPublicPaths.push(publicPath);

    const { error: rawErr } = await service.storage
      .from(RAW_BUCKET)
      .upload(
        rawPath,
        stripImageMetadata(Buffer.from(photosOriginal[i], "base64")),
        { contentType: "image/jpeg", upsert: false },
      );
    if (rawErr) {
      await service.storage.from(PUBLIC_BUCKET).remove(uploadedPublicPaths);
      if (uploadedRawPaths.length > 0)
        await service.storage.from(RAW_BUCKET).remove(uploadedRawPaths);
      return {
        ok: false,
        error: `Raw photo ${i} upload failed: ${rawErr.message}`,
      };
    }
    uploadedRawPaths.push(rawPath);
  }

  // Resolve the primary (idx 0) public URL for reports.photo_public_url.
  const {
    data: { publicUrl },
  } = service.storage.from(PUBLIC_BUCKET).getPublicUrl(paths[0].publicPath);

  // Insert the report via the SSR client so RLS is the backstop
  // (reporter_id = auth.uid(), city_id = current_user_city_id()).
  //
  // PRIMARY photo fields (idx 0) keep the same shape as the single-photo path,
  // backward-compatible: every existing display site that reads these columns
  // keeps working unchanged.
  //
  // Flag-gated: the async path stamps classify_status:"pending" so the resident
  // UI can subscribe for the result. The classify_status column ships in
  // migration 007 (NOT auto-applied), so the synchronous default path must
  // NEVER reference it. Keep the flag-off insert byte-identical to before.
  const primaryPhash = phashes?.[0];
  const reportRow = {
    id: reportId,
    city_id: cityId,
    reporter_id: user.id,
    location: `SRID=4326;POINT(${coord.lng} ${coord.lat})`,
    photo_public_url: publicUrl,
    photo_raw_url: `${RAW_BUCKET}/${paths[0].rawPath}`,
    address,
    description,
    tags,
    status: "open",
    // classify_status is only stamped on the async path; the column ships in
    // migration 007 but isn't reflected in the generated Supabase types yet, so
    // attach it via a typed-loose record only when async is ON. The flag-off
    // insert is the bare reportRow, byte-identical to the original behavior.
    ...(ASYNC_CLASSIFY ? { classify_status: "pending" } : {}),
    ...(primaryPhash ? { photo_phash: primaryPhash } : {}),
    // OUTFLANK #34, record the blur pipeline version that ran client-side
    // before this photo hit the public bucket, so the privacy-audit dashboard
    // can report blur coverage. Literal mirrors lib/privacy/blur.ts BLUR_VERSION
    // (not imported: that module carries client-only canvas deps). Bump both
    // together when the blur pipeline version changes. Column ships in migration
    // 040. Stamped unconditionally; the migration is part of the deploy set.
    blur_version: 1,
  } as Record<string, unknown>;
  const { error: insertErr } = await ssr.from("reports").insert(reportRow);
  if (insertErr) {
    await service.storage.from(PUBLIC_BUCKET).remove(uploadedPublicPaths);
    await service.storage.from(RAW_BUCKET).remove(uploadedRawPaths);
    return {
      ok: false,
      error: `Failed to create report: ${insertErr.message}`,
    };
  }

  // Insert child report_photos rows (idx 0..n-1).
  // Best-effort: if the table isn't applied yet (migration 050 not deployed),
  // the report.photo_public_url primary still works and the UI degrades
  // gracefully. We log a warn but never fail the submission.
  const photoRows = paths.map((p, i) => ({
    report_id: reportId,
    idx: i,
    public_url: service.storage.from(PUBLIC_BUCKET).getPublicUrl(p.publicPath)
      .data.publicUrl,
    raw_url: `${RAW_BUCKET}/${p.rawPath}`,
    phash: phashes?.[i] ?? null,
    blur_version: 1,
  }));
  const { error: photosInsertErr } = await service
    .from("report_photos")
    .insert(photoRows);
  if (photosInsertErr) {
    logger.warn(
      "report_photos insert failed (degrade: primary photo still intact)",
      {
        reportId,
        code: photosInsertErr.code,
        message: photosInsertErr.message,
      },
    );
  }

  // Outbound webhooks (#79): notify registered integrations that a report was
  // created. Fire-and-forget via after() so it never delays the response and a
  // dispatch failure can never fail the submission. emitWebhook self-degrades
  // to a no-op if the webhook_endpoints table/migration isn't applied.
  after(async () => {
    try {
      await emitWebhook("report.created", {
        id: reportId,
        city_id: cityId,
        category: tags?.[0] ?? "uncategorized",
        status: "open",
        severity: null,
        address: address ?? null,
        lat: coord.lat,
        lng: coord.lng,
        created_at: new Date().toISOString(),
        updated_at: null,
      });
    } catch (err) {
      logger.error("emitWebhook(report.created) failed", err, { reportId });
    }
  });

  // OPTIONAL async path (NEXT_PUBLIC_ASYNC_CLASSIFY=1): do NOT await the
  // pipeline. Fire-and-forget so the UI shows the thanks screen instantly, then
  // return a neutral pending classification (confidence 0). The resident page
  // subscribes to Supabase Realtime on the classifications row to fill in the
  // real result when the background job lands; classify_status was stamped
  // "pending" on insert above and the pipeline flips it to done/failed.
  //
  // Serverless note: a bare non-awaited promise is frozen/reclaimed once the
  // response flushes, so the pipeline would never run and classify_status would
  // stay "pending" forever. next/server's after() schedules the work to run
  // after the response is sent and signals the platform (Vercel's waitUntil) to
  // keep the invocation alive until it settles. The try/catch is the backstop
  // for an unexpected pipeline throw (see below).
  if (ASYNC_CLASSIFY) {
    after(async () => {
      try {
        await runClassifyPipeline(reportId);
      } catch (err) {
        // The pipeline self-logs + stamps classify_status:"failed" for its HANDLED
        // ok:false returns. But an UNEXPECTED throw (createServerClient,
        // photoBlob.arrayBuffer(), generateWorkOrder, or a network-level throw
        // from the supabase client before any markClassifyStatus call) bypasses
        // all of that. Nothing would be logged and classify_status would stay
        // "pending" forever, dead-ending the resident. Backstop here: log the
        // throw to error_log and stamp classify_status:"failed" so an operator has
        // a signal and the report lands in manual triage. Use the service client
        // (RLS-bypassing, no request cookies in this fire-and-forget context).
        const message = err instanceof Error ? err.message : String(err);
        try {
          await service.from("error_log").insert({
            // correlation_id is NOT NULL in the schema; mint one so the backstop
            // write itself doesn't silently fail the constraint.
            correlation_id: crypto.randomUUID(),
            context: "submit-report:async-classify",
            message: `Unhandled classify pipeline throw: ${message}`,
            metadata: { reportId },
          });
          await service
            .from("reports")
            .update({ classify_status: "failed" } as Record<string, unknown>)
            .eq("id", reportId);
        } catch (logErr) {
          // Last resort: even the backstop writes failed. Surface to server logs.
          logger.error(
            "Classify backstop failed (could not persist to error_log)",
            logErr,
            {
              reportId,
              originalError: message,
            },
          );
        }
      }
      // Liability attribution. Runs whether or not classification succeeded
      // (an unclassified report still joins on location and date). Already
      // inside after(), so this awaits without delaying the response.
      await evaluateLiabilityBestEffort(reportId);
    });
    return {
      ok: true,
      data: {
        id: reportId,
        classification: fallbackClassification("Classification pending"),
      },
    };
  }

  // Default synchronous path. Classify directly, no HTTP self-call.
  let classification: Classification;
  try {
    const result = await runClassifyPipeline(reportId);
    classification = result.ok
      ? { ...result.data.classification, is_emergency: result.data.emergency }
      : fallbackClassification(result.error);
  } catch {
    classification = fallbackClassification(
      "Classification service unavailable",
    );
  }

  // Liability attribution on the synchronous path: scheduled with after() so
  // the spatial join never adds latency to (or can fail) the submission.
  after(() => evaluateLiabilityBestEffort(reportId));

  return { ok: true, data: { id: reportId, classification } };
}

const reverseGeocodeSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * Reverse-geocode GPS coordinates into a human-readable address via OpenStreetMap
 * Nominatim, so the report form can pre-fill the editable manual-address field
 * from the acquired fix. Server-side (matches the forward geocoder in
 * onboard/actions.ts) so we can send the required identifying User-Agent, which
 * a browser can't set. Best-effort: returns ok:false on any failure and the
 * caller leaves the field blank for manual entry, geocoding never blocks a
 * report.
 */
export async function reverseGeocode(input: {
  lat: number;
  lng: number;
}): Promise<Result<{ address: string }>> {
  const parsed = reverseGeocodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_coordinates" };
  const { lat, lng } = parsed.data;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`,
      {
        headers: {
          "User-Agent":
            "civic-app/1.0 (+https://civic-social-impact.vercel.app)",
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return { ok: false, error: "geocode_failed" };
    const data = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string | undefined>;
    };

    // Prefer the structured fields. Nominatim's display_name is the full
    // administrative chain, "Tribble Gap Road, Cumming, Forsyth County,
    // Georgia, 30040, United States", which is not how a resident describes
    // where the pothole is, and it overflows the address field on a phone.
    const a = data.address ?? {};
    const street = [a.house_number, a.road ?? a.pedestrian ?? a.footway]
      .filter(Boolean)
      .join(" ")
      .trim();
    const place = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? "";
    const short = [street, place].filter(Boolean).join(", ").trim();

    const address = short || data.display_name?.trim();
    if (!address) return { ok: false, error: "no_address" };
    return { ok: true, data: { address } };
  } catch {
    return { ok: false, error: "geocode_failed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-submit duplicate detection
// ─────────────────────────────────────────────────────────────────────────────

export interface DuplicateCandidate {
  id: string;
  photo_public_url: string;
  address: string | null;
  category: string | null;
  created_at: string;
  distance_m: number;
  score: number;
}

// Bit-count lookup for each nibble (0-15), used server-side for hamming distance.
const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

function hammingDistance(a: string, b: string): number {
  let dist = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dist += NIBBLE_BITS[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  }
  return dist;
}

/**
 * Find existing reports that might be duplicates of an about-to-be-submitted
 * report.  Called client-side just before the user hits Submit; if a strong
 * candidate is found the UI shows a side-by-side comparison so the resident
 * can confirm or deny before any upload happens.
 *
 * Scoring (all components in [0, 1]):
 *   50% location. How close is the existing report geographically?
 *   30% visual, hamming distance between aHash values (0.5 if hash missing)
 *   20% category, exact match / mismatch / unknown (0.5)
 * Threshold: 0.5. Below this we don't show the warning.
 */
export async function checkPotentialDuplicate(params: {
  lat: number;
  lng: number;
  phash: string;
  category?: string | null;
}): Promise<Result<DuplicateCandidate[]>> {
  const service = createServerClient();

  type NearbyRow = {
    id: string;
    photo_public_url: string;
    address: string | null;
    created_at: string;
    photo_phash: string | null;
    category: string | null;
    distance_m: number;
  };

  const { data, error } = await service.rpc("find_nearby_open_reports", {
    _lat: params.lat,
    _lng: params.lng,
    _radius_m: 200,
    _window_days: 30,
  });

  if (error) {
    logger.warn("find_nearby_open_reports failed", { error: error.message });
    return { ok: true, data: [] };
  }

  const rows = (data ?? []) as NearbyRow[];
  const candidates: DuplicateCandidate[] = [];

  for (const row of rows) {
    const locationScore = Math.max(0, 1 - row.distance_m / 200);

    const visualScore =
      row.photo_phash && params.phash
        ? 1 - hammingDistance(params.phash, row.photo_phash) / 64
        : 0.5;

    const categoryScore =
      params.category && row.category
        ? params.category === row.category
          ? 1
          : 0
        : 0.5;

    const score = 0.5 * locationScore + 0.3 * visualScore + 0.2 * categoryScore;

    if (score >= 0.5) {
      candidates.push({
        id: row.id,
        photo_public_url: row.photo_public_url,
        address: row.address,
        category: row.category,
        created_at: row.created_at,
        distance_m: Math.round(row.distance_m),
        score,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return { ok: true, data: candidates.slice(0, 1) };
}

/**
 * User confirmed that their photo shows the same issue as an existing report.
 * We don't upload their photo; we just bump the existing work order's priority
 * so staff know the issue has more sightings.
 *
 * Deliberately callable without a session. Anonymous reporting is a product
 * requirement, and this runs in the pre-submit deflection flow before any
 * account exists. That makes it a public write, so it is guarded three ways:
 * the id must be a UUID, the caller is rate limited, and the target must be a
 * real OPEN report. Previously it passed any caller-supplied string straight
 * into the privilege-escalating service-role RPC, which let anyone inflate the
 * priority of any work order in any city, without limit.
 */
export async function linkAsDuplicate(
  primaryReportId: string,
): Promise<Result<void>> {
  const parsed = z.string().uuid().safeParse(primaryReportId);
  if (!parsed.success) return { ok: false, error: "invalid_report_id" };

  const ip = await callerIp();
  const rl = checkRateLimit(`link-duplicate:${ip}`, {
    windowMs: 60_000,
    max: 10,
  });
  if (!rl.allowed) return { ok: false, error: "rate_limited" };

  const service = createServerClient();

  // Only an existing OPEN report may be bumped. Without this the RPC accepts
  // any UUID, including closed reports and reports in other cities.
  const { data: target } = await service
    .from("reports")
    .select("id, status")
    .eq("id", parsed.data)
    .maybeSingle<{ id: string; status: string }>();
  if (!target) return { ok: false, error: "report_not_found" };
  if (target.status !== "open") return { ok: false, error: "report_not_open" };

  const { error } = await service.rpc("bump_work_order_priority", {
    _report_id: parsed.data,
    _delta: 1,
  });
  if (error) {
    logger.warn("linkAsDuplicate: bump failed", {
      error: error.message,
      primaryReportId: parsed.data,
    });
  }
  return { ok: true, data: undefined };
}

/** Client IP for rate-limit keying inside a server action (no Request object). */
async function callerIp(): Promise<string> {
  const h = await headers();
  const trusted = process.env.RATE_LIMIT_TRUSTED_HEADER?.trim();
  if (trusted) return h.get(trusted)?.trim() || "unknown";
  return (
    h.get("x-real-ip")?.trim() ||
    h.get("cf-connecting-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
