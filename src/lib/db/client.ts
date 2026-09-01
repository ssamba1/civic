import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * @internal SERVER-ONLY. Builds a Supabase client with the service-role key,
 * which BYPASSES Row-Level Security. Never import this into a client component
 * or any module reachable from the browser bundle. It would leak the
 * service-role key and grant unrestricted DB access. For user-facing auth
 * checks use the cookie-aware SSR client (lib/db/ssr-client.ts) instead; reach
 * for this only in route handlers, server actions, and background jobs that
 * must run with elevated privileges.
 */
export function createServerClient() {
  return createClient(
    serverEnv.SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}
