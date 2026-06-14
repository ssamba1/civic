import "server-only";

import { createServerClient } from "@/lib/db/client";
import { type DeliveryResult, deliverEmail } from "@/lib/notify/deliver";
import type { ReportCategory, ReportStatus } from "@/lib/types";

/* ==================================================================
   Status-change → resident notification composer.

   The DB trigger already writes the IN-APP notification row. This adds the
   OUT-OF-BAND leg: look up the reporter's email + the report's close-out
   evidence, build a per-status message, and hand it to deliverEmail (which
   no-ops gracefully without a key / for anonymous reporters).

   Only the transitions worth a push are handled — resolved (the lever),
   dispatched (acknowledged), rejected (closed-with-reason). open/in_progress
   are intentionally omitted: a bare "in progress" with no substance is noise
   (see docs/loop-closure-plan.md §4 Phase 1 trigger model).
   ================================================================== */

const CATEGORY_LABEL: Partial<Record<ReportCategory, string>> = {
  pothole: "pothole",
  streetlight: "streetlight",
  downed_sign: "downed sign",
  graffiti: "graffiti",
  illegal_dump: "illegal dumping",
  water_leak: "water leak",
  sidewalk_damage: "sidewalk",
  tree_down: "downed tree",
  debris: "debris",
  drainage: "drainage",
  faded_signage: "faded signage",
  other: "",
};

const RESOLUTION_NOTES: Record<ReportCategory, string> = {
  pothole: "Pothole filled and compacted — surface restored and reopened.",
  streetlight:
    "Fixture repaired and relit; circuit tested and back in service.",
  downed_sign: "Sign re-set and re-secured to spec.",
  graffiti: "Surface cleaned and repainted — tag removed.",
  illegal_dump: "Site cleared and debris hauled to the transfer station.",
  water_leak:
    "Leak isolated and repaired; service restored and pressure verified.",
  sidewalk_damage: "Section repaired and leveled — trip hazard removed.",
  tree_down: "Tree cleared and debris chipped; right-of-way reopened.",
  debris: "Debris removed and the area swept clear.",
  drainage: "Drain cleared and flow restored; inlet inspected.",
  faded_signage: "Signage replaced with a fresh, reflective panel.",
  other: "Issue addressed and the report closed out.",
};

interface NotifyRow {
  id: string;
  reporter_id: string;
  classifications:
    | { category: ReportCategory | null }[]
    | { category: ReportCategory | null }
    | null;
  work_orders:
    | { resolution_photo_url: string | null }[]
    | { resolution_photo_url: string | null }
    | null;
}

function reportUrl(reportId: string): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return base ? `${base}/user/my-reports/${reportId}` : null;
}

/**
 * Compose + deliver the out-of-band notification for a status change. Never
 * throws — delivery failures are logged, not propagated, so a notify miss can
 * never roll back the status update that triggered it.
 */
export async function notifyReportStatus(
  reportId: string,
  status: ReportStatus,
): Promise<DeliveryResult> {
  if (status !== "closed" && status !== "dispatched" && status !== "rejected") {
    return { sent: false, reason: "disabled" };
  }

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("reports")
      .select(
        "id, reporter_id, classifications ( category ), work_orders ( resolution_photo_url )",
      )
      .eq("id", reportId)
      .single<NotifyRow>();
    if (error || !data) return { sent: false, reason: "send-error" };

    // Resolve the reporter's email. Anonymous reporters have none → email is
    // skipped downstream (deliverEmail returns no-recipient).
    const { data: userRow } = await db
      .from("users")
      .select("email")
      .eq("id", data.reporter_id)
      .maybeSingle<{ email: string | null }>();
    const to = userRow?.email ?? null;

    const cl = Array.isArray(data.classifications)
      ? (data.classifications[0] ?? null)
      : data.classifications;
    const category = (cl?.category ?? "other") as ReportCategory;
    const noun = CATEGORY_LABEL[category] || "issue";

    const wo = Array.isArray(data.work_orders)
      ? (data.work_orders[0] ?? null)
      : data.work_orders;
    const photoUrl = wo?.resolution_photo_url ?? null;

    let subject: string;
    let heading: string;
    let body: string;
    let withPhoto: string | null = null;

    switch (status) {
      case "closed":
        subject = `Your ${noun} report was resolved`;
        heading = "Resolved — here's what got done";
        body = `${RESOLUTION_NOTES[category]} Thanks for helping keep the city running.`;
        withPhoto = photoUrl; // the operational-transparency lever
        break;
      case "dispatched":
        subject = `Your ${noun} report was picked up`;
        heading = "A crew has your report";
        body =
          "Your report was dispatched to a crew. We'll let you know the moment it's resolved.";
        break;
      default: // rejected
        subject = `Update on your ${noun} report`;
        heading = "Reviewed and closed";
        body =
          "We reviewed your report and closed it out. If the issue persists, please file a new report.";
        break;
    }

    return await deliverEmail({
      to,
      subject,
      heading,
      body,
      photoUrl: withPhoto,
      reportUrl: reportUrl(reportId),
    });
  } catch (err) {
    console.error(
      `[notify] composer threw for ${reportId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { sent: false, reason: "send-error" };
  }
}
