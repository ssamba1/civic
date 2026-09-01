import "server-only";

import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("[csat]");

/**
 * Record a one-tap resolution rating for a report (report_csat, migration 025).
 * Called from the public status page. Possession of the unguessable token is
 * the auth, so this runs service-role with no session. Upsert = last tap wins.
 *
 * Returns the rating on success and ALSO on failure: demo-corpus reports have
 * no DB row (FK fails), and the resident should still see the thanks state.
 * The rating's absence from analytics is the correct demo behavior.
 */
export async function recordCsat(
  reportId: string,
  rating: "up" | "down",
): Promise<"up" | "down"> {
  try {
    const db = createServerClient();
    const { error } = await db.from("report_csat").upsert(
      {
        report_id: reportId,
        rating,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "report_id" },
    );
    if (error) {
      logger.info("csat_not_persisted", { reportId, error: error.message });
    }
  } catch (err) {
    logger.error("csat_record_threw", err, { reportId });
  }
  return rating;
}
