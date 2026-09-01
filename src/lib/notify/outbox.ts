import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import type { DeliveryResult } from "@/lib/notify/deliver";
import type { ReportStatus } from "@/lib/types";

const logger = createLogger("[notify-outbox]");

/* ==================================================================
   Notification delivery outbox.

   The DB trigger (migration 006) writes the in-app notification row on every
   status change; the out-of-band email leg (status-notify.ts) is a separate,
   best-effort `after()` send. Migration 025 added delivered_at / delivery_error
   to notifications so that send has somewhere to record its outcome. This
   module owns those two columns.

   Two operations:
     - stampNotificationOutcome(): called by status-notify right after a send,
       records the result on the matching notification row so a delivered email
       drops out of the drain and a transient failure stays visible for retry.
     - drainUndelivered(): re-runs the composer for notification rows whose email
       never landed (delivered_at IS NULL), so a Resend 5xx / network blip during
       the synchronous send doesn't silently lose a resident's resolution email.

   Retry policy by DeliveryResult.reason:
     ok           → delivered, stamp delivered_at
     no-recipient → terminal (anon reporter, no email), stamp delivered_at so it
     disabled     → terminal (NOTIFY_DISABLE / env). Leaves the queue; the
     no-key       → reason is recorded in delivery_error for visibility
     send-error   → TRANSIENT. Leave delivered_at NULL, set delivery_error; the
                    drain retries it on its next pass
   ================================================================== */

// Only these transitions send an out-of-band email (see status-notify.ts). The
// DB trigger tags the 'closed' transition 'resolved' and everything else
// 'status_change', so 'resolved' is the only unambiguous status↔type mapping,
// and the resolution email (photo + CSAT) is the high-value one to never lose.
// dispatched/rejected ride 'status_change' rows shared with other transitions,
// so they are best-effort only and are not drained.
const DRAINABLE_TYPE = "resolved";
const DRAINABLE_STATUS: ReportStatus = "closed";

// A send-error is transient; retrying no-key/disabled/no-recipient is pointless.
export function isTerminal(result: DeliveryResult): boolean {
  return result.sent || result.reason !== "send-error";
}

/**
 * Record the outcome of a just-attempted send on the matching notification row.
 * Targets the most recent undelivered row of the transition's type for the
 * report. Best-effort: a bookkeeping miss must never surface to the caller (the
 * email may already have gone out), so this swallows its own errors.
 */
export async function stampNotificationOutcome(
  reportId: string,
  status: ReportStatus,
  result: DeliveryResult,
  db: SupabaseClient = createServerClient(),
): Promise<void> {
  // Only the 'resolved'/'closed' pair maps cleanly to a single notification
  // type; other statuses share 'status_change' and can't be pinned to one row.
  if (status !== DRAINABLE_STATUS) return;

  try {
    const { data: row } = await db
      .from("notifications")
      .select("id")
      .eq("report_id", reportId)
      .eq("type", DRAINABLE_TYPE)
      .is("delivered_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (!row) return; // un-migrated DB or already stamped. Nothing to do.

    const patch = isTerminal(result)
      ? {
          delivered_at: new Date().toISOString(),
          delivery_error: result.sent ? null : (result.reason ?? "unknown"),
        }
      : { delivery_error: result.reason ?? "send-error" };

    await db.from("notifications").update(patch).eq("id", row.id);
  } catch (err) {
    logger.warn("stamp_outcome_failed", {
      reportId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface DrainSummary {
  scanned: number;
  delivered: number;
  stillFailing: number;
  migrated: boolean;
}

/**
 * Retry the email leg for resolution notifications that never landed. Selects
 * undelivered 'resolved' rows past a short grace window (so an in-flight
 * synchronous send isn't double-fired), then re-runs the composer for each,
 * which re-stamps the row via stampNotificationOutcome on the way out.
 *
 * Idempotent and safe to run on a schedule: a delivered row has delivered_at
 * set and is never re-selected; a terminally-failed row (no-recipient/disabled)
 * is stamped delivered_at on its first drain pass and likewise drops out.
 */
export async function drainUndelivered(
  limit = 200,
  graceMs = 60_000,
): Promise<DrainSummary> {
  // Deferred import breaks the cycle: status-notify imports this module.
  const { notifyReportStatus } = await import("@/lib/notify/status-notify");
  const db = createServerClient();
  const cutoff = new Date(Date.now() - graceMs).toISOString();

  const { data: rows, error } = await db
    .from("notifications")
    .select("id, report_id")
    .eq("type", DRAINABLE_TYPE)
    .is("delivered_at", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit)
    .returns<{ id: string; report_id: string | null }[]>();

  if (error) {
    // delivered_at absent → migration 025 not applied. No-op success so a cron
    // hitting an un-migrated box doesn't alarm.
    logger.warn("drain_query_failed (un-migrated?)", { error: error.message });
    return { scanned: 0, delivered: 0, stillFailing: 0, migrated: false };
  }
  if (!rows || rows.length === 0) {
    return { scanned: 0, delivered: 0, stillFailing: 0, migrated: true };
  }

  let delivered = 0;
  let stillFailing = 0;
  for (const row of rows) {
    if (!row.report_id) {
      // Orphan notification (report deleted), stamp so it drops out.
      await db
        .from("notifications")
        .update({
          delivered_at: new Date().toISOString(),
          delivery_error: "orphan",
        })
        .eq("id", row.id);
      continue;
    }
    const result = await notifyReportStatus(row.report_id, DRAINABLE_STATUS);
    if (isTerminal(result)) delivered++;
    else stillFailing++;
  }

  logger.info("drain_done", { scanned: rows.length, delivered, stillFailing });
  return { scanned: rows.length, delivered, stillFailing, migrated: true };
}
