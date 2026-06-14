import {
  AI_WORK_ORDER,
  ASYNC_CLASSIFY,
  DEDUP_REPORTS,
  GEMINI_MODEL,
} from "@/lib/ai/config";
import { findDuplicate } from "@/lib/ai/dedup";
import { classifyPhoto } from "@/lib/ai/gemini";
import { generateWorkOrderAI } from "@/lib/ai/work-order-ai";
import { generateWorkOrder } from "@/lib/ai/work-order-rules";
import { createServerClient } from "@/lib/db/client";
import { sniffImageMime } from "@/lib/image/sniff-mime";
import { createLogger } from "@/lib/logger";
import type {
  Classification,
  Result,
  WorkOrder,
  WorkOrderSource,
} from "@/lib/types";

export interface ClassifyPipelineResult {
  emergency: boolean;
  classification: Classification;
  work_order: WorkOrder | null;
  /** True when the report was detected as a duplicate and merged into another. */
  merged?: boolean;
  /** The earlier report this one was merged into, when merged. */
  primary_report_id?: string;
}

type SupabaseLike = ReturnType<typeof createServerClient>;

/**
 * Async-only: stamp reports.classify_status so the resident UI's Realtime
 * subscription (and the worker dequeue index) can observe job lifecycle.
 *
 * Flag-gated AND no-op-safe:
 *  - When ASYNC_CLASSIFY is OFF this is a hard no-op, so the synchronous demo
 *    path NEVER references the classify_status column. The column ships in
 *    migration 007, which is NOT auto-applied — so any unguarded reference
 *    would break the default sync path on un-migrated databases.
 *  - Errors are logged, never thrown: a missing column / failed write must not
 *    abort the pipeline (the demo thread must never break).
 */
async function markClassifyStatus(
  supabase: SupabaseLike,
  reportId: string,
  status: "done" | "failed",
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  if (!ASYNC_CLASSIFY) return;
  // Separate update — intentionally NOT merged into the status:"dispatched"
  // write, so a missing column can only drop the status stamp, never the
  // primary report status transition.
  // classify_status ships in migration 007 but isn't reflected in the generated
  // Supabase types yet — cast the patch so the typed .update() accepts it.
  const patch = { classify_status: status } as Record<string, unknown>;
  const { error } = await supabase
    .from("reports")
    .update(patch)
    .eq("id", reportId);
  if (error) {
    log.error(`classify_status update failed for ${reportId}`, undefined, {
      reportId,
      status,
      error: error.message,
    });
  }
}

/**
 * Stamp est_cost + wo_source (+ AI rationale) on a work order. Separate guarded
 * write — these columns ship in migrations 010/013, which are NOT auto-applied.
 * Mirroring markClassifyStatus, a missing column logs an error but never throws,
 * so the core work_orders insert (which omits these columns) still succeeds on
 * an un-migrated database. The demo thread must never break.
 */
async function stampWorkOrderCost(
  supabase: SupabaseLike,
  workOrderId: string,
  estCost: number,
  source: WorkOrderSource,
  rationale: string | null,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  const patch = {
    est_cost: estCost,
    wo_source: source,
    wo_rationale: rationale,
  } as Record<string, unknown>;
  const { error } = await supabase
    .from("work_orders")
    .update(patch)
    .eq("id", workOrderId);
  if (error) {
    log.error(`work_order cost stamp failed for ${workOrderId}`, undefined, {
      workOrderId,
      estCost,
      source,
      error: error.message,
    });
  }
}

/**
 * Core classify pipeline — fetches the report photo from storage, runs Gemini,
 * persists the classification + work order, and updates report status.
 *
 * Called directly from server actions (no HTTP round-trip) and from the
 * /api/ai/classify route handler after auth checks.
 */
