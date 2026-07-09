/**
 * Read-only query helpers for report_comments.
 *
 * All writes go through the server action (src/app/report/comment-actions.ts).
 * This file is intentionally query-only so it can be imported in Server
 * Components without pulling in server-action / auth imports.
 */

import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import type { ReportComment } from "@/lib/types";

const logger = createLogger("[comments]");

/**
 * Fetch all visible (non-hidden) comments for a report, oldest first.
 *
 * Gracefully returns [] when:
 *  - The report_comments table doesn't exist yet (migration 055 not deployed).
 *  - The report has no comments.
 *  - Any unexpected query error.
 *
 * Uses the service-role client — hidden filtering is applied in the query
 * directly (`hidden = false`) rather than relying on RLS, so this is safe to
 * call from Server Components that already verified the caller may see the
 * report (e.g. getMyReport returned a row).
 */
export async function listComments(reportId: string): Promise<ReportComment[]> {
  const service = createServerClient();
  try {
    const { data, error } = await service
      .from("report_comments")
      .select("id, report_id, author_id, author_role, body, created_at")
      .eq("report_id", reportId)
      .eq("hidden", false)
      .order("created_at", { ascending: true });

    if (error) {
      // 42P01 = table does not exist (migration 055 not yet applied)
      logger.warn("listComments: query failed (degrade to [])", {
        reportId,
        code: error.code,
        message: error.message,
      });
      return [];
    }

    return (data ?? []) as ReportComment[];
  } catch (err) {
    logger.warn("listComments: unexpected error (degrade to [])", {
      reportId,
      err,
    });
    return [];
  }
}
