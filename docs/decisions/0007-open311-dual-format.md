# 0007: Open311 GeoReport v2 dual-format + rate limits

- Status: **Accepted** (2026-07-08)
- Scope: content negotiation, URL shape, and throttling of the Open311 routes.

## Context

Open311 GeoReport v2 clients expect both JSON and XML, canonical `.json`/`.xml`
URL suffixes, and a public unauthenticated read surface. The routes must conform
while staying safe against enumeration/abuse.

## Decision

- **Dual format**: every route negotiates via `?format=xml|json` then the
  `Accept` header (`wantsXml()` in `lib/open311/http.ts`: one shared impl, not
  five copies). Errors serialize to the negotiated format (`open311Error()`).
- **Canonical URLs**: `proxy.ts` rewrites `…/services.json`,
  `…/requests.json`, `…/requests/{id}.json`, `…/services/{code}.json`,
  `…/tokens/{token}.json` → the canonical path with `?format=json`.
- **Routes**: `GET /services`, `GET /services/{code}` (service_definition),
  `GET /requests`, `GET /requests/{id}`, `GET /tokens/{token}`, `POST /requests`.
- **Rate limits**: all public GETs are IP-throttled (60-120/min); POST is
  key-gated + throttled. Coordinates on the public feed are coarsened to ~3dp
  (~110m) so the feed can't pinpoint a reporter's home.

## Alternatives considered

- **JSON-only**: simpler but non-conformant, legacy GovDelivery/SeeClickFix
  clients request XML.
- **Per-route negotiation helpers**: the original state; five copies drifted.
  Extracted to one module.

## Consequences

- New routes must import `wantsXml`/`open311Error` and (if public) add a rate
  limit. See the Open311 conformance runbook.
- `service_definition` returns an empty `attributes` array (no dynamic forms in
  v1); metadata is `false` for all services.
