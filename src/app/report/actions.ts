"use server";

import { z } from "zod/v4";
import { createServerClient } from "@/lib/db/client";
import { createSSRClient } from "@/lib/db/ssr-client";
import { blurFacesAndPlates } from "@/lib/privacy/blur";
import { uploadReportPhotos } from "@/lib/privacy/upload";
import { runClassifyPipeline } from "@/lib/ai/classify-pipeline";
import type { Result, Classification } from "@/lib/types";

const submitReportSchema = z.object({
  photo: z.string().min(1, "Photo is required"),
  location: z
    .object({
      lng: z.number().min(-180).max(180),
      lat: z.number().min(-90).max(90),
    })
    .nullable(),
  address: z.string().nullable(),
  description: z.string().max(500).nullable(),
});

type SubmitReportInput = z.infer<typeof submitReportSchema>;

export async function submitReport(
  input: SubmitReportInput
): Promise<Result<{ id: string; classification: Classification }>> {
  // Validate
  const parsed = submitReportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) };
  }

  const { photo, location, address, description } = parsed.data;

  if (!location && !address) {
    return { ok: false, error: "Either GPS location or address is required." };
  }

  // C2 — Auth check: get authenticated user via SSR client (cookie-based session)
  const ssrClient = await createSSRClient();
  const {
    data: { user },
    error: authError,
  } = await ssrClient.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "unauthenticated" };
  }

  // C2 — Look up city_id from user profile
  const { data: profile, error: profileError } = await ssrClient
    .from("users")
    .select("city_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.city_id) {
    return { ok: false, error: "User profile not found or missing city." };
  }

  const cityId: string = profile.city_id;

  // Service-role client for privileged operations (rate limit check, insert)
  const supabase = createServerClient();

  // M6 — Rate limiting: max 10 reports per user per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("reporter_id", user.id)
    .gte("created_at", oneHourAgo);

  if (countError) {
    return { ok: false, error: `Rate limit check failed: ${countError.message}` };
  }

  if ((count ?? 0) >= 10) {
    return { ok: false, error: "rate_limited" };
  }

  // C1 — Decode base64 photo to Blob, apply privacy blur
  const photoBlob = await fetch(`data:image/jpeg;base64,${photo}`).then((r) =>
    r.blob()
  );

  const blurResult = await blurFacesAndPlates(photoBlob);

  // Generate report ID before upload so paths use it
  const reportId = crypto.randomUUID();

  // C1 + C3 — Upload blurred + original via privacy upload (handles bucket/path correctly)
  const uploadResult = await uploadReportPhotos(
    blurResult.blurred,
    blurResult.original,
    reportId,
    cityId
  );

  if (!uploadResult.ok) {
    return { ok: false, error: `Photo upload failed: ${uploadResult.error}` };
  }

  const { publicUrl } = uploadResult.data;

  // C2 — Create report row with city_id and reporter_id
  const { error: insertError } = await supabase.from("reports").insert({
    id: reportId,
    location: location ? `SRID=4326;POINT(${location.lng} ${location.lat})` : null,
    photo_public_url: publicUrl,
    address,
    description,
    status: "open",
    city_id: cityId,
    reporter_id: user.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    return {
      ok: false,
      error: `Failed to create report: ${insertError.message}`,
    };
  }

  // Call AI classify pipeline directly — no HTTP round-trip, no cookie forwarding issue
  const fallbackClassification: Classification = {
    category: "other",
    subcategory: "unclassified",
    severity: 3,
    hazard_radius_m: 0,
    visible_size_estimate: "unknown",
    is_emergency: false,
    confidence: 0,
    reasoning: "Classification service unavailable",
  };

  let finalClassification: Classification = fallbackClassification;
  try {
    const pipelineResult = await runClassifyPipeline(reportId);
    if (pipelineResult.ok) {
      finalClassification = {
        ...pipelineResult.data.classification,
        is_emergency: pipelineResult.data.emergency,
      };
    }
  } catch {
    // Classification failed — report already saved, caller receives fallback
  }

  return { ok: true, data: { id: reportId, classification: finalClassification } };
}
