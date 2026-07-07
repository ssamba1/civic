import "server-only";

import { createHash } from "node:crypto";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("[open311-api-keys]");

export interface ApiKeyPartner {
  id: string;
  label: string;
  userId: string;
  cityId: string | null;
  scopes: string[];
}

/**
 * Resolve a plaintext Open311 API key to its partner row (api_keys, migration
 * 028). Keys are stored as SHA-256 hex — the hash lookup is inherently
 * constant-time with respect to the stored value. Returns null for unknown or
 * revoked keys AND on any infrastructure error (un-migrated table included),
 * so the caller's legacy env-key fallback keeps working.
 */
export async function lookupApiKey(
  plaintext: string,
): Promise<ApiKeyPartner | null> {
  if (!plaintext || plaintext.length > 512) return null;
  try {
    const keyHash = createHash("sha256").update(plaintext).digest("hex");
    const db = createServerClient();
    const { data, error } = await db
      .from("api_keys")
      .select("id, label, user_id, city_id, scopes")
      .eq("key_hash", keyHash)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) {
      logger.warn("api_key_lookup_failed (un-migrated?)", {
        error: error.message,
      });
      return null;
    }
    if (!data) return null;
    return {
      id: data.id as string,
      label: data.label as string,
      userId: data.user_id as string,
      cityId: (data.city_id as string | null) ?? null,
      scopes: (data.scopes as string[]) ?? [],
    };
  } catch (err) {
    logger.error("api_key_lookup_threw", err);
    return null;
  }
}
