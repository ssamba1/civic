import type { SupabaseClient } from "@supabase/supabase-js";
import { type ChatScope, deriveScope, type UserRow } from "@/lib/ai/chat/scope";
import { createSSRClient, getAuthUser } from "@/lib/db/ssr-client";

export interface ChatContext extends ChatScope {
  /** Cookie-scoped SSR client. RLS enforces all reads. NEVER service-role. */
  supabase: SupabaseClient;
}

/**
 * Resolve the per-request chat context: the user's own RLS-scoped Supabase
 * client plus their role + city. Anonymous callers get role "anon" and a
 * client that can still read public data (cities, dashboard_reports_view).
 */
export async function resolveChatContext(): Promise<ChatContext> {
  const supabase = await createSSRClient();
  const user = await getAuthUser();
  if (!user) {
    return { supabase, ...deriveScope(null) };
  }

  // RLS: users_select_own returns only the caller's own row; cities is public.
  const { data } = await supabase
    .from("users")
    .select("id, role, cities(slug)")
    .eq("id", user.id)
    .maybeSingle<UserRow>();

  return { supabase, ...deriveScope(data ?? null) };
}