export async function runClassifyPipeline(
  reportId: string,
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
    await markClassifyStatus(supabase, reportId, "failed", log);
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
  let classificationResult: Result<{
    classification: Classification;
    rawText: string;
  }>;
  // Sniffed MIME of the downloaded bytes; hoisted so the upsert below can
  // record it. Defaults to image/jpeg (the raw bucket is orientation-baked JPEG).
  let sniffed = "image/jpeg";
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
    const bytes = new Uint8Array(await photoBlob.arrayBuffer());
    sniffed = sniffImageMime(bytes) ?? "image/jpeg";
    const imageBase64 = Buffer.from(bytes).toString("base64");
    classificationResult = await classifyPhoto(imageBase64, sniffed);
  }

  // Resilience: if Gemini fails (network/rate/latency), DON'T abort the
  // pipeline — fall back to a neutral classification so a work order is still
  // created and the report reaches the staff inbox. The demo thread never breaks.
  let classification: Classification;
  let modelVersion = GEMINI_MODEL;
  // Persist what the model ACTUALLY returned (raw text + sniffed mime), not the
  // parsed object. On the fallback branch there is no model output.
  let rawResponse: Record<string, unknown>;
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
      reasoning:
        "Automatic classification unavailable — queued for manual triage.",
    };
    modelVersion = "fallback";
    rawResponse = { fallback: true };
  } else {
    classification = classificationResult.data.classification;
    rawResponse = { text: classificationResult.data.rawText, mime: sniffed };
    log.info("gemini_ok", {
      reportId,
      category: classification.category,
      confidence: classification.confidence,
    });
  }

  const { error: classErr } = await supabase.from("classifications").upsert(
    {
      report_id: reportId,
      ...classification,
      model_version: modelVersion,
      raw_response: rawResponse,
    },
    { onConflict: "report_id" },
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
    await markClassifyStatus(supabase, reportId, "failed", log);
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

    await markClassifyStatus(supabase, reportId, "done", log);
    log.info("pipeline_done_emergency", { reportId });
    return {
      ok: true,
      data: { emergency: true, classification, work_order: null },
    };
  }

  // Duplicate detection (non-emergency only — emergencies are never suppressed).
  // A match marks THIS report 'merged', records a merges row, and skips the work
  // order so duplicate reports don't inflate the dispatch queue. Flag-gated +
  // no-op-safe: findDuplicate returns null on an un-migrated DB (missing RPC).
  if (DEDUP_REPORTS) {
    const dup = await findDuplicate(supabase, reportId, log);
    if (dup) {
      const { error: mergeErr } = await supabase.from("merges").insert({
        primary_report_id: dup.primaryReportId,
        duplicate_report_id: reportId,
        similarity_score: dup.similarityScore,
      });
      if (mergeErr) {
        // Could not record the merge — do NOT mark the report merged (that would
        // orphan it with no link to its primary). Fall through to normal
        // work-order creation instead.
        log.error("merge_insert_failed_falling_through", undefined, {
          reportId,
          primary: dup.primaryReportId,
          error: mergeErr.message,
        });
      } else {
        const { error: statusErr } = await supabase
          .from("reports")
          .update({ status: "merged" })
          .eq("id", reportId);
        if (statusErr) {
          log.error(`merged status update failed for ${reportId}`, undefined, {
            reportId,
            error: statusErr.message,
          });
        }
        await markClassifyStatus(supabase, reportId, "done", log);
        log.info("pipeline_done_merged", {
          reportId,
          primary: dup.primaryReportId,
          distanceM: dup.distanceM,
          similarity: dup.similarityScore,
        });
        return {
          ok: true,
          data: {
            emergency: false,
            classification,
            work_order: null,
            merged: true,
            primary_report_id: dup.primaryReportId,
          },
        };
      }
    }
  }

  // Deterministic rules work order: always computed. Provides the auditable
  // priority_score, an est_cost floor, and the fallback crew/materials/minutes
  // when the AI generator is disabled or fails.
  const rulesWorkOrder = generateWorkOrder(classification, {
    isSchoolZone: false,
    footTrafficWeight: 1,
    recurrenceCount: 0,
  });

  // Effective work order fields. Start from rules; override with AI output when
  // AI_WORK_ORDER is enabled AND the AI call succeeds. priority_score ALWAYS
  // stays deterministic — the AI sizes crew/materials/minutes/cost, not the
  // dispatch priority math.
  let department = rulesWorkOrder.department;
  let crewType = rulesWorkOrder.crew_type;
  let estMinutes = rulesWorkOrder.est_minutes;
  let materials: string[] = rulesWorkOrder.materials;
  let estCost = rulesWorkOrder.est_cost;
  let woSource: WorkOrderSource = "rules";
  // AI rationale explaining crew/time/materials/cost sizing; null on rules path.
  let woRationale: string | null = null;

  if (AI_WORK_ORDER) {
    const aiResult = await generateWorkOrderAI(classification);
    if (aiResult.ok) {
      department = aiResult.data.department;
      crewType = aiResult.data.crew_type;
      estMinutes = aiResult.data.est_minutes;
      materials = aiResult.data.materials;
      estCost = aiResult.data.est_cost;
      woRationale = aiResult.data.rationale;
      woSource = "ai";
      log.info("work_order_ai_ok", { reportId, estCost, crewType });
    } else {
      log.error("work_order_ai_failed_using_rules", undefined, {
        reportId,
        error: aiResult.error,
      });
    }
  }

  const { data: insertedWorkOrder, error: woErr } = await supabase
    .from("work_orders")
    .insert({
      report_id: reportId,
      department,
      crew_type: crewType,
      priority_score: rulesWorkOrder.priority_score,
      est_minutes: estMinutes,
      materials,
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
    await markClassifyStatus(supabase, reportId, "failed", log);
    return { ok: false, error: msg };
  }

  // Persist est_cost + provenance via a separate guarded write (migration 010
  // columns; no-op-safe on un-migrated DBs). Reflect them on the returned row
  // so callers/UI see the cost without a re-read.
  await stampWorkOrderCost(
    supabase,
    insertedWorkOrder.id,
    estCost,
    woSource,
    woRationale,
    log,
  );
  insertedWorkOrder.est_cost = estCost;
  insertedWorkOrder.wo_source = woSource;
  insertedWorkOrder.wo_rationale = woRationale;

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

  await markClassifyStatus(supabase, reportId, "done", log);
  log.info("pipeline_done", {
    reportId,
    workOrderId: insertedWorkOrder.id,
    priority: insertedWorkOrder.priority_score,
    estCost,
    woSource,
  });
  return {
    ok: true,
    data: { emergency: false, classification, work_order: insertedWorkOrder },
  };
}
