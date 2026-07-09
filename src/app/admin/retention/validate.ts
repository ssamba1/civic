// Pure retention-settings types + validation. Kept OUT of actions.ts because
// that file is "use server" (may only export async server actions); a client
// component (retention-form.tsx) and the unit test both need the sync
// validateRetention helper, so it lives in this plain module.

import { z } from "zod/v4";
import type { Result } from "@/lib/types";

export interface RetentionSettings {
  id: string;
  city_id: string | null;
  raw_photo_ttl_days: number;
  freetext_ttl_days: number;
  updated_at: string;
}

export interface RetentionInput {
  raw_photo_ttl_days: number;
  freetext_ttl_days: number;
}

export const retentionSchema = z.object({
  raw_photo_ttl_days: z
    .number()
    .int()
    .min(1, "Must retain raw photos for at least 1 day")
    .max(3650, "TTL cannot exceed 10 years"),
  freetext_ttl_days: z
    .number()
    .int()
    .min(1, "Must retain descriptions for at least 1 day")
    .max(3650, "TTL cannot exceed 10 years"),
});

/** Pure validation helper — no I/O. */
export function validateRetention(input: unknown): Result<RetentionInput> {
  const parsed = retentionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }
  return { ok: true, data: parsed.data };
}
