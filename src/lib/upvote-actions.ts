"use server";

import { createSSRClient } from "@/lib/db/ssr-client";
import type { Result } from "@/lib/types";

// Toggle the current user's upvote on a report. Login-gated; RLS enforces
// user_id = auth.uid() and that the report is in the user's city.
export async function toggleUpvote(
  reportId: string
): Promise<Result<{ upvoted: boolean }>> {
  const ssr = await createSSRClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data: existing } = await ssr
    .from("report_upvotes")
    .select("report_id")
    .eq("report_id", reportId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await ssr
      .from("report_upvotes")
      .delete()
      .eq("report_id", reportId)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { upvoted: false } };
  }

  const { error } = await ssr
    .from("report_upvotes")
    .insert({ report_id: reportId, user_id: user.id });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { upvoted: true } };
}
