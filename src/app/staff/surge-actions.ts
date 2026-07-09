"use server";

import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import {
  reprioritize,
  type SurgeConfig,
  type SurgeReport,
} from "@/lib/staff/surge";
import type { ReportCategory, Result } from "@/lib/types";

const logger = createLogger("[surge-actions]");

const STAFF_ROLES = ["staff_dispatcher", "staff_supervisor", "admin"] as const;

async function getStaffUser() {
  const user = await getAuthUser();
  const db = createServerClient();

  if (!user) {
    if (
      process.env.NODE_ENV === "development" &&
      process.env.DEV_AUTH_BYPASS === "1"
    ) {
      const { data: devStaff } = await db
        .from("users")
        .select("id, role, city_id")
        .in("role", [...STAFF_ROLES])
        .limit(1)
        .single();
      return devStaff && STAFF_ROLES.includes(devStaff.role) ? devStaff : null;
    }
    return null;
  }

  const { data: profile } = await db
    .from("users")
    .select("id, role, city_id")
    .eq("id", user.id)
    .single();

  if (!profile || !STAFF_ROLES.includes(profile.role)) return null;
  return profile;
}

// ---------------------------------------------------------------------------
// Read active surge state
// ---------------------------------------------------------------------------

export interface SurgeState {
  active: boolean;
  city_id: string | null;
  categories: ReportCategory[];
  reason: string;
  activated_at: string | null;
}

/**
 * Fetch the current surge state for the staff member's city.
 * Gracefully degrades to `{ active: false }` when the surge_state table
 * doesn't exist yet (migration not applied) so the banner renders nothing.
 */
