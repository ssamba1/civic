import "server-only";

import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { type DeliveryResult, deliverEmail } from "@/lib/notify/deliver";
import { deliverSms } from "@/lib/notify/deliver-sms";
import { stampNotificationOutcome } from "@/lib/notify/outbox";
import { publicToken } from "@/lib/public-report";
import type { ReportCategory, ReportStatus } from "@/lib/types";

const logger = createLogger("[notify-composer]");

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
  // Link to the account-less public status page (opaque token) — it works from
  // an inbox with no session, unlike the auth-scoped /user/my-reports view.
  return base ? `${base}/r/${publicToken(reportId)}` : null;
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
      .select("email, phone")
      .eq("id", data.reporter_id)
      .maybeSingle<{ email: string | null; phone: string | null }>();
    const to = userRow?.email ?? null;
    const toPhone = userRow?.phone ?? null;

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

    const url = reportUrl(reportId);
    // Stamp the report's public token so the emailed /r/[token] link resolves
    // against the LIVE database (the demo corpus resolves in-memory). Lazy,
    // idempotent, best-effort — a failure must never block the send.
    if (url) {
      await db
        .from("reports")
        .update({ public_token: publicToken(reportId) })
        .eq("id", reportId)
        .is("public_token", null);
    }

    let actions: Array<{ label: string; url: string }> | undefined;

    switch (status) {
      case "closed":
        subject = `Your ${noun} report was resolved`;
        heading = "Resolved — here's what got done";
        body = `${RESOLUTION_NOTES[category]} Thanks for helping keep the city running.`;
        withPhoto = photoUrl; // the operational-transparency lever
        // One-tap CSAT: recorded by the public status page, no login needed.
        if (url) {
          actions = [
            { label: "👍 Job well done", url: `${url}?rate=up` },
            { label: "👎 Not fixed right", url: `${url}?rate=down` },
          ];
        }
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

    const result = await deliverEmail({
      to,
      subject,
      heading,
      body,
      photoUrl: withPhoto,
      reportUrl: url,
      actions,
    });

    // SMS companion (#1/#2): the same close-the-loop beat, one line + the
    // status link, for reporters who left a phone. Independent of the email
    // leg — a reporter may have one channel, both, or (anonymous) neither.
    // Best-effort: an SMS miss never affects the email result or the status
    // update. deliverSms no-ops without a recipient or Twilio creds.
    if (toPhone) {
      const smsBody = url ? `Civic: ${subject}. ${url}` : `Civic: ${subject}.`;
      const smsResult = await deliverSms({ to: toPhone, body: smsBody });
      if (!smsResult.sent && smsResult.reason === "send-error") {
        logger.warn("status_sms_failed", { reportId, status });
      }
    }

    // Record the outcome on the matching notification row so a delivered email
    // drops out of the drain and a transient failure stays visible for retry
    // (migration 025 delivered_at/delivery_error). Best-effort — reuses the db
    // handle already open here.
    await stampNotificationOutcome(reportId, status, result, db);

    return result;
  } catch (err) {
    logger.error("Notification composer threw", err, { reportId });
    return { sent: false, reason: "send-error" };
  }
}
