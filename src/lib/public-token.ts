import { createHash } from "node:crypto";

/* ==================================================================
   The /r/[token] token derivation, on its own.

   Deliberately NOT in public-report.ts: that module is `server-only`, which
   makes it unimportable from a plain Node script, and the backfill in
   scripts/backfill-public-tokens.ts has to produce byte-identical tokens to
   the ones status-notify stamps at runtime. The alternative — copying four
   lines of hashing into the script — is precisely the writer/reader drift that
   silently broke photo classification when the classify pipeline spelled out a
   storage path the uploader had stopped using.

   Nothing secret lives here beyond the salt, which is read from the
   environment, so there is nothing for `server-only` to protect.
   ================================================================== */

// Production should set PUBLIC_TOKEN_SALT to a secret so tokens can't be
// recomputed by a third party who knows the id scheme. The default keeps the
// demo deterministic across restarts. Server env validation THROWS in
// production when it is unset — report ids are public through the Open311 API,
// so a known salt would let anyone derive every resident's status URL.
const TOKEN_SALT = process.env.PUBLIC_TOKEN_SALT ?? "civic-public-status-v1";

/** Opaque, stable, unguessable token for a report id. */
export function publicToken(reportId: string): string {
  return createHash("sha256")
    .update(`${TOKEN_SALT}:${reportId}`)
    .digest("hex")
    .slice(0, 24);
}
