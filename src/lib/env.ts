import { z } from "zod/v4";

const serverEnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  SENTRY_DSN: z.string().optional(),
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

function parseServerEnv() {
  try {
    return serverEnvSchema.parse({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      SENTRY_DSN: process.env.SENTRY_DSN,
    });
  } catch (err) {
    const issues =
      err instanceof z.ZodError
        ? err.issues.map((i) => i.path.join(".") || String(i)).join(", ")
        : String(err);
    throw new Error(`Missing or invalid server environment variables: ${issues}`);
  }
}

let cachedServerEnv: z.infer<typeof serverEnvSchema> | null = null;

export function getServerEnv() {
  if (cachedServerEnv === null) {
    cachedServerEnv = parseServerEnv();
  }
  return cachedServerEnv;
}

// Lazy proxy: defers env validation to first property access (request time),
// so build-time route collection doesn't require secrets to be present.
export const serverEnv = new Proxy({} as z.infer<typeof serverEnvSchema>, {
  get(_target, prop) {
    return getServerEnv()[prop as keyof z.infer<typeof serverEnvSchema>];
  },
});

export function getClientEnv() {
  return clientEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
