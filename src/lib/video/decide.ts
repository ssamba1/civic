/**
 * Stage 2. The decision run. Fires only for detection clusters the LLM-free
 * stage escalated (or a staff member escalates manually). One Gemini call
 * over the best evidence frame + in-DB city context produces a cited
 * decision; the decision and its full supporting dossier persist on the
 * cluster, and a "dispatch" decision spins off a normal reports row that
 * flows through the existing classify/work-order pipeline unchanged.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { runClassifyPipeline } from "@/lib/ai/classify-pipeline";
import { AI_TIMEOUT_MS, GEMINI_MODEL } from "@/lib/ai/config";
import { checkAndRecordGeminiCall } from "@/lib/ai/rate-limiter";
import { withRetry } from "@/lib/ai/retry";
import { fetchCorrectionExamples } from "@/lib/db/classification-feedback";
import { createServerClient } from "@/lib/db/client";
import { fetchActiveCrewTypeDefs } from "@/lib/db/crew-types";
import { fetchSlaHours } from "@/lib/db/sla-targets";
import { serverEnv } from "@/lib/env";
import { evaluateReportLiability } from "@/lib/liability/evaluate";
import { createLogger } from "@/lib/logger";
import {
  normalizeLocation,
  type ReportCategory,
  type Result,
} from "@/lib/types";
import {
  buildDecisionPrompt,
  DECISION_SYSTEM_PROMPT,
  type DecisionContext,
} from "@/lib/video/decision-prompt";
import {
  type Decision,
  decisionSchema,
  GEMINI_DECISION_SCHEMA,
  sanitizeDecision,
} from "@/lib/video/decision-schema";

const FRAMES_BUCKET = "video-frames";
const RAW_BUCKET = "photos-raw";

/**
 * Public photo shown for camera-detected reports. The actual evidence frame
 * is unblurred city-camera footage and NEVER leaves the private bucket
 * (hard rule 2); the public dashboard shows this static placeholder instead.
 */
export const VIDEO_PLACEHOLDER_PUBLIC_PATH = "/video-detection-placeholder.svg";

/** SLA context is fetched for the categories road damage plausibly maps to. */
const SLA_CONTEXT_CATEGORIES: ReportCategory[] = [
  "pothole",
  "sidewalk_damage",
  "drainage",
  "other",
];

const PROMPT_VERSION = "video-decision-v1";

export interface DecideOutcome {
  decision: Decision;
  /** Spun-off report id when the decision dispatched. */
  report_id?: string;
  /** Cluster status after side effects were applied. */
  cluster_status: string;
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return match ? match[1].trim() : trimmed;
}

type SupabaseLike = ReturnType<typeof createServerClient>;

interface ClusterRow {
  id: string;
  city_id: string;
  class: string;
  max_confidence: number;
  frame_count: number;
  location: unknown;
  status: string;
  best_detection_id: string | null;
}

async function loadBestFrame(
  supabase: SupabaseLike,
  cluster: ClusterRow,
): Promise<Result<{ base64: string; framePath: string; clipId: string }>> {
  let query = supabase
    .from("damage_detections")
    .select("id, frame_path, clip_id, confidence")
    .eq("cluster_id", cluster.id)
    .order("confidence", { ascending: false })
    .limit(1);
  if (cluster.best_detection_id) {
    query = supabase
      .from("damage_detections")
      .select("id, frame_path, clip_id, confidence")
      .eq("id", cluster.best_detection_id)
      .limit(1);
  }
  const { data, error } = await query;
  const row = data?.[0] as { frame_path: string; clip_id: string } | undefined;
  if (error || !row) {
    return {
      ok: false,
      error: `No detection frame for cluster ${cluster.id}: ${error?.message ?? "no rows"}`,
    };
  }
  const { data: blob, error: dlErr } = await supabase.storage
    .from(FRAMES_BUCKET)
    .download(row.frame_path);
  if (dlErr || !blob) {
    return {
      ok: false,
      error: `Frame download failed (${row.frame_path}): ${dlErr?.message ?? "empty"}`,
    };
  }
  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  return {
    ok: true,
    data: { base64, framePath: row.frame_path, clipId: row.clip_id },
  };
}

