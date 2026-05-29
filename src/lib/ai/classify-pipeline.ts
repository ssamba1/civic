import { createServerClient } from "@/lib/db/client";
import { classifyPhoto } from "@/lib/ai/gemini";
import { generateWorkOrder } from "@/lib/ai/work-order-rules";
import { createLogger } from "@/lib/logger";
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
  const log = createLogger("classify-pipeline");
  const supabase = createServerClient();

  log.info("pipeline_start", { reportId });

  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("id, city_id")
    .eq("id", reportId)
    .single();

  if (reportErr || !report) {
    const msg = `Report not found: ${reportErr?.message ?? "no rows"}`;
    log.error(msg, undefined, { reportId });
    await supabase.from("error_log").insert({
      correlation_id: log.correlationId,
      context: "classify-pipeline",
      message: msg,
      metadata: { reportId },
    });
    return { ok: false, error: msg };
  }

  // Classify the RAW (unblurred) image for accuracy — the public copy has
  // faces/plates blurred which degrades classification.
  const storagePath = `${report.city_id}/${report.id}.jpg`;
  const { data: photoBlob, error: downloadErr } = await supabase.storage
    .from("photos-raw")
    .download(storagePath);

  // Resilience: a missing/failed raw download must not abort the pipeline —
  // skip Gemini and fall back so a work order is still created.
  let classificationResult: Result<Classification>;
  if (downloadErr || !photoBlob) {
    const msg = `Photo download failed: ${downloadErr?.message ?? "empty blob"}`;
    log.error(msg, undefined, { reportId, storagePath });
    await supabase.from("error_log").insert({
      correlation_id: log.correlationId,
      context: "classify-pipeline",
      message: msg,
      metadata: { reportId, storagePath },
    });
    classificationResult = { ok: false, error: msg };
  } else {
    log.info("photo_downloaded", { reportId, storagePath });
    const imageBase64 = Buffer.from(await photoBlob.arrayBuffer()).toString("base64");
    classificationResult = await classifyPhoto(imageBase64, "image/jpeg");
  }

  // Resilience: if Gemini fails (network/rate/latency), DON'T abort the
  // pipeline — fall back to a neutral classification so a work order is still
  // created and the report reaches the staff inbox. The demo thread never breaks.
  let classification: Classification;
  let modelVersion = "gemini-2.5-flash";
  if (!classificationResult.ok) {
    log.error("gemini_classify_failed_using_fallback", undefined, {
      reportId,
      error: classificationResult.error,
    });
    await supabase.from("error_log").insert({
      correlation_id: log.correlationId,
      context: "classify-pipeline",
      message: classificationResult.error,
      metadata: { reportId, stage: "gemini" },
    });
    classification = {
      category: "other",
      subcategory: "needs review",
      severity: 3,
      hazard_radius_m: 0,
      visible_size_estimate: "unknown",
      is_emergency: false,
      confidence: 0,
      reasoning: "Automatic classification unavailable — queued for manual triage.",
    };
    modelVersion = "fallback";
  } else {
    classification = classificationResult.data;
    log.info("gemini_ok", {
      reportId,
      category: classification.category,
      confidence: classification.confidence,
    });
  }

  const { error: classErr } = await supabase
    .from("classifications")
    .upsert(
      {
        report_id: reportId,
        ...classification,
        model_version: modelVersion,
        raw_response: classification,
      },
      { onConflict: "report_id" }
    );

  if (classErr) {
    const msg = `Classification insert failed: ${classErr.message}`;
    log.error(msg, undefined, { reportId });
    await supabase.from("error_log").insert({
      correlation_id: log.correlationId,
      context: "classify-pipeline",
      message: msg,
      metadata: { reportId, stage: "upsert_classification" },
    });
    return { ok: false, error: msg };
  }

  log.info("classification_persisted", { reportId });

  if (classification.is_emergency) {
    const { error: statusErr } = await supabase
      .from("reports")
      .update({ status: "dispatched" })
      .eq("id", reportId);

    if (statusErr) {
      log.error(`status update failed for ${reportId}`, undefined, {
        reportId,
        error: statusErr.message,
      });
    }

    log.info("pipeline_done_emergency", { reportId });
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
    const msg = `Work order insert failed: ${woErr?.message ?? "no data"}`;
    log.error(msg, undefined, { reportId });
    await supabase.from("error_log").insert({
      correlation_id: log.correlationId,
      context: "classify-pipeline",
      message: msg,
      metadata: { reportId, stage: "work_order_insert" },
    });
    return { ok: false, error: msg };
  }

  const { error: statusErr } = await supabase
    .from("reports")
    .update({ status: "dispatched" })
    .eq("id", reportId);

  if (statusErr) {
    log.error(`status update failed for ${reportId}`, undefined, {
      reportId,
      error: statusErr.message,
    });
  }

  log.info("pipeline_done", {
    reportId,
    workOrderId: insertedWorkOrder.id,
    priority: insertedWorkOrder.priority_score,
  });
  return { ok: true, data: { emergency: false, classification, work_order: insertedWorkOrder } };
}
