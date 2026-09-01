import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import {
  API_KEY_SCOPES,
  type ApiKeyRow,
  type ApiKeyScope,
} from "@/lib/open311/api-key-types";
import type { Result } from "@/lib/types";

const logger = createLogger("[open311-admin-keys]");

export type { ApiKeyRow, ApiKeyScope };
// Re-export the client-safe shapes so existing server callers keep importing
// from this module.
export { API_KEY_SCOPES };

/* ==================================================================
   Operator-side Open311 API key management (issue / list / revoke).

   Read-path lookup lives in api-keys.ts; this is the write path used only by the
   /admin console. Keys are stored SHA-256-hashed. The plaintext exists once, at
   issuance, and is returned to the operator a single time (mintApiKey). All
   functions run service-role (no client RLS on api_keys, migration 028);
   authorization is enforced at the server-action layer.
   ================================================================== */

/** Human-visible prefix so a leaked key is greppable/identifiable in logs. */
const KEY_PREFIX = "civic_sk_";

function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** List every key (active + revoked), newest first. Never returns plaintext. */
export async function listApiKeys(): Promise<ApiKeyRow[]> {
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("api_keys")
      .select("id, label, city_id, scopes, created_at, revoked_at")
      .order("created_at", { ascending: false });
    if (error) {
      logger.warn("list_failed (un-migrated?)", { error: error.message });
      return [];
    }
    return (data ?? []).map((r) => ({
      id: r.id as string,
      label: r.label as string,
      cityId: (r.city_id as string | null) ?? null,
      scopes: (r.scopes as string[]) ?? [],
      createdAt: r.created_at as string,
      revokedAt: (r.revoked_at as string | null) ?? null,
    }));
  } catch (err) {
    logger.error("list_threw", err);
    return [];
  }
}

/**
 * Issue a new key. Generates a cryptographically-random plaintext, stores only
 * its hash, and returns the plaintext ONCE. It can never be recovered after.
 * `userId` is the partner's attribution identity (reports created with this key
 * get that reporter_id); it must reference a real users row (FK, migration 028).
 */
export async function mintApiKey(input: {
  label: string;
  userId: string;
  cityId: string | null;
  scopes: string[];
}): Promise<Result<{ id: string; plaintext: string }>> {
  const plaintext = KEY_PREFIX + randomBytes(24).toString("hex");
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("api_keys")
      .insert({
        key_hash: hashKey(plaintext),
        label: input.label,
        user_id: input.userId,
        city_id: input.cityId,
        scopes: input.scopes,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) {
      logger.error("mint_failed", error ?? new Error("no row"));
      return { ok: false, error: error?.message ?? "insert_failed" };
    }
    return { ok: true, data: { id: data.id, plaintext } };
  } catch (err) {
    logger.error("mint_threw", err);
    return { ok: false, error: "internal_error" };
  }
}

/** Revoke a key (soft, stamps revoked_at so lookups stop matching it). */
export async function revokeApiKey(id: string): Promise<Result<void>> {
  try {
    const db = createServerClient();
    const { error } = await db
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .is("revoked_at", null);
    if (error) {
      logger.error("revoke_failed", error);
      return { ok: false, error: error.message };
    }
    return { ok: true, data: undefined };
  } catch (err) {
    logger.error("revoke_threw", err);
    return { ok: false, error: "internal_error" };
  }
}