async function buildContext(
  supabase: SupabaseLike,
  cluster: ClusterRow,
): Promise<DecisionContext> {
  const location = normalizeLocation(cluster.location);

  // Nearby open reports, the merge candidates and the history the model must
  // weigh. Reuses the report-dedup RPC (SECURITY DEFINER, public columns).
  let nearby: DecisionContext["nearby_reports"] = [];
  if (location) {
    const { data } = await supabase.rpc("find_nearby_open_reports", {
      _lat: location.lat,
      _lng: location.lng,
      _radius_m: 100,
      _window_days: 90,
    });
    nearby = (
      (data ?? []) as {
        id: string;
        category: string | null;
        address: string | null;
        distance_m: number;
        created_at: string;
      }[]
    ).map((r) => ({
      id: r.id,
      category: r.category,
      address: r.address,
      distance_m: Math.round(r.distance_m),
      created_at: r.created_at,
    }));
  }

  const slaEntries = await Promise.all(
    SLA_CONTEXT_CATEGORIES.map(
      async (c) =>
        [c, await fetchSlaHours(supabase, cluster.city_id, c)] as const,
    ),
  );

  const crewTypes = await fetchActiveCrewTypeDefs(cluster.city_id);
  const corrections = await fetchCorrectionExamples(cluster.city_id);

  return {
    detection: {
      cluster_id: cluster.id,
      detector_class: cluster.class,
      max_confidence: cluster.max_confidence,
      frame_count: cluster.frame_count,
      location,
    },
    nearby_reports: nearby,
    sla_hours_by_category: Object.fromEntries(slaEntries),
    crew_types: crewTypes.map((t) => ({
      key: t.key,
      description: t.description,
    })),
    correction_history: corrections,
  };
}

