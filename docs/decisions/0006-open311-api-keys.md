# 0006: Open311 API key design (scopes, hashing, rotation)

- Status: **Accepted** (2026-07-08)
- Scope: how external Open311 partners authenticate to the POST endpoint.

## Context

The Open311 POST route originally accepted a single shared `OPEN311_API_KEY`
env var, no per-partner attribution, no revocation, no scoping. A real partner
integration needs individual keys that can be attributed, scoped, and rotated.

## Decision

- `api_keys` table (migration 028): `key_hash` (SHA-256 hex, plaintext never
  stored), `label`, `user_id` (attribution), `city_id` (optional pin), `scopes
  text[]`, `revoked_at`. Partial unique index on active keys.
- RLS default-deny: no client policy, service-role only. `lookupApiKey()`
  hashes the presented key and looks up the active row.
- **Scope enforcement**: POST requires the `open311:write` scope; a read-only
  key is rejected 403 (valid key, missing permission). The legacy shared env key
  stays as an unscoped full-access fallback.
- Tooling: `scripts/issue-api-key.mjs` (mint, `--scopes`, prints plaintext once)
  and `scripts/revoke-api-key.mjs` (revoke by id/label, stamps `revoked_at`).

## Alternatives considered

- **JWT / OAuth**: overkill for machine-to-machine Open311; the spec passes a
  flat `api_key` form param. A hashed opaque token matches the spec and threat
  model.
- **Store plaintext keys**: unacceptable. A DB read would leak every partner's
  credential.

## Consequences

- Keys are opaque `civic_<base64url>` strings, grep-able by prefix for leak
  detection. Rotation is issue-new + revoke-old (see the api-key runbook).
- The shared env fallback should be retired once all partners hold minted keys.
