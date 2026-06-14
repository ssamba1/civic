"use client";

import { useEffect } from "react";
import { ensureResidentProfile } from "@/app/user/actions";
import { createBrowserSupabase } from "@/lib/db/browser-client";

/**
 * Resident anon-first bootstrap (PLAN.md §7). The resident surface has no login
 * wall — if the visitor has no Supabase session, silently create an anonymous
 * one so reports, upvotes, and "my reports" attach to a stable id without a
 * sign-in step. Renders nothing; mirrors the effect in /report's page. Sign-in
 * (to upgrade to a cross-device account) stays available via the nav.
 *
 * Once a session exists (new or existing), self-heal the resident's
 * public.users row so the status-change notification trigger has a row to write
 * against — closing the gap where a fresh anon user filed a report before any
 * users row existed.
 */
export function AnonBootstrap() {
  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        await supabase.auth.signInAnonymously();
      }
      // Runs whether the session was just created or already present; the
      // action is idempotent and a silent no-op when Supabase is unconfigured.
      void ensureResidentProfile();
    });
  }, []);

  return null;
}
