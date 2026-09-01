-- =============================================================================
-- Civic, Per-partner Open311 API keys
-- Migration: 20260707_028_api_keys.sql
--
-- REVAMP_PLAN 3.7 / dev-audit P1: replaces the single shared OPEN311_API_KEY +
-- OPEN311_SYSTEM_USER_ID pair with per-partner keys that carry attribution
-- (user_id), an optional city scope, and revocation. Only a SHA-256 hash of
-- the key is stored. The plaintext exists once, at issuance.
--
-- The env-var pair keeps working as a legacy fallback (see the Open311 POST
-- route) so existing integrations don't break the day this ships.
--
-- Applied in filesystem order by scripts/run-migrations.mjs (NOT auto-applied).
-- Idempotent throughout.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS api_keys (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- sha256 hex of the plaintext key (compare hashes, never store plaintext)
  key_hash   text NOT NULL UNIQUE,
  label      text NOT NULL,
  -- The partner's attribution identity: reports created with this key get
  -- this reporter_id.
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Optional: pin the key to one city; NULL = jurisdiction_id/fallback rules.
  city_id    uuid REFERENCES cities (id) ON DELETE SET NULL,
  scopes     text[] NOT NULL DEFAULT ARRAY['open311:write'],
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash)
  WHERE revoked_at IS NULL;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- No client policies at all: keys are issued and read by operators via the
-- service role only. Default-deny for anon/authenticated.

COMMIT;
