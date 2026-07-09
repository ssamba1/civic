"use server";

/**
 * Server actions for the public report comment thread.
 *
 * Hard rules enforced here (not in the DB, which uses service-role):
 *  1. Caller must be authenticated.
 *  2. Body is validated (shape), sanitized (whitespace/control chars), and
 *     PII-redacted before insert.
 *  3. Report must exist and the caller must be the reporter OR staff-in-city.
 *  4. hideComment is staff-only.
 *  5. Graceful degrade: if the table doesn't exist (migration 055 not applied),
 *     we return a descriptive error rather than crashing.
 */

import { sanitizeCommentBody, validateComment } from "@/lib/comments/moderate";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import { redactPII } from "@/lib/privacy/pii-redact";
import { getStaffAccessForCity, type StaffAccess } from "@/lib/staff-access";
import type { Result } from "@/lib/types";

const logger = createLogger("[comment-actions]");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the report row and check that `userId` may interact with it.
 * Returns { ok: true, data: { report } } or { ok: false, error }.
 */
async function resolveReportAccess(
  reportId: string,
  userId: string,
): Promise<
  Result<{ citySlug: string; reporterOwns: boolean; staffAccess: StaffAccess }>
> {
  const db = createServerClient();
  const { data: report, error } = await db
    .from("reports")
    .select("id, reporter_id, city_id, cities(slug)")
    .eq("id", reportId)
    .maybeSingle();

  if (error) {
    // 42P01 = table not found is not expected for reports, but handle it.
    logger.warn("resolveReportAccess: query error", {
      reportId,
      code: error.code,
    });
    return { ok: false, error: "database_error" };
  }
  if (!report) {
    return { ok: false, error: "report_not_found" };
  }

  const citySlug =
    // biome-ignore lint/suspicious/noExplicitAny: Supabase join type is loose
    (report.cities as any)?.slug ?? null;

  const reporterOwns = report.reporter_id === userId;

  // Check staff access for this city (handles demo + real paths)
  const staffAccess = citySlug ? await getStaffAccessForCity(citySlug) : null;
  const isStaff = staffAccess !== null;

  if (!reporterOwns && !isStaff) {
    return { ok: false, error: "forbidden" };
  }

  // Return the resolved staffAccess so the caller reuses it (no second lookup —
  // avoids a TOCTOU where the two calls disagree).
  return {
    ok: true,
    data: { citySlug: citySlug ?? "", reporterOwns, staffAccess },
  };
}

// ---------------------------------------------------------------------------
// postComment
// ---------------------------------------------------------------------------

/**
 * Post a comment on a report.
 *
 * Validates → sanitizes → redacts PII → inserts.
 * Returns the new comment id on success.
 */
export async function postComment(
  reportId: string,
  body: string,
): Promise<Result<{ id: string }>> {
  // 1. Auth guard
  const user = await getAuthUser();
  if (!user) {
    return { ok: false, error: "unauthenticated" };
  }

  // 2. Validate shape
  const validated = validateComment(body);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  // 3. Sanitize (collapse whitespace / strip control chars)
  const sanitized = sanitizeCommentBody(validated.data);

  // 4. PII redact
  const { redacted } = redactPII(sanitized);

  // 5. Verify report access + resolve author_role
  const accessResult = await resolveReportAccess(reportId, user.id);
  if (!accessResult.ok) {
    return { ok: false, error: accessResult.error };
  }

  // author_role is "staff" ONLY for a verified REAL staff session. "demo" access
  // is public-bundle-baked (proves nothing about the visitor), so a demo user
  // must never be able to post an official-looking "staff" reply — they post as
  // "resident". Reuse the staffAccess already resolved above (no second call).
  const { staffAccess } = accessResult.data;
  const authorRole = staffAccess === "real" ? "staff" : "resident";

  // 6. Insert (service-role client bypasses RLS; access already checked above)
  const db = createServerClient();
  try {
    const { data, error } = await db
      .from("report_comments")
      .insert({
        report_id: reportId,
        author_id: user.id,
        author_role: authorRole,
        body: redacted,
      })
      .select("id")
      .single();

    if (error) {
      // 42P01 = table doesn't exist (migration 055 not applied)
      if (error.code === "42P01") {
        logger.warn(
          "postComment: report_comments table absent (migration 055 not applied)",
        );
        return { ok: false, error: "feature_unavailable" };
      }
      logger.error("postComment: insert failed", error, { reportId });
      return { ok: false, error: "database_error" };
    }

    return { ok: true, data: { id: data.id } };
  } catch (err) {
    logger.warn("postComment: unexpected error", { reportId, err });
    return { ok: false, error: "unexpected_error" };
  }
}

// ---------------------------------------------------------------------------
// hideComment
// ---------------------------------------------------------------------------

/**
 * Hide (soft-delete) a comment. Staff only.
 *
 * Does not expose the hidden comment to the caller — the return value only
 * confirms success or describes the error.
 */
export async function hideComment(
  commentId: string,
): Promise<Result<{ id: string }>> {
  // 1. Auth guard
  const user = await getAuthUser();
  if (!user) {
    return { ok: false, error: "unauthenticated" };
  }

  // 2. Resolve the comment to find its city for staff check
  const db = createServerClient();
  const { data: comment, error: fetchErr } = await db
    .from("report_comments")
    .select("id, report_id, reports(city_id, cities(slug))")
    .eq("id", commentId)
    .maybeSingle();

  if (fetchErr) {
    if (fetchErr.code === "42P01") {
      return { ok: false, error: "feature_unavailable" };
    }
    return { ok: false, error: "database_error" };
  }

  // Existence must not leak to non-staff. A missing comment, a comment with no
  // resolvable city, and a non-staff caller all return the SAME "forbidden" —
  // otherwise a resident could enumerate valid comment ids by observing
  // "comment_not_found" vs "forbidden". Moderation requires REAL staff (a
  // public-bundle "demo" session must not hide real residents' comments).
  const citySlug = comment
    ? // biome-ignore lint/suspicious/noExplicitAny: Supabase join typing is loose
      ((comment.reports as any)?.cities?.slug ?? null)
    : null;
  const staffAccess = citySlug ? await getStaffAccessForCity(citySlug) : null;
  if (!comment || staffAccess !== "real") {
    return { ok: false, error: "forbidden" };
  }

  // 4. Flip hidden
  const { data: updated, error: updateErr } = await db
    .from("report_comments")
    .update({ hidden: true })
    .eq("id", commentId)
    .select("id")
    .single();

  if (updateErr) {
    logger.error("hideComment: update failed", updateErr, { commentId });
    return { ok: false, error: "database_error" };
  }

  return { ok: true, data: { id: updated.id } };
}
