import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { type ChatScope, deriveScope, type UserRow } from "@/lib/ai/chat/scope";
import { createSSRClient, getAuthUser } from "@/lib/db/ssr-client";
import { DEMO_CITY, DEMO_SESSION_COOKIE } from "@/lib/demo-auth";
import { findVerifiedDemoAccount } from "@/lib/demo-cookie";
import { DEMO_MODE } from "@/lib/demo-mode";

export interface ChatContext extends ChatScope {
  /** Cookie-scoped SSR client. RLS enforces all reads. NEVER service-role. */
  supabase: SupabaseClient;
}

/**
 * Resolve the per-request chat context: the user's own RLS-scoped Supabase
 * client plus their role + city. Anonymous callers get role "anon" and a
 * client that can still read public data (cities, dashboard_reports_view).
 *
 * Demo personas (cookie-based, no Supabase session) resolve to their persona's
 * role scoped to the demo city, so the assistant answers as the persona
 * instead of falling to anon. DEMO_MODE-gated: the cookie is client-supplied
 * and grants nothing on a live deploy. The Supabase client stays the anon
 * RLS-scoped one, role here only widens which TOOLS the chat may use, and
 * every read still runs under anon RLS.
 */
export async function resolveChatContext(): Promise<ChatContext> {
  const supabase = await createSSRClient();
  const user = await getAuthUser();
  if (!user) {
    if (DEMO_MODE) {
      const demo = findVerifiedDemoAccount(
        (await cookies()).get(DEMO_SESSION_COOKIE)?.value,
      );
      if (demo) {
        return {
          supabase,
          userId: null,
          role: demo.role === "user" ? "resident" : "staff_dispatcher",
          citySlug: DEMO_CITY,
        };
      }
    }
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
