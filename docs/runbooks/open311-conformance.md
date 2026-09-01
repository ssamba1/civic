# Runbook: Open311 GeoReport v2 conformance testing

**Routes:** `src/app/api/open311/v2/*` · helpers `src/lib/open311/` · ADR 0007.
No live partner needed. Everything below runs against a local/staging host.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/services` | none | service list; `.json`/`?format=xml` |
| GET | `/services/{code}` | none | service_definition (empty attributes in v1) |
| GET | `/requests` | none | filters: jurisdiction_id, service_code, status, start/end_date, page/page_size |
| GET | `/requests/{id}` | none | single request |
| GET | `/tokens/{token}` | none | token → service_request_id |
| POST | `/requests` | api_key | requires `open311:write` scope |

## Format negotiation

`?format=xml|json` wins, else `Accept`. Canonical `.json` suffix URLs are
rewritten in `proxy.ts` (e.g. `/services.json`). Verify both:
```
curl -s $HOST/api/open311/v2/services            | jq 'length'      # JSON
curl -s "$HOST/api/open311/v2/services?format=xml" | head            # XML
curl -s $HOST/api/open311/v2/services.json        | jq 'length'      # rewrite
```

## Auth checks (POST)

```
# no key → 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST $HOST/api/open311/v2/requests \
  --data 'service_code=pothole&lat=34.2&long=-84.1'
# read-only key → 403 (mint with --scopes open311:read)
# valid write key → 201 + { service_request_id, token }
```

## Automated coverage

`e2e/open311-api.spec.ts` asserts the full public GET surface, `.json`
rewrites, jurisdiction_id filtering, invalid-status 400, and POST 401. Run:
```
E2E_BASE_URL=http://localhost:3001 pnpm test:e2e e2e/open311-api.spec.ts
```
Unit conformance (shape, XML escaping, status mapping, expected_datetime) lives
in `src/lib/open311/open311.test.ts` + `services.test.ts`.

## Privacy invariants (must hold)

- Public feed coordinates are coarsened to ~3dp (~110m), never full precision.
- No `description`, `photo_raw_url`, or `reporter_id` in any GET response.
- `rejected`/`merged` reports are excluded from the public list.

## Real-client smoke

Point a GovDelivery/SeeClickFix-style client at `$HOST/api/open311/v2` with a
minted write key; confirm it can list services, submit a request, and read it
back by id and token.
