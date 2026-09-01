import { mergeCategoryDefs } from "@/lib/ai/categories";
import {
  AI_CREW_ASSIGN,
  AI_WORK_ORDER,
  ASYNC_CLASSIFY,
  DEDUP_REPORTS,
  GEMINI_MODEL,
} from "@/lib/ai/config";
import { autoAssignCrew } from "@/lib/ai/crew-assign";
import { findDuplicate } from "@/lib/ai/dedup";
import { classifyPhoto } from "@/lib/ai/gemini";
import { gradeHazard } from "@/lib/ai/hazard-grade";
import { buildCorrectionGuidance, type PromptCrew } from "@/lib/ai/prompt";
import { generateWorkOrderAI } from "@/lib/ai/work-order-ai";
import { generateWorkOrder } from "@/lib/ai/work-order-rules";
import { fetchCorrectionExamples } from "@/lib/db/classification-feedback";
import { createServerClient } from "@/lib/db/client";
import { fetchActiveCrewTypeDefs } from "@/lib/db/crew-types";
import { fetchCustomCategoryDefs } from "@/lib/db/issue-types";
import { buildPhotoPaths } from "@/lib/db/report-photos";
import { fetchSlaHours } from "@/lib/db/sla-targets";
import { sniffImageMime } from "@/lib/image/sniff-mime";
import { createLogger } from "@/lib/logger";
import { resolveTeamKeyForCategory } from "@/lib/onboarding/city-teams";
import { resolveOwningCity } from "@/lib/routing/jurisdiction";
import { autoAssignUnit } from "@/lib/routing/org-units";
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
  /** True when the report was held for human review instead of auto-dispatched. */
  needs_manual_review?: boolean;
  /** Why it was flagged, when needs_manual_review is true. */
  review_reason?: string | null;
  /** True when the report was detected as a duplicate and merged into another. */
  merged?: boolean;
  /** The earlier report this one was merged into, when merged. */
  primary_report_id?: string;
}

type SupabaseLike = ReturnType<typeof createServerClient>;

/**
 * Active crews (name/type/description) for the ## CREWS prompt section.
 * Best-effort: [] on any failure, including a pre-032 DB where
 * crews.description doesn't exist yet. Keeps the prompt byte-identical to
 * the no-crews form, so the AI call itself never depends on this data.
 */