export async function getSurgeState(): Promise<Result<SurgeState>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  const db = createServerClient();
  try {
    const { data, error } = await db
      .from("surge_state")
      .select("active, city_id, categories, reason, activated_at")
      .eq("city_id", staff.city_id ?? "")
      .maybeSingle();

    if (error) {
      // Table doesn't exist yet — graceful degrade
      logger.warn("surge_state table unavailable (migration pending?)", {
        error: error.message,
      });
      return {
        ok: true,
        data: {
          active: false,
          city_id: staff.city_id ?? null,
          categories: [],
          reason: "",
          activated_at: null,
        },
      };
    }

    if (!data) {
      return {
        ok: true,
        data: {
          active: false,
          city_id: staff.city_id ?? null,
          categories: [],
          reason: "",
          activated_at: null,
        },
      };
    }

    return {
      ok: true,
      data: {
        active: data.active ?? false,
        city_id: data.city_id,
        categories: (data.categories ?? []) as ReportCategory[],
        reason: data.reason ?? "",
        activated_at: data.activated_at ?? null,
      },
    };
  } catch (err) {
    logger.warn("getSurgeState threw (table missing?)", {
      detail: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: true,
      data: {
        active: false,
        city_id: staff.city_id ?? null,
        categories: [],
        reason: "",
        activated_at: null,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Activate surge
// ---------------------------------------------------------------------------

export interface ActivateSurgeInput {
  categories: ReportCategory[];
  reason: string;
}

/**
 * Activate surge mode for the staff member's city.
 * Upserts a row in `surge_state`; gracefully degrades if table is absent.
 * Also immediately reprioritises open work orders to reflect the surge.
 */
export async function activateSurge(
  input: ActivateSurgeInput,
): Promise<Result<{ reprioritized: number }>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };
  if (!staff.city_id) return { ok: false, error: "no_city" };

  if (!input.categories || input.categories.length === 0)
    return { ok: false, error: "categories_required" };
  if (!input.reason?.trim()) return { ok: false, error: "reason_required" };
  if (input.reason.trim().length > 500)
    return { ok: false, error: "reason_too_long" };

  const db = createServerClient();
  const now = new Date().toISOString();

  // Persist surge state (graceful degrade if table absent)
  try {
    const { error } = await db.from("surge_state").upsert(
      {
        city_id: staff.city_id,
        active: true,
        categories: input.categories,
        reason: input.reason.trim(),
        activated_at: now,
      },
      { onConflict: "city_id" },
    );
    if (error) {
      logger.warn("surge_state upsert failed (migration pending?)", {
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn("surge_state upsert threw", {
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // Reprioritise: fetch open reports and apply surge boost.
  // Returns count; failures are non-fatal (the surge state is already written).
  const reprioritized = await applySurgeToReports(db, staff.city_id, {
    city_id: staff.city_id,
    active: true,
    categories: input.categories,
    reason: input.reason.trim(),
    activated_at: now,
  });

  logger.info("surge_activated", {
    cityId: staff.city_id,
    categories: input.categories,
    reprioritized,
  });

  return { ok: true, data: { reprioritized } };
}

// ---------------------------------------------------------------------------
// Deactivate surge
// ---------------------------------------------------------------------------

/**
 * Deactivate surge mode for the staff member's city.
 * Marks the surge_state row inactive; original priority_scores remain in DB
 * (they'll drift back on normal recalculation cycles).
 */
export async function deactivateSurge(): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };
  if (!staff.city_id) return { ok: false, error: "no_city" };

  const db = createServerClient();
  try {
    const { error } = await db
      .from("surge_state")
      .update({ active: false })
      .eq("city_id", staff.city_id);
    if (error) {
      logger.warn("surge_state deactivate failed (migration pending?)", {
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn("surge_state deactivate threw", {
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info("surge_deactivated", { cityId: staff.city_id });
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Internal: apply surge reprioritisation to DB rows
// ---------------------------------------------------------------------------

/**
 * Fetch open/dispatched/in_progress reports for the city, run the pure
 * reprioritize() function, then write the boosted priority_scores back to DB.
 * Returns the count of reports updated.
 *
 * Best-effort: any DB error is logged but does not propagate.
 */
async function applySurgeToReports(
  db: ReturnType<typeof createServerClient>,
  cityId: string,
  config: SurgeConfig,
): Promise<number> {
  try {
    const { data: rows, error } = await db
      .from("reports")
      .select(
        `
        id,
        status,
        city_id,
        created_at,
        work_orders!inner ( priority_score ),
        classifications!inner ( category )
      `,
      )
      .eq("city_id", cityId)
      .in("status", ["open", "dispatched", "in_progress"]);

    if (error || !rows) {
      logger.warn("applySurgeToReports: reports fetch failed", {
        error: error?.message,
      });
      return 0;
    }

    // Normalise the joined rows into SurgeReport shape
    const reports: SurgeReport[] = rows
      .map((row: Record<string, unknown>) => {
        const wo = Array.isArray(row.work_orders)
          ? (row.work_orders[0] as { priority_score: number } | undefined)
          : (row.work_orders as { priority_score: number } | null);
        const cls = Array.isArray(row.classifications)
          ? (row.classifications[0] as { category: string } | undefined)
          : (row.classifications as { category: string } | null);
        if (!wo || !cls) return null;
        return {
          id: row.id as string,
          status: row.status as SurgeReport["status"],
          category: cls.category as SurgeReport["category"],
          priority_score: Number(wo.priority_score),
          city_id: row.city_id as string,
          created_at: row.created_at as string,
        };
      })
      .filter((r): r is SurgeReport => r !== null);

    const now = new Date().toISOString();
    const boosted = reprioritize(reports, config, now);
    const toUpdate = boosted.filter((r) => r.surgeBoost !== undefined);

    if (toUpdate.length === 0) return 0;

    // Batch the priority_score writes (one update per report to avoid
    // constructing a complex CASE WHEN — acceptable at expected surge batch sizes).
    let count = 0;
    for (const r of toUpdate) {
      const { error: updateErr } = await db
        .from("work_orders")
        .update({ priority_score: r.priority_score })
        .eq("report_id", r.id);
      if (!updateErr) count++;
      else
        logger.warn("surge priority_score update failed", {
          reportId: r.id,
          error: updateErr.message,
        });
    }
    return count;
  } catch (err) {
    logger.warn("applySurgeToReports threw", {
      detail: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
