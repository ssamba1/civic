# Runbook — Open311 API key issuance & rotation

**Table:** `api_keys` (migration 028) · **Lib:** `src/lib/open311/api-keys.ts` ·
ADR 0006. Scripts read `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from
`.env.local`.

## Issue a key

```
node scripts/issue-api-key.mjs --label "Forsyth County GIS" --user <users.id uuid> \
  [--city <cities.id uuid>] [--scopes open311:read,open311:write]
```
- Prints the plaintext `civic_<…>` key **once** — store it in the partner's
  secret manager immediately; only its SHA-256 hash is persisted.
- `--user` = the `public.users` row the partner's submissions attribute to.
- `--city` pins the key to one city (overrides `jurisdiction_id` on POST).
- `--scopes` defaults to `open311:write`. Valid: `open311:read`, `open311:write`.
  POST /requests requires `open311:write` (a read-only key gets 403).

## Revoke a key

```
node scripts/revoke-api-key.mjs --id <api_keys.id>
node scripts/revoke-api-key.mjs --label "Forsyth County GIS"
```
Stamps `revoked_at = now`; the key stops resolving immediately
(`lookupApiKey` filters `revoked_at IS NULL`). Already-revoked keys are skipped.

## Rotate

Rotation = issue-new + revoke-old:
1. Issue a new key for the same `--user`/`--city`/`--scopes`.
2. Hand the plaintext to the partner; confirm they've switched.
3. Revoke the old key by id.

No downtime — both keys are valid until step 3.

## Verify a key is live

```sql
select id, label, scopes, revoked_at from api_keys where label = '<label>';
```
Active = `revoked_at IS NULL`.

## Legacy shared key

`OPEN311_API_KEY` (env) is an unscoped full-access fallback for the POST route.
Retire it once every partner holds a minted key; until then, keep it secret.