async function fetchPromptCrews(
  supabase: SupabaseLike,
  cityId: string,
  log: ReturnType<typeof createLogger>,
): Promise<PromptCrew[]> {
  try {
    const { data, error } = await supabase
      .from("crews")
      .select("name, crew_type, description")
      .eq("city_id", cityId)
      .eq("active", true);
    if (error) {
      log.warn("prompt_crews_query_failed", { cityId, error: error.message });
      return [];
    }
    return (
      (data ?? []) as {
        name: string;
        crew_type: string | null;
        description: string | null;
      }[]
    ).map((c) => ({
      name: c.name,
      crewType: c.crew_type,
      description: c.description ?? "",
    }));
  } catch (err) {
    log.warn("prompt_crews_threw", {
      cityId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Async-only: stamp reports.classify_status so the resident UI's Realtime
 * subscription (and the worker dequeue index) can observe job lifecycle.
 *
 * Flag-gated AND no-op-safe:
 *  - When ASYNC_CLASSIFY is OFF this is a hard no-op, so the synchronous demo
 *    path NEVER references the classify_status column. The column ships in
 *    migration 007, which is NOT auto-applied, so any unguarded reference
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
  // Separate update, intentionally NOT merged into the status:"dispatched"
  // write, so a missing column can only drop the status stamp, never the
  // primary report status transition.
  // classify_status ships in migration 007 but isn't reflected in the generated
  // Supabase types yet, cast the patch so the typed .update() accepts it.
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
 * write. These columns ship in migrations 010/013, which are NOT auto-applied.
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
 * Core classify pipeline. Fetches the report photo from storage, runs Gemini,
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

  // Classify the RAW (unblurred) image for accuracy. The public copy has
  // faces/plates blurred which degrades classification.
  //
  // The path comes from buildPhotoPaths, the SAME function the upload writes
  // with, rather than being spelled out again here. It used to be spelled out
  // here, as `${city_id}/${id}.jpg`, and that stopped being where photos live
  // the day multi-photo submission moved them into a per-report folder
  // (`${city_id}/${id}/${idx}.jpg`). The download then missed on every newly
  // submitted report: storage answered "Object not found", the guard below
  // swallowed it exactly as designed, and every report a resident filed came
  // out classified `other` at confidence 0 with no crew, while the seeded
  // reports still looked perfect, because the seed writes classifications
  // directly instead of going through this pipeline.
  //
  // Index 0 is the primary photo, which is the one reports.photo_raw_url points
  // at. Deriving it keeps the reader from drifting from the writer again.
  const storagePath = buildPhotoPaths(report.city_id, report.id, 1)[0].rawPath;
  const { data: photoBlob, error: downloadErr } = await supabase.storage
    .from("photos-raw")
    .download(storagePath);

  // Resilience: a missing/failed raw download must not abort the pipeline.
  // Skip Gemini and fall back so a work order is still created.
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
    // OUTFLANK #7, inject this city's past staff corrections as few-shot
    // guidance. Best-effort: empty string on a fresh city or any error, so the
    // base prompt (and thus classification behaviour) is unchanged.
    const corrections = await fetchCorrectionExamples(report.city_id);
    const guidance = buildCorrectionGuidance(corrections);
    if (guidance) {
      log.info("classify_correction_guidance", {
        reportId,
        pairs: corrections.length,
      });
    }
    // Issue #6, offer this city's custom issue types (with AI descriptions)
    // alongside the built-ins, so a runtime-added category can be auto-classified.
    // Best-effort: [] on any failure keeps classification to the 12 built-ins.
    const customCategories = await fetchCustomCategoryDefs(report.city_id);
    if (customCategories.length > 0) {
      log.info("classify_custom_categories", {
        reportId,
        count: customCategories.length,
      });
    }
    const categories = mergeCategoryDefs(customCategories);
    classificationResult = await classifyPhoto(
      imageBase64,
      sniffed,
      guidance,
      categories,
    );
  }

  // Resilience: if Gemini fails (network/rate/latency), DON'T abort the
  // pipeline. Fall back to a neutral classification so a work order is still
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
        "Automatic classification unavailable, queued for manual triage.",
      no_issue_detected: false,
      alternate_categories: [],
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

  // Optional hazard grading, best-effort; never blocks or aborts the pipeline.
  // Stamps hazard_severity + hazard_rationale on the reports row (migration 044).
  // Skipped gracefully on fallback classification (no image) or any Gemini error.
  if (classificationResult.ok && photoBlob) {
    try {
      const bytes = new Uint8Array(await photoBlob.arrayBuffer());
      const imageBase64 = Buffer.from(bytes).toString("base64");
      const hazardResult = await gradeHazard({
        imageBase64,
        mimeType: sniffed,
      });
      if (hazardResult.ok) {
        const patch = {
          hazard_severity: hazardResult.data.severity,
          hazard_rationale: hazardResult.data.rationale,
        } as Record<string, unknown>;
        const { error: hazardErr } = await supabase
          .from("reports")
          .update(patch)
          .eq("id", reportId);
        if (hazardErr) {
          log.warn("hazard_grade_stamp_failed", {
            reportId,
            error: hazardErr.message,
          });
        } else {
          log.info("hazard_grade_stamped", {
            reportId,
            severity: hazardResult.data.severity,
            publicSafetyRisk: hazardResult.data.publicSafetyRisk,
          });
        }
      } else {
        log.warn("hazard_grade_failed", {
          reportId,
          error: hazardResult.error,
        });
      }
    } catch (hazardThrow) {
      log.warn("hazard_grade_threw", {
        reportId,
        error:
          hazardThrow instanceof Error
            ? hazardThrow.message
            : String(hazardThrow),
      });
    }
  }

  // Manual-review gate: hold the report at 'open' instead of auto-dispatching
  // when the AI itself signals it isn't confident enough to route this safely.
  // Emergencies always bypass this, life safety never waits on a human.
  // (Previously emergencies short-circuited here and got no work order at all,
  // making the +50 priority term dead code and preventing cost actuals from
  // ever being captured for emergencies. Now they fall through to work order
  // creation with needsManualReview=false and auto-dispatch like normal
  // high-confidence reports, but carrying the +50 priority boost.)
  // A failed/zero-confidence classification is always flagged;
  // otherwise check the model's own uncertainty signals.
  // Emergencies skip the review gate entirely. Auto-dispatch immediately.
  const reviewReasons: string[] = [];
  if (classification.is_emergency) {
    // No review reasons; falls through to work order creation + auto-dispatch.
  } else if (classification.confidence === 0) {
    reviewReasons.push(
      "AI classification unavailable or failed. Needs manual triage",
    );
  } else {
    if (classification.no_issue_detected) {
      reviewReasons.push(
        "AI did not detect any visible damage or issue in the photo",
      );
    }
    if (classification.confidence < 0.5) {
      reviewReasons.push(
        "AI is not confident which category/team this belongs to",
      );
    }
    if (classification.alternate_categories.length > 0) {
      reviewReasons.push(
        `Could belong to multiple teams: ${[classification.category, ...classification.alternate_categories].join(", ")}`,
      );
    }
  }
  const needsManualReview = reviewReasons.length > 0;
  const reviewReason = needsManualReview ? reviewReasons.join("; ") : null;
  if (needsManualReview) {
    log.info("flagged_for_manual_review", { reportId, reviewReason });
  }

  // Duplicate detection (non-emergency only, emergencies are never suppressed:
  // merging one would silently swallow an auto-dispatch. The is_emergency guard
  // was lost when the emergency short-circuit above was removed for issue-8;
  // this reinstates it explicitly). A match marks THIS report 'merged', records
  // a merges row, and skips the work order so duplicate reports don't inflate
  // the dispatch queue. Flag-gated + no-op-safe: findDuplicate returns null on
  // an un-migrated DB (missing RPC).
  if (DEDUP_REPORTS && !classification.is_emergency) {
    const dup = await findDuplicate(supabase, reportId, log);
    if (dup) {
      const { error: mergeErr } = await supabase.from("merges").insert({
        primary_report_id: dup.primaryReportId,
        duplicate_report_id: reportId,
        similarity_score: dup.similarityScore,
      });
      if (mergeErr) {
        // Could not record the merge. Do NOT mark the report merged (that would
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
        // Escalate the primary's work-order priority. A repeat report is a
        // demand signal. Atomic increment via RPC (migration 014); guarded +
        // best-effort: a missing RPC (un-migrated DB) or primary-without-work-
        // order (e.g. emergency) is a logged no-op, never a thrown error.
        const { error: bumpErr } = await supabase.rpc(
          "bump_work_order_priority",
          { _report_id: dup.primaryReportId, _delta: 1 },
        );
        if (bumpErr) {
          log.error("priority_bump_failed", undefined, {
            primary: dup.primaryReportId,
            error: bumpErr.message,
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
    recurrenceCount: 0,
  });

  // Effective work order fields. Start from rules; override with AI output when
  // AI_WORK_ORDER is enabled AND the AI call succeeds. priority_score ALWAYS
  // stays deterministic. The AI sizes crew/materials/minutes/cost, not the
  // dispatch priority math.
  let department = rulesWorkOrder.department;
  // string (not the static CrewType union): the AI path picks from the city's
  // own crew_types catalog (031), which may carry bespoke keys.
  let crewType: string | null = rulesWorkOrder.crew_type;
  let estMinutes = rulesWorkOrder.est_minutes;
  let materials: string[] = rulesWorkOrder.materials;
  let estCost = rulesWorkOrder.est_cost;
  let woSource: WorkOrderSource = "rules";
  // AI rationale explaining crew/time/materials/cost sizing; null on rules path.
  let woRationale: string | null = null;
  // AI's crew-name pick among same-type siblings (## CREWS section); consumed
  // only by autoAssignCrew below, which validates it against real candidates.
  let crewHint: string | null = null;

  if (AI_WORK_ORDER) {
    // City catalog with descriptions, degrades to the app defaults when the
    // city has no rows or 031 isn't applied, so this never blocks the call.
    const cityCrewTypes = await fetchActiveCrewTypeDefs(report.city_id);
    // Active crews (name/type/description) feed the ## CREWS prompt section.
    // Best-effort like the catalog: [] on any failure (or pre-032, where the
    // description column is absent) keeps the prompt byte-identical to today.
    const promptCrews = await fetchPromptCrews(supabase, report.city_id, log);
    const aiResult = await generateWorkOrderAI(
      classification,
      cityCrewTypes,
      promptCrews,
    );
    if (aiResult.ok) {
      department = aiResult.data.department;
      crewType = aiResult.data.crew_type;
      estMinutes = aiResult.data.est_minutes;
      materials = aiResult.data.materials;
      // Math.max preserves the rules floor. A lower AI estimate must not
      // undercut the deterministic material+labor floor from work-order-rules.ts.
      estCost = Math.max(rulesWorkOrder.est_cost, aiResult.data.est_cost);
      woRationale = aiResult.data.rationale;
      crewHint = aiResult.data.crew_hint;
      woSource = "ai";
      log.info("work_order_ai_ok", { reportId, estCost, crewType, crewHint });
    } else {
      log.error("work_order_ai_failed_using_rules", undefined, {
        reportId,
        error: aiResult.error,
      });
    }
  }

  // Upsert (not insert) on the report_id UNIQUE constraint so the pipeline is
  // idempotent: a 2nd run (staff re-run, retry, or a concurrent submit+Open311
  // race) updates the existing work order instead of hitting a unique violation
  // that would stamp classify_status=failed AFTER classifications already
  // upserted, leaving the report in a divergent half-classified state.
  const { data: insertedWorkOrder, error: woErr } = await supabase
    .from("work_orders")
    .upsert(
      {
        report_id: reportId,
        department,
        crew_type: crewType,
        priority_score: rulesWorkOrder.priority_score,
        est_minutes: estMinutes,
        materials,
        // Set directly on the primary write (not a best-effort stamp like
        // est_cost below). This flag is safety/correctness-critical and must
        // never silently fail to apply.
        needs_manual_review: needsManualReview,
        review_reason: reviewReason,
      },
      { onConflict: "report_id" },
    )
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

  // Persist the owning team via a separate guarded write (migration 026
  // column; no-op-safe on un-migrated DBs. The read path falls back to the
  // static category→team default when team_key is null). Resolved from the
  // city's own city_teams config so per-city routing takes effect at creation.
  let resolvedTeamKey: string | null = null;
  try {
    // Widened to string: a zone override may carry a custom per-city team_key
    // that isn't in the static TeamId union, and the column is plain text.
    let teamKey: string = await resolveTeamKeyForCategory(
      report.city_id,
      classification.category,
    );
    // Geographic override (LCP-15, migration 033): if the report's point falls
    // inside a routing_zone, that zone's team wins over the category default.
    // No-op-safe. The RPC returns null (or errors on an un-migrated DB) unless
    // the city has opted into zones, leaving category routing untouched.
    try {
      const { data: zoneTeam, error: zoneErr } = await supabase.rpc(
        "resolve_zone_team",
        { _report_id: reportId },
      );
      if (zoneErr) {
        log.warn("resolve_zone_team_failed", {
          reportId,
          error: zoneErr.message,
        });
      } else if (typeof zoneTeam === "string" && zoneTeam.length > 0) {
        log.info("team_key_zone_override", {
          reportId,
          categoryTeam: teamKey,
          zoneTeam,
        });
        teamKey = zoneTeam;
      }
    } catch (zoneThrow) {
      log.warn("resolve_zone_team_threw", {
        reportId,
        error:
          zoneThrow instanceof Error ? zoneThrow.message : String(zoneThrow),
      });
    }
    const { error: teamErr } = await supabase
      .from("work_orders")
      .update({ team_key: teamKey })
      .eq("id", insertedWorkOrder.id);
    if (teamErr) {
      log.warn("work_order_team_key_stamp_failed", {
        reportId,
        error: teamErr.message,
      });
    } else {
      resolvedTeamKey = teamKey;
    }
  } catch (err) {
    log.warn("work_order_team_key_resolve_threw", {
      reportId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Stamp the SLA deadline (migration 032; no-op-safe on un-migrated DBs).
  // due_at = now + the city's category SLA hours (static-map fallback). The
  // overdue-escalation job reads this; a null due_at just means the read path
  // falls back to CATEGORY_SLA_TARGETS derived from created_at.
  try {
    const slaHours = await fetchSlaHours(
      supabase,
      report.city_id,
      classification.category,
    );
    const dueAt = new Date(Date.now() + slaHours * 3_600_000).toISOString();
    const { error: dueErr } = await supabase
      .from("work_orders")
      .update({ due_at: dueAt })
      .eq("id", insertedWorkOrder.id);
    if (dueErr) {
      log.warn("work_order_due_at_stamp_failed", {
        reportId,
        error: dueErr.message,
      });
    } else {
      insertedWorkOrder.due_at = dueAt;
    }
  } catch (err) {
    log.warn("work_order_due_at_stamp_threw", {
      reportId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Cross-jurisdiction ownership (migration 034; no-op-safe). If the category
  // escalates to the parent jurisdiction, stamp owner_city_id so the parent
  // owns the work order; otherwise it stays NULL (report's own city). Dark
  // until a city seeds escalates_to_parent. ResolveOwningCity returns the
  // report's own city in every other case.
  try {
    const owningCity = await resolveOwningCity(
      supabase,
      reportId,
      report.city_id,
    );
    if (owningCity !== report.city_id) {
      const { error: ownerErr } = await supabase
        .from("work_orders")
        .update({ owner_city_id: owningCity })
        .eq("id", insertedWorkOrder.id);
      if (ownerErr) {
        log.warn("work_order_owner_city_stamp_failed", {
          reportId,
          error: ownerErr.message,
        });
      } else {
        log.info("work_order_cross_jurisdiction", {
          reportId,
          reportCity: report.city_id,
          ownerCity: owningCity,
        });
      }
    }
  } catch (err) {
    log.warn("work_order_owner_city_threw", {
      reportId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Auto-assign an actual crew (migration 030/031; AI_CREW_ASSIGN flag).
  // Deterministic pick over the city's active crews matching this work order's
  // team + crew_type, best-effort like the team_key stamp above, and skipped
  // for flagged reports (a human is about to review; a category override would
  // re-route the team and orphan the pick). Runs for emergencies: they skip
  // manual review by design and need a crew soonest.
  if (AI_CREW_ASSIGN && !needsManualReview && resolvedTeamKey && crewType) {
    await autoAssignCrew(supabase, {
      workOrderId: insertedWorkOrder.id,
      cityId: report.city_id,
      teamKey: resolvedTeamKey,
      crewType,
      crewHint,
      log,
    });
  }

  // Advanced routing over the org_units tree (migration 042). Runs alongside
  // the legacy crew pick during the transition: it stamps assigned_unit_id (the
  // new source of truth) via cost/SLA-weighted load balance across internal
  // crews + contractors. Best-effort and no-op-safe on an un-migrated DB (no
  // org_units rows → no candidates → null). Gated identically to the crew pick.
  if (AI_CREW_ASSIGN && !needsManualReview && crewType) {
    await autoAssignUnit(supabase, {
      workOrderId: insertedWorkOrder.id,
      cityId: report.city_id,
      category: classification.category,
      crewType,
      dueAt: insertedWorkOrder.due_at ?? null,
      nowMs: Date.now(),
      log,
    });
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

  // Flagged reports stay at 'open'. Never silently auto-dispatched. Staff
  // see them in the inbox with a "Needs Review" badge and must explicitly
  // dispatch (after optionally correcting the category) via existing actions.
  if (!needsManualReview) {
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
  }

  await markClassifyStatus(supabase, reportId, "done", log);
  log.info("pipeline_done", {
    reportId,
    workOrderId: insertedWorkOrder.id,
    priority: insertedWorkOrder.priority_score,
    estCost,
    woSource,
    needsManualReview,
  });
  return {
    ok: true,
    data: {
      emergency: classification.is_emergency,
      classification,
      work_order: insertedWorkOrder,
      needs_manual_review: needsManualReview,
      review_reason: reviewReason,
    },
  };
}