async function callDecisionModel(
  context: DecisionContext,
  frameBase64: string,
): Promise<Result<Decision>> {
  const rateCheck = checkAndRecordGeminiCall();
  if (!rateCheck.allowed) {
    return {
      ok: false,
      error: `Gemini rate limit: ${rateCheck.reason}. Retry in ${Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000)}s.`,
    };
  }
  try {
    const genAI = new GoogleGenerativeAI(serverEnv.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: DECISION_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: GEMINI_DECISION_SCHEMA,
      },
    });
    const result = await withRetry(
      (signal) =>
        model.generateContent(
          [
            buildDecisionPrompt(context),
            { inlineData: { data: frameBase64, mimeType: "image/jpeg" } },
          ],
          { signal, timeout: AI_TIMEOUT_MS },
        ),
      { timeoutMs: AI_TIMEOUT_MS },
    );
    const rawText = result.response?.text?.() ?? "";
    if (!rawText.trim()) {
      return { ok: false, error: "Decision model returned an empty response" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFences(rawText));
    } catch {
      return {
        ok: false,
        error: `Decision model returned invalid JSON: ${rawText.slice(0, 300)}`,
      };
    }
    const validation = decisionSchema.safeParse(parsed);
    if (!validation.success) {
      return {
        ok: false,
        error: `Decision validation failed: ${JSON.stringify(validation.error.issues)}`,
      };
    }
    return { ok: true, data: validation.data };
  } catch (err) {
    return {
      ok: false,
      error: `Decision model error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Spin off a normal report + run the existing classify pipeline over it. */
async function dispatchReport(
  supabase: SupabaseLike,
  cluster: ClusterRow,
  decision: Decision,
  frameBase64: string,
  clipId: string,
  log: ReturnType<typeof createLogger>,
): Promise<Result<{ reportId: string }>> {
  const location = normalizeLocation(cluster.location);
  if (!location) {
    return {
      ok: false,
      error:
        "Cluster has no location. Cannot create a report (manual dispatch required)",
    };
  }
  // reports.reporter_id is NOT NULL, attribute the report to the staff user
  // who registered the source clip.
  const { data: clip } = await supabase
    .from("video_clips")
    .select("created_by")
    .eq("id", clipId)
    .single<{ created_by: string | null }>();
  if (!clip?.created_by) {
    return {
      ok: false,
      error:
        "Source clip has no creator. Cannot attribute the report (manual dispatch required)",
    };
  }

  const reportId = crypto.randomUUID();
  // The classify pipeline reads photos-raw at `${city_id}/${report_id}.jpg`.
  // Land the evidence frame there so the whole existing machinery (hazard
  // grade, work order, SLA stamp, crew assign) runs unchanged.
  const rawPath = `${cluster.city_id}/${reportId}.jpg`;
  const { error: upErr } = await supabase.storage
    .from(RAW_BUCKET)
    .upload(rawPath, Buffer.from(frameBase64, "base64"), {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (upErr) {
    return {
      ok: false,
      error: `Evidence frame upload failed: ${upErr.message}`,
    };
  }

  const { error: insertErr } = await supabase.from("reports").insert({
    id: reportId,
    city_id: cluster.city_id,
    reporter_id: clip.created_by,
    location: `SRID=4326;POINT(${location.lng} ${location.lat})`,
    // Unblurred camera frame stays private; the public row carries the
    // static placeholder (hard rule 2, no raw photo in the public bucket).
    photo_public_url: VIDEO_PLACEHOLDER_PUBLIC_PATH,
    photo_raw_url: `${RAW_BUCKET}/${rawPath}`,
    address: null,
    description: `Automated camera-feed detection: ${cluster.class} (detector confidence ${cluster.max_confidence.toFixed(2)}, ${cluster.frame_count} frames). Decision: ${decision.rationale}`,
    tags: ["video-detection"],
    status: "open",
  });
  if (insertErr) {
    await supabase.storage.from(RAW_BUCKET).remove([rawPath]);
    return { ok: false, error: `Report insert failed: ${insertErr.message}` };
  }

  const pipeline = await runClassifyPipeline(reportId);
  if (!pipeline.ok) {
    // Report exists; classification failed. The classify pipeline already
    // logged and the report sits in manual triage. Not a dispatch failure.
    log.warn("video_dispatch_classify_failed", {
      reportId,
      error: pipeline.error,
    });
  } else {
    // Liability attribution (spec §3.2), same best-effort contract as the
    // resident path in app/report/actions.ts: it needs the classification's
    // category (hence the pipeline.ok gate), and a missing verdict only
    // degrades the badge to "unknown". A camera dispatch must never fail
    // because the city has no paving schedule loaded.
    try {
      const liability = await evaluateReportLiability(reportId);
      if (!liability.ok) {
        log.warn("video_dispatch_liability_failed", {
          reportId,
          error: liability.error,
        });
      }
    } catch (err) {
      log.warn("video_dispatch_liability_threw", {
        reportId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { ok: true, data: { reportId } };
}

/**
 * Run the decision stage for one cluster. Persists the decision + dossier and
 * applies side effects. ok:false leaves the cluster at 'candidate' so a later
 * clip (or manual escalation) retries. The LLM stage is always retryable.
 */
export async function decideCluster(
  clusterId: string,
): Promise<Result<DecideOutcome>> {
  const log = createLogger("video-decide");
  const supabase = createServerClient();

  const { data: cluster, error: clusterErr } = await supabase
    .from("video_detection_clusters")
    .select(
      "id, city_id, class, max_confidence, frame_count, location, status, best_detection_id",
    )
    .eq("id", clusterId)
    .single<ClusterRow>();
  if (clusterErr || !cluster) {
    return {
      ok: false,
      error: `Cluster not found: ${clusterErr?.message ?? "no rows"}`,
    };
  }
  if (
    cluster.status === "dispatched" ||
    cluster.status === "merged" ||
    cluster.status === "dismissed"
  ) {
    return {
      ok: false,
      error: `Cluster already resolved (${cluster.status})`,
    };
  }

  const frame = await loadBestFrame(supabase, cluster);
  if (!frame.ok) return frame;

  const context = await buildContext(supabase, cluster);
  const modelResult = await callDecisionModel(context, frame.data.base64);
  if (!modelResult.ok) {
    log.error("decision_model_failed", undefined, {
      clusterId,
      error: modelResult.error,
    });
    await supabase.from("error_log").insert({
      correlation_id: log.correlationId,
      context: "video-decide",
      message: modelResult.error,
      metadata: { clusterId },
    });
    return modelResult;
  }

  const decision = sanitizeDecision(
    modelResult.data,
    context.nearby_reports.map((r) => r.id),
  );

  // Side effects first, so the persisted status reflects what actually
  // happened (a failed dispatch leaves the cluster 'escalated' for staff).
  let clusterStatus: string;
  let reportId: string | undefined;
  let mergedReportId: string | null = null;
  switch (decision.decision) {
    case "dispatch": {
      const dispatched = await dispatchReport(
        supabase,
        cluster,
        decision,
        frame.data.base64,
        frame.data.clipId,
        log,
      );
      if (dispatched.ok) {
        reportId = dispatched.data.reportId;
        clusterStatus = "dispatched";
      } else {
        log.warn("video_dispatch_blocked", {
          clusterId,
          reason: dispatched.error,
        });
        clusterStatus = "escalated";
      }
      break;
    }
    case "merge": {
      mergedReportId = decision.merge_report_id;
      // Repeat sighting = demand signal, same as resident-side dedup.
      const { error: bumpErr } = await supabase.rpc(
        "bump_work_order_priority",
        { _report_id: mergedReportId, _delta: 1 },
      );
      if (bumpErr) {
        log.warn("video_merge_bump_failed", {
          clusterId,
          error: bumpErr.message,
        });
      }
      clusterStatus = "merged";
      break;
    }
    case "monitor":
      clusterStatus = "monitoring";
      break;
    case "dismiss":
      clusterStatus = "dismissed";
      break;
  }

  const { error: persistErr } = await supabase
    .from("video_detection_clusters")
    .update({
      status: clusterStatus,
      decision: decision.decision,
      decision_confidence: decision.confidence,
      decision_rationale: decision.rationale,
      decision_dossier: {
        prompt_version: PROMPT_VERSION,
        context,
        category: decision.category,
        severity: decision.severity,
        cost_band: decision.cost_band,
        citations: decision.citations,
        evidence_frame: frame.data.framePath,
      },
      decision_model: GEMINI_MODEL,
      decided_at: new Date().toISOString(),
      report_id: reportId ?? null,
      merged_report_id: mergedReportId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", clusterId);
  if (persistErr) {
    log.error("decision_persist_failed", undefined, {
      clusterId,
      error: persistErr.message,
    });
    return {
      ok: false,
      error: `Decision persist failed: ${persistErr.message}`,
    };
  }

  log.info("decision_done", {
    clusterId,
    decision: decision.decision,
    clusterStatus,
    reportId,
  });
  return {
    ok: true,
    data: { decision, report_id: reportId, cluster_status: clusterStatus },
  };
}
