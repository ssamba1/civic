import { createServerClient as createSupabaseSSRClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cookie-aware Supabase client for Server Components, Server Actions, and Route Handlers.
 * Reads the user session from request cookies. Use this for all user-facing auth checks.
 * Never use the service-role client (lib/db/client.ts) for auth checks.
 */
export async function createSSRClient() {
  const cookieStore = await cookies();
  return createSupabaseSSRClient(
    // biome-ignore lint/style/noNonNullAssertion: required NEXT_PUBLIC_* env, validated by clientEnvSchema in lib/env.ts
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // biome-ignore lint/style/noNonNullAssertion: required NEXT_PUBLIC_* env, validated by clientEnvSchema in lib/env.ts
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from Server Component — cookie writes ignored (expected)
          }
        },
      },
    },
  );
}

/**
 * Get the authenticated user from the current request's session.
 * Returns null if unauthenticated.
 */
export async function getAuthUser() {
  const supabase = await createSSRClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}
