"use server";

import { after } from "next/server";
import { z } from "zod/v4";
import { runClassifyPipeline } from "@/lib/ai/classify-pipeline";
import { ASYNC_CLASSIFY } from "@/lib/ai/config";
import { createServerClient } from "@/lib/db/client";
import { createSSRClient } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import type { Classification, Result } from "@/lib/types";

const logger = createLogger("[submit-report]");

const submitReportSchema = z.object({
  // Both images are base64 (no data-URL prefix). Blurred → public bucket,
  // original → raw bucket. Blur happens client-side before this runs.
  photoBlurred: z.string().min(1, "Blurred photo is required"),
  photoOriginal: z.string().min(1, "Original photo is required"),
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
});

type SubmitReportInput = z.infer<typeof submitReportSchema>;

const PUBLIC_BUCKET = "photos-public";
const RAW_BUCKET = "photos-raw";

// Demo default city. Fresh guest/anon submitters have no public.users row, and
// no-GPS submits have no coordinate — both fall back to this city. Set to
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

export async function submitReport(
  input: SubmitReportInput,
): Promise<Result<{ id: string; classification: Classification }>> {
  const parsed = submitReportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) };
  }
  const { photoBlurred, photoOriginal, location, address, description, tags } =
    parsed.data;

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
      // the report can be scoped — never touch role/email of an existing user.
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
  const publicPath = `${cityId}/${reportId}.webp`;
  const rawPath = `${cityId}/${reportId}.jpg`;

  // Upload via service role: storage RLS has no INSERT policy (folder-scoping
  // can't be set via the pooler), so the service role performs the writes.
  // Privacy is preserved because the blur already ran client-side.
  const { error: pubErr } = await service.storage
    .from(PUBLIC_BUCKET)
    .upload(publicPath, Buffer.from(photoBlurred, "base64"), {
      contentType: "image/webp",
      upsert: false,
    });
  if (pubErr) {
    return { ok: false, error: `Photo upload failed: ${pubErr.message}` };
  }

  const { error: rawErr } = await service.storage
    .from(RAW_BUCKET)
    .upload(rawPath, Buffer.from(photoOriginal, "base64"), {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (rawErr) {
    await service.storage.from(PUBLIC_BUCKET).remove([publicPath]);
    return { ok: false, error: `Raw upload failed: ${rawErr.message}` };
  }

  const {
    data: { publicUrl },
  } = service.storage.from(PUBLIC_BUCKET).getPublicUrl(publicPath);

  // Insert the report via the SSR client so RLS is the backstop
  // (reporter_id = auth.uid(), city_id = current_user_city_id()).
  //
  // Flag-gated: the async path stamps classify_status:"pending" so the resident
  // UI can subscribe for the result. The classify_status column ships in
  // migration 007 (NOT auto-applied), so the synchronous default path must
  // NEVER reference it — keep the flag-off insert byte-identical to before.
  const reportRow = {
    id: reportId,
    city_id: cityId,
    reporter_id: user.id,
    location: `SRID=4326;POINT(${coord.lng} ${coord.lat})`,
    photo_public_url: publicUrl,
    photo_raw_url: `${RAW_BUCKET}/${rawPath}`,
    address,
    description,
    tags,
    status: "open",
    // classify_status is only stamped on the async path; the column ships in
    // migration 007 but isn't reflected in the generated Supabase types yet, so
    // attach it via a typed-loose record only when async is ON. The flag-off
    // insert is the bare reportRow — byte-identical to the original behavior.
    ...(ASYNC_CLASSIFY ? { classify_status: "pending" } : {}),
  } as Record<string, unknown>;
  const { error: insertErr } = await ssr.from("reports").insert(reportRow);
  if (insertErr) {
    await service.storage.from(PUBLIC_BUCKET).remove([publicPath]);
    await service.storage.from(RAW_BUCKET).remove([rawPath]);
    return {
      ok: false,
      error: `Failed to create report: ${insertErr.message}`,
    };
  }

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
        // all of that — nothing would be logged and classify_status would stay
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
    });
    return {
      ok: true,
      data: {
        id: reportId,
        classification: fallbackClassification("Classification pending"),
      },
    };
  }

  // Default synchronous path — classify directly, no HTTP self-call.
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
 * caller leaves the field blank for manual entry — geocoding never blocks a
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
    const data = (await res.json()) as { display_name?: string };
    const address = data.display_name?.trim();
    if (!address) return { ok: false, error: "no_address" };
    return { ok: true, data: { address } };
  } catch {
    return { ok: false, error: "geocode_failed" };
  }
}
