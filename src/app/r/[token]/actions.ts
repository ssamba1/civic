"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { resolvePublicReport } from "@/lib/public-report";
import type { Result } from "@/lib/types";

const logger = createLogger("[public-reopen]");

/* Reopen a resolved report from the public status page (NEXT_100 #7).
   Possession of the unguessable token IS the auth. The reporter is the only
   one who has it (same model as one-tap CSAT). Only a resolved/closed report
   can be reopened; writes a timeline row so staff see why it came back. */
export async function reopenReport(token: string): Promise<Result<void>> {
  const report = await resolvePublicReport(token);
  if (!report) return { ok: false, error: "not_found" };
  if (report.publicStatus !== "resolved" && report.publicStatus !== "closed") {
    return { ok: false, error: "not_reopenable" };
  }

  const db = createServerClient();
  const { error } = await db
    .from("reports")
    .update({ status: "open", updated_at: new Date().toISOString() })
    .eq("id", report.reportId);
  if (error) {
    logger.error("reopen_failed", undefined, { detail: error.message });
    return { ok: false, error: "update_failed" };
  }

  // Timeline note so the desk sees the reopen and its reason. Best-effort.
  await db.from("report_updates").insert({
    report_id: report.reportId,
    status: "open",
    actor: "resident",
    note: "Reporter reopened this. The issue is still not resolved.",
  });

  revalidatePath(`/r/${token}`);
  return { ok: true, data: undefined };
}
