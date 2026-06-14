import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabase() {
  return createBrowserClient(
    // biome-ignore lint/style/noNonNullAssertion: required NEXT_PUBLIC_* env, validated by clientEnvSchema in lib/env.ts
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // biome-ignore lint/style/noNonNullAssertion: required NEXT_PUBLIC_* env, validated by clientEnvSchema in lib/env.ts
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
