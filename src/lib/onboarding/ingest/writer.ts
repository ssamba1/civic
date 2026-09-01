// Cold-start writer (F5). Persists NormalizedReport[] into reports +
// classifications + work_orders, and tracks progress on a provision_jobs row for
// the wizard StatusBar. Bypasses runClassifyPipeline by design: imports/synthetic
// have no photo, so we map the source category straight to a classification and
// generate the work order deterministically (no Gemini vision). See F5_INGEST.md.
//
// SERVER-ONLY: service-role client (createServerClient). Bulk insert bypasses RLS
// and writes reporter_id = NULL (no real reporter), which migration 015 allows.

import { generateWorkOrder } from "@/lib/ai/work-order-rules";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import type { Classification, ReportCategory, Result } from "@/lib/types";
import type { NormalizedReport } from "./types";

const logger = createLogger("ingest-writer");

type SupabaseLike = ReturnType<typeof createServerClient>;

const INSERT_CHUNK = 500;

export interface IngestDeps {
  db?: SupabaseLike;
  /** Public storage base for category placeholder photos. Defaults to env. */
  photoBaseUrl?: string;
  /** provision_jobs row to update with progress (StatusBar). */
  jobId?: string;
}

export interface IngestSummary {
  inserted: number;
  jobId: string | null;
}

function categorySeedPhoto(category: ReportCategory, base: string): string {
  return `${base}/storage/v1/object/public/photos-public/seed/${category}.jpg`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function setJob(
  db: SupabaseLike,
  jobId: string | undefined,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!jobId) return;
  const { error } = await db
    .from("provision_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) {
    logger.error("provision_job_update_failed", undefined, {
      jobId,
      error: error.message,
    });
  }
}

/**
 * Persist normalized reports for `cityId`. Returns the inserted count. On any
 * insert error the provision_jobs row (if given) is marked 'error' and a Result
 * error is returned, the caller surfaces it in the StatusBar (Retry / partial).
 */
export async function ingestReports(
  cityId: string,
  reports: NormalizedReport[],
  deps: IngestDeps = {},
): Promise<Result<IngestSummary>> {
  const db = deps.db ?? createServerClient();
  const base = deps.photoBaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const jobId = deps.jobId;

  if (reports.length === 0) {
    await setJob(db, jobId, { status: "ready", total: 0 });
    return { ok: true, data: { inserted: 0, jobId: jobId ?? null } };
  }

  await setJob(db, jobId, { status: "ingesting", total: reports.length });

  const reportRows: Record<string, unknown>[] = [];
  const classRows: Record<string, unknown>[] = [];
  const woRows: Record<string, unknown>[] = [];

  for (const r of reports) {
    const id = crypto.randomUUID();
    const classification: Classification = {
      category: r.category,
      subcategory: r.source === "synthetic" ? "synthetic" : "imported",
      severity: r.severity,
      hazard_radius_m: 0,
      visible_size_estimate: "unknown",
      is_emergency: false,
      confidence: 1,
      reasoning: `Imported from ${r.source}`,
      no_issue_detected: false,
      alternate_categories: [],
    };

    reportRows.push({
      id,
      city_id: cityId,
      reporter_id: null,
      source: r.source,
      source_external_id: r.sourceExternalId ?? null,
      location: `SRID=4326;POINT(${r.location.lng} ${r.location.lat})`,
      photo_public_url: r.photoUrl ?? categorySeedPhoto(r.category, base),
      photo_raw_url: null,
      address: r.address ?? null,
      status: r.status,
      created_at: r.createdAt,
    });

    classRows.push({
      report_id: id,
      ...classification,
      model_version: `import:${r.source}`,
      raw_response: r.raw ?? {},
    });

    const wo = generateWorkOrder(classification, { recurrenceCount: 0 });
    woRows.push({
      report_id: id,
      department: wo.department,
      crew_type: wo.crew_type,
      priority_score: wo.priority_score,
      est_minutes: wo.est_minutes,
      materials: wo.materials,
      est_cost: wo.est_cost,
      wo_source: "rules",
      completed_at: r.resolvedAt ?? null,
    });
  }

  // Insert in dependency order: reports → classifications → work_orders.
  const stages: [string, Record<string, unknown>[]][] = [
    ["reports", reportRows],
    ["classifications", classRows],
    ["work_orders", woRows],
  ];
  for (const [table, rows] of stages) {
    if (table === "classifications") {
      await setJob(db, jobId, {
        status: "classifying",
        ingested: reports.length,
      });
    }
    for (const part of chunk(rows, INSERT_CHUNK)) {
      const { error } = await db.from(table).insert(part);
      if (error) {
        await setJob(db, jobId, {
          status: "error",
          message: `${table} insert failed: ${error.message}`,
        });
        logger.error("ingest_insert_failed", undefined, {
          cityId,
          table,
          error: error.message,
        });
        return {
          ok: false,
          error: `INGEST_${table.toUpperCase()}: ${error.message}`,
        };
      }
    }
  }

  await setJob(db, jobId, {
    status: "ready",
    ingested: reports.length,
    classified: reports.length,
  });
  logger.info("ingest_complete", { cityId, inserted: reports.length });
  return { ok: true, data: { inserted: reports.length, jobId: jobId ?? null } };
}
