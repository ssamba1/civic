import { NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { bearerMatches } from "@/lib/auth/cron-bearer";
import { createServerClient } from "@/lib/db/client";
import { createSSRClient, getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import type { ReportCategory } from "@/lib/types";
import { buildStormAdvisory } from "@/lib/weather/storm-advisory";

const logger = createLogger("[surge]");

const STAFF_ROLES = ["staff_dispatcher", "staff_supervisor", "admin"];
const BACKLOG_STATUSES = ["open", "dispatched", "in_progress"];

/**
 * Authorize a staff/admin session, or a shared STORM_CRON_SECRET bearer token so
 * a timer can auto-apply surge priority headlessly. Mirrors sla-escalate.
 * Returns null on success, or a NextResponse to short-circuit.
 */
async function authorize(request: Request): Promise<NextResponse | null> {
  const rl = checkRateLimit(`surge:${clientIp(request)}`, {
    windowMs: 60_000,
    max: 20,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  if (
    bearerMatches(
      request.headers.get("authorization"),
      process.env.STORM_CRON_SECRET,
    )
  ) {
    return null;
  }

  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1";
  if (devBypass) return null;

  const user = await getAuthUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ssr = await createSSRClient();
  const { data: profile } = await ssr
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !STAFF_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** GET — read-only storm advisory for the surge banner. */
export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  try {
    const advisory = await buildStormAdvisory();
    return NextResponse.json(advisory);
  } catch (err) {
    logger.error("surge_advisory_failed", err);
    return NextResponse.json({ error: "advisory_failed" }, { status: 500 });
  }
}

/**
 * POST — auto-reprioritize open backlog for storm-affected categories (#63).
 *
 * IDEMPOTENT: priority_score is SET to a value computed purely from the report's
 * severity/emergency × the category's surge multiplier — never incremented — so
 * re-running (or a cron firing repeatedly) converges to the same score instead
 * of climbing without bound. No schema change: reuses the existing
 * work_orders.priority_score column.
 */
export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  try {
    const advisory = await buildStormAdvisory();
    if (!advisory.hasActiveOrRecentStorm) {
      return NextResponse.json({ reprioritized: 0, storm: false });
    }

    const multiplierByCat = new Map<ReportCategory, number>(
      advisory.categoryBreakdown.map((c) => [c.category, c.multiplier]),
    );
    const cats = [...multiplierByCat.keys()];
    if (cats.length === 0)
      return NextResponse.json({ reprioritized: 0, storm: true });

    const db = createServerClient();
    // Open backlog reports in affected categories, with the classification
    // signal needed to recompute a deterministic surge priority.
    const { data: rows, error } = await db
      .from("reports")
      .select(
        "id, status, classifications!inner(category, severity, is_emergency), work_orders!inner(id, priority_score)",
      )
      .in("status", BACKLOG_STATUSES)
      .in("classifications.category", cats)
      .limit(1000);

    if (error) {
      logger.warn("surge_query_failed", { error: error.message });
      return NextResponse.json({ reprioritized: 0, storm: true, error: true });
    }

    let reprioritized = 0;
    for (const row of (rows ?? []) as Array<{
      classifications:
        | { category: ReportCategory; severity: number; is_emergency: boolean }
        | {
            category: ReportCategory;
            severity: number;
            is_emergency: boolean;
          }[];
      work_orders: { id: string } | { id: string }[];
    }>) {
      const cl = Array.isArray(row.classifications)
        ? row.classifications[0]
        : row.classifications;
      const wo = Array.isArray(row.work_orders)
        ? row.work_orders[0]
        : row.work_orders;
      if (!cl || !wo) continue;
      const multiplier = multiplierByCat.get(cl.category) ?? 1;
      // Same base formula as generateWorkOrder (severity*2 + emergency*50).
      const base = cl.severity * 2 + (cl.is_emergency ? 50 : 0);
      const surged = Math.round(base * multiplier * 100) / 100;
      const { error: upErr } = await db
        .from("work_orders")
        .update({ priority_score: surged })
        .eq("id", wo.id);
      if (!upErr) reprioritized++;
    }

    logger.info("surge_reprioritized", {
      reprioritized,
      categories: cats.length,
    });
    return NextResponse.json({
      reprioritized,
      storm: true,
      headline: advisory.headlineAlert?.event ?? null,
    });
  } catch (err) {
    logger.error("surge_reprioritize_threw", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
