function required(name: string, value: string | undefined): string {
  if (!value)
    throw new Error(`Missing ${name}. Copy .env.example to .env.local.`);
  return value.replace(/\/$/, "");
}

export const config = {
  previewMode:
    process.env.NODE_ENV !== "production" &&
    process.env.EXPO_PUBLIC_PREVIEW_MODE === "1",
  apiUrl: required(
    "EXPO_PUBLIC_CIVIC_API_URL",
    process.env.EXPO_PUBLIC_CIVIC_API_URL,
  ),
  supabaseUrl: required(
    "EXPO_PUBLIC_SUPABASE_URL",
    process.env.EXPO_PUBLIC_SUPABASE_URL,
  ),
  supabaseAnonKey: required(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
};
