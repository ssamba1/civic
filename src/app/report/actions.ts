"use server";

import { z } from "zod/v4";
import { createServerClient } from "@/lib/db/client";
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

  const supabase = createServerClient();

  // Decode base64 and upload photo to Supabase storage
  const photoBuffer = Buffer.from(photo, "base64");
  const fileName = `reports/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from("photos")
    .upload(fileName, photoBuffer, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    return { ok: false, error: `Photo upload failed: ${uploadError.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("photos").getPublicUrl(fileName);

  // Create report row
  const reportId = crypto.randomUUID();
  const { error: insertError } = await supabase.from("reports").insert({
    id: reportId,
    location: location ? `POINT(${location.lng} ${location.lat})` : null,
    photo_public_url: publicUrl,
    address,
    description,
    status: "open",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    return {
      ok: false,
      error: `Failed to create report: ${insertError.message}`,
    };
  }

  // Call AI classify endpoint
  let classification: Classification;
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.VERCEL_URL ??
      "http://localhost:3000";
    const origin = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;

    const classifyRes = await fetch(`${origin}/api/ai/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo_url: publicUrl, report_id: reportId }),
    });

    if (!classifyRes.ok) {
      // Classification failed but report is saved — return with default
      classification = {
        category: "other",
        subcategory: "unclassified",
        severity: 3,
        hazard_radius_m: 0,
        visible_size_estimate: "unknown",
        is_emergency: false,
        confidence: 0,
        reasoning: "Classification service unavailable",
      };
    } else {
      classification = await classifyRes.json();
    }
  } catch {
    classification = {
      category: "other",
      subcategory: "unclassified",
      severity: 3,
      hazard_radius_m: 0,
      visible_size_estimate: "unknown",
      is_emergency: false,
      confidence: 0,
      reasoning: "Classification service unavailable",
    };
  }

  // Update report with classification data
  await supabase
    .from("reports")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", reportId);

  return { ok: true, data: { id: reportId, classification } };
}
