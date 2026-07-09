import { NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { createServerClient } from "@/lib/db/client";
import { createSSRClient, getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("[sla-escalate]");

// Priority bump applied to an overdue work order so it floats up the grid sort.
const ESCALATION_PRIORITY_BUMP = 25;
// Statuses that still count as "open backlog" — a report already closed or
// rejected/merged is never escalated even if its work order lacks completed_at.
const BACKLOG_STATUSES = new Set(["open", "dispatched", "in_progress"]);

/**
 * Overdue-SLA escalation drain (LCP-16). Finds open work orders whose `due_at`
 * (migration 032) has passed and that have not been escalated yet, then for
 * each: appends a `system` note to the report timeline, raises priority so it
 * surfaces in the grid, and stamps `escalated_at` so the job is idempotent
 * (a second run never double-escalates the same work order).
 *
 * Auth: either a staff/admin session (manual "escalate now" from the app) OR a
 * shared `SLA_CRON_SECRET` bearer token so a systemd timer / external cron on
 * the self-hosted box can hit it headlessly. Mirrors the notify-drain pattern.
 */
export async function POST(request: Request) {
  // IP throttle atop the auth/bearer gate — a leaked secret or a compromised
  // staff session still can't hammer the escalation scan.
  const rl = checkRateLimit(`sla_escalate:${clientIp(request)}`, {
    windowMs: 60_000,
    max: 10,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const cronSecret = process.env.SLA_CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronOk = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!cronOk) {
    const isDev = process.env.NODE_ENV === "development";
    const devBypass = isDev && process.env.DEV_AUTH_BYPASS === "1";
    if (!devBypass) {
      const user = await getAuthUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const ssr = await createSSRClient();
      const { data: profile } = await ssr
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (
        !profile ||
        !["staff_dispatcher", "staff_supervisor", "admin"].includes(
          profile.role,
        )
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  try {
    const db = createServerClient();
    const nowIso = new Date().toISOString();

    // Overdue, still-open, not-yet-escalated work orders.
    const { data: overdue, error } = await db
      .from("work_orders")
      .select("id, report_id, priority_score, due_at")
      .is("completed_at", null)
      .is("escalated_at", null)
      .not("due_at", "is", null)
      .lt("due_at", nowIso)
      .limit(500);

    if (error) {
      // due_at/escalated_at absent → migration 032 not applied. Treat as a
      // no-op success so a cron hitting an un-migrated box doesn't alarm.
      logger.warn("sla_escalate_query_failed (un-migrated?)", {
        error: error.message,
      });
      return NextResponse.json({ escalated: 0, skipped: 0, migrated: false });
    }

    if (!overdue || overdue.length === 0) {
      return NextResponse.json({ escalated: 0, skipped: 0, migrated: true });
    }

    // Fetch current report statuses so we only escalate live backlog and can
    // stamp the timeline row with the report's actual status.
    const reportIds = overdue.map((w) => w.report_id);
    const { data: reports } = await db
      .from("reports")
      .select("id, status")
      .in("id", reportIds);
    const statusById = new Map(
      (reports ?? []).map((r) => [r.id as string, r.status as string]),
    );

    let escalated = 0;
    let skipped = 0;
    for (const wo of overdue) {
      const status = statusById.get(wo.report_id);
      if (!status || !BACKLOG_STATUSES.has(status)) {
        // Report is closed/rejected/merged — mark escalated_at so it drops out
        // of future scans, but take no escalation action.
        await db
          .from("work_orders")
          .update({ escalated_at: nowIso })
          .eq("id", wo.id);
        skipped++;
        continue;
      }

      const note = `SLA breached (due ${wo.due_at}) — auto-escalated, priority raised +${ESCALATION_PRIORITY_BUMP}`;
      // Timeline note (best-effort; report_updates ships in migration 025).
      const { error: noteErr } = await db.from("report_updates").insert({
        report_id: wo.report_id,
        status,
        actor: "system",
        note,
      });
      if (noteErr) {
        logger.warn("sla_escalate_note_failed", {
          workOrderId: wo.id,
          error: noteErr.message,
        });
      }

      const { error: bumpErr } = await db
        .from("work_orders")
        .update({
          escalated_at: nowIso,
          priority_score:
            (typeof wo.priority_score === "number" ? wo.priority_score : 0) +
            ESCALATION_PRIORITY_BUMP,
        })
        .eq("id", wo.id);
      if (bumpErr) {
        logger.error("sla_escalate_bump_failed", bumpErr, {
          workOrderId: wo.id,
        });
        continue;
      }
      escalated++;
    }

    logger.info("sla_escalate_done", { escalated, skipped });
    return NextResponse.json({ escalated, skipped, migrated: true });
  } catch (err) {
    logger.error("sla_escalate_threw", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
