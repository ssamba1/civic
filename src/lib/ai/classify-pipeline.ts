import { createServerClient } from "@/lib/db/client";
import { classifyPhoto } from "@/lib/ai/gemini";
import { generateWorkOrder } from "@/lib/ai/work-order-rules";
import type { Classification, WorkOrder, Result } from "@/lib/types";

export interface ClassifyPipelineResult {
  emergency: boolean;
  classification: Classification;
  work_order: WorkOrder | null;
}

/**
 * Core classify pipeline — fetches the report photo from storage, runs Gemini,
 * persists the classification + work order, and updates report status.
 *
 * Called directly from server actions (no HTTP round-trip) and from the
 * /api/ai/classify route handler after auth checks.
 */
export async function runClassifyPipeline(
  reportId: string
): Promise<Result<ClassifyPipelineResult>> {
  const supabase = createServerClient();

  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, city_id")
    .eq("id", reportId)
    .single();

  if (reportErr || !report) {
    return { ok: false, error: `Report not found: ${reportErr?.message ?? "no rows"}` };
  }

  // Classify the RAW (unblurred) image for accuracy — the public copy has
  // faces/plates blurred which degrades classification.
  const storagePath = `${report.city_id}/${report.id}.jpg`;
  const { data: photoBlob, error: downloadErr } = await supabase.storage
    .from("photos-raw")
    .download(storagePath);

  if (downloadErr || !photoBlob) {
    return {
      ok: false,
      error: `Photo download failed: ${downloadErr?.message ?? "empty blob"}`,
    };
  }

  const imageBase64 = Buffer.from(await photoBlob.arrayBuffer()).toString("base64");
  const classificationResult = await classifyPhoto(imageBase64, "image/jpeg");
  if (!classificationResult.ok) {
    return { ok: false, error: classificationResult.error };
  }
  const classification = classificationResult.data;

  const { error: classErr } = await supabase
    .from("classifications")
    .upsert(
      {
        report_id: reportId,
        ...classification,
        model_version: "gemini-2.5-flash",
        raw_response: classification,
      },
      { onConflict: "report_id" }
    );

  if (classErr) {
    return { ok: false, error: `Classification insert failed: ${classErr.message}` };
  }

  if (classification.is_emergency) {
    const { error: statusErr } = await supabase
      .from("reports")
      .update({ status: "dispatched" })
      .eq("id", reportId);

    if (statusErr) {
      console.error(`[classify] status update failed for ${reportId}: ${statusErr.message}`);
    }

    return { ok: true, data: { emergency: true, classification, work_order: null } };
  }

  const workOrder = generateWorkOrder(classification, {
    isSchoolZone: false,
    footTrafficWeight: 1,
    recurrenceCount: 0,
  });

  const { data: insertedWorkOrder, error: woErr } = await supabase
    .from("work_orders")
    .insert({
      report_id: reportId,
      department: workOrder.department,
      crew_type: workOrder.crew_type,
      priority_score: workOrder.priority_score,
      est_minutes: workOrder.est_minutes,
      materials: workOrder.materials,
    })
    .select()
    .single<WorkOrder>();

  if (woErr || !insertedWorkOrder) {
    return { ok: false, error: `Work order insert failed: ${woErr?.message ?? "no data"}` };
  }

  const { error: statusErr } = await supabase
    .from("reports")
    .update({ status: "dispatched" })
    .eq("id", reportId);

  if (statusErr) {
    console.error(`[classify] status update failed for ${reportId}: ${statusErr.message}`);
  }

  return { ok: true, data: { emergency: false, classification, work_order: insertedWorkOrder } };
}
