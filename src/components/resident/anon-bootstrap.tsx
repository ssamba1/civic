"use client";

import { useEffect } from "react";
import { createBrowserSupabase } from "@/lib/db/browser-client";

/**
 * Resident anon-first bootstrap (PLAN.md §7). The resident surface has no login
 * wall — if the visitor has no Supabase session, silently create an anonymous
 * one so reports, upvotes, and "my reports" attach to a stable id without a
 * sign-in step. Renders nothing; mirrors the effect in /report's page. Sign-in
 * (to upgrade to a cross-device account) stays available via the nav.
 */
export function AnonBootstrap() {
  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) supabase.auth.signInAnonymously();
    });
  }, []);

  return null;
}
