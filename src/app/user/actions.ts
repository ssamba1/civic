"use server";

import { createServerClient } from "@/lib/db/client";
import { createSSRClient } from "@/lib/db/ssr-client";

/**
 * Self-heal the signed-in resident's `public.users` row.
 *
 * Anon/guest/OAuth users have no row (there's no signup trigger), and the
 * report→status→notification DB trigger writes `notifications.user_id` against
 * `public.users`, so until a row exists, status-change notifications can't be
 * persisted for that resident. `submitReport` already self-heals on first
 * report; this runs the same heal at sign-in (called by AnonBootstrap) so the
 * row exists BEFORE the first report resolves, not after.
 *
 * Mirrors the upsert in app/report/actions.ts (defaults to the Cumming demo
 * city). Never throws. An unconfigured/unavailable Supabase is a silent no-op
 * so the anon-first surface keeps working in demo mode.
 */
export async function ensureResidentProfile(): Promise<void> {
  try {
    const ssr = await createSSRClient();
    const {
      data: { user },
    } = await ssr.auth.getUser();
    if (!user) return;

    // Already has a profile row → nothing to do.
    const { data: profile } = await ssr
      .from("users")
      .select("id")
      .eq("id", user.id)
      .maybeSingle<{ id: string }>();
    if (profile?.id) return;

    // Resolve the default city and create the row via the service role (the
    // resident can't insert their own users row under RLS).
    const service = createServerClient();
    const { data: city } = await service
      .from("cities")
      .select("id")
      .eq("slug", "cumming")
      .single<{ id: string }>();
    if (!city?.id) return;

    await service.from("users").upsert(
      {
        id: user.id,
        city_id: city.id,
        role: "resident",
        email: user.email ?? null,
      },
      { onConflict: "id" },
    );
  } catch {
    // Unconfigured/unavailable Supabase (demo mode), silent no-op.
  }
}
