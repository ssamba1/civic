import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

export function createServerClient() {
  return createClient(
    serverEnv.SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}
