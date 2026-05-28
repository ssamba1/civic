"use server";

import { z } from "zod/v4";
import { createServerClient } from "@/lib/db/client";
import { createSSRClient } from "@/lib/db/ssr-client";
import { runClassifyPipeline } from "@/lib/ai/classify-pipeline";
import type { Result, Classification } from "@/lib/types";

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
  address: z.string().nullable(),
  description: z.string().max(500).nullable(),
  tags: z.array(z.string().max(40)).max(8).default([]),
});

type SubmitReportInput = z.infer<typeof submitReportSchema>;

const PUBLIC_BUCKET = "photos-public";
const RAW_BUCKET = "photos-raw";

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
  };
}

export async function submitReport(
  input: SubmitReportInput
): Promise<Result<{ id: string; classification: Classification }>> {
  const parsed = submitReportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) };
  }
  const { photoBlurred, photoOriginal, location, address, description, tags } = parsed.data;

  // reports.location is NOT NULL geography(POINT,4326) — GPS required.
  if (!location) {
    return { ok: false, error: "GPS location is required. Enable location and retry." };
  }

  // Auth via cookie-aware SSR client.
  const ssr = await createSSRClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthenticated" };
  }

  const { data: profile, error: profileErr } = await ssr
    .from("users")
    .select("city_id")
    .eq("id", user.id)
    .single<{ city_id: string }>();
  if (profileErr || !profile?.city_id) {
    return { ok: false, error: "No city on your profile. Contact support." };
  }
  const cityId = profile.city_id;

  const reportId = crypto.randomUUID();
  const publicPath = `${cityId}/${reportId}.webp`;
  const rawPath = `${cityId}/${reportId}.jpg`;

  // Upload via service role: storage RLS has no INSERT policy (folder-scoping
  // can't be set via the pooler), so the service role performs the writes.
  // Privacy is preserved because the blur already ran client-side.
  const service = createServerClient();

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
  const { error: insertErr } = await ssr.from("reports").insert({
    id: reportId,
    city_id: cityId,
    reporter_id: user.id,
    location: `SRID=4326;POINT(${location.lng} ${location.lat})`,
    photo_public_url: publicUrl,
    photo_raw_url: `${RAW_BUCKET}/${rawPath}`,
    address,
    description,
    tags,
    status: "open",
  });
  if (insertErr) {
    await service.storage.from(PUBLIC_BUCKET).remove([publicPath]);
    await service.storage.from(RAW_BUCKET).remove([rawPath]);
    return { ok: false, error: `Failed to create report: ${insertErr.message}` };
  }

  // Classify directly — no HTTP self-call.
  let classification: Classification;
  try {
    const result = await runClassifyPipeline(reportId);
    classification = result.ok
      ? { ...result.data.classification, is_emergency: result.data.emergency }
      : fallbackClassification(result.error);
  } catch {
    classification = fallbackClassification("Classification service unavailable");
  }

  return { ok: true, data: { id: reportId, classification } };
}
