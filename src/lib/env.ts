import { z } from "zod/v4";

const serverEnvSchema = z
  .object({
    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    GEMINI_API_KEY: z.string().min(1),
    SENTRY_DSN: z.string().optional(),
    INTERNAL_CLASSIFY_SECRET: z.string().optional(),
    OPEN311_API_KEY: z.string().optional(),
    OPEN311_SYSTEM_USER_ID: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    NOTIFY_FROM_EMAIL: z.string().optional(),
    NOTIFY_DISABLE: z.string().optional(),
    DEV_AUTH_BYPASS: z.string().optional(),
    // The single request header that carries the real client IP for rate
    // limiting. Set to the platform-set, un-spoofable header for your deploy
    // (e.g. "x-real-ip" on Vercel/nginx). When set, ONLY this header is trusted,
    // so a client can't rotate the limiter key by forging x-forwarded-for.
    RATE_LIMIT_TRUSTED_HEADER: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // In production the rate limiter MUST key off a platform-set, un-spoofable
    // header — otherwise clientIp() silently falls back to client-forgeable
    // x-real-ip / x-forwarded-for and an attacker rotates the key to defeat every
    // AI + Open311 limit (unbounded Gemini spend). Fail loud on misconfig rather
    // than degrade silently. Dev/test are exempt (no trusted proxy in front).
    if (
      process.env.NODE_ENV === "production" &&
      !env.RATE_LIMIT_TRUSTED_HEADER?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["RATE_LIMIT_TRUSTED_HEADER"],
        message:
          "required in production: set to the platform's un-spoofable client-IP header (e.g. x-real-ip) so the rate-limit key cannot be forged",
      });
    }
  });

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_DEMO_MODE: z.string().optional(),
  NEXT_PUBLIC_DEMO_SITE_URL: z.string().optional(),
  NEXT_PUBLIC_TESTING_SITE_URL: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().optional(),
  NEXT_PUBLIC_ASYNC_CLASSIFY: z.string().optional(),
});

function parseServerEnv() {
  try {
    return serverEnvSchema.parse({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      SENTRY_DSN: process.env.SENTRY_DSN,
      INTERNAL_CLASSIFY_SECRET: process.env.INTERNAL_CLASSIFY_SECRET,
      OPEN311_API_KEY: process.env.OPEN311_API_KEY,
      OPEN311_SYSTEM_USER_ID: process.env.OPEN311_SYSTEM_USER_ID,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      NOTIFY_FROM_EMAIL: process.env.NOTIFY_FROM_EMAIL,
      NOTIFY_DISABLE: process.env.NOTIFY_DISABLE,
      DEV_AUTH_BYPASS: process.env.DEV_AUTH_BYPASS,
      RATE_LIMIT_TRUSTED_HEADER: process.env.RATE_LIMIT_TRUSTED_HEADER,
    });
  } catch (err) {
    const issues =
      err instanceof z.ZodError
        ? err.issues.map((i) => i.path.join(".") || String(i)).join(", ")
        : String(err);
    throw new Error(
      `Missing or invalid server environment variables: ${issues}`,
    );
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
    NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
    NEXT_PUBLIC_DEMO_SITE_URL: process.env.NEXT_PUBLIC_DEMO_SITE_URL,
    NEXT_PUBLIC_TESTING_SITE_URL: process.env.NEXT_PUBLIC_TESTING_SITE_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_ASYNC_CLASSIFY: process.env.NEXT_PUBLIC_ASYNC_CLASSIFY,
  });
}
