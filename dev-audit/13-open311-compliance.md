# Open311 compliance check

**Summary:** 8 findings across services list, request POST/GET, and spec adherence. Top issue: responses wrapped in arrays (JSON) instead of root objects; missing `service_metadata`, `address_id`, `account_id` standard fields; GET by id returns array not object.

---

## Detailed Findings

| # | Category | Severity | Location | Issue | Evidence |
|---|----------|----------|----------|-------|----------|
| 1 | **Response envelope** | High | `src/app/api/open311/v2/requests/[id]/route.ts:72` | GET /requests/{id} returns JSON array wrapping single request instead of bare object. Spec: "A single request is returned as service_request object, not wrapped." | `return NextResponse.json([open311Request])` — should return `{ service_request_id, ... }` bare object. |
| 2 | **Response envelope** | High | `src/app/api/open311/v2/requests/route.ts:120` | GET /requests (list) returns JSON array `[{...}, ...]` instead of `{ service_requests: [{...}] }` envelope. GeoReport v2 §3: "response is service_requests wrapper object." | `return NextResponse.json(open311Requests)` — missing wrapper. |
| 3 | **Services response** | High | `src/app/api/open311/v2/services/route.ts:31` | GET /services returns bare array `[{...}]` instead of `{ services: [{...}] }` wrapper. Spec §2: responses use root wrapper object. | `return NextResponse.json(services)` — missing root. |
| 4 | **Required field: service_metadata** | Medium | `src/lib/open311/services.ts:3-11` & `src/lib/open311/transform.ts:10-34` | Open311Interface missing boolean `service_metadata` flag. Spec requires it to indicate presence of metadata form questions (required for POST requests with dynamic fields). All services hardcoded `metadata: false` but no mechanism to expose/process metadata schema. | `metadata: false` only; no `service_metadata` in transform, no form endpoint. |
| 5 | **Required field: address_id** | Medium | `src/lib/open311/transform.ts:22` | `address_id` field not populated in Open311Request. Spec requires it for address-based deduplication and reverse geocoding. Currently only `address` string is provided. | `address: report.address ?? ""` but no `address_id` field. |
| 6 | **Required field: account_id** | Low | `src/lib/open311/transform.ts:27-33` | Extended attributes include `civic_*` custom fields but missing standard `account_id` field (optional but recommended for linking requests to reporter accounts). Not returned in response. | No `account_id` in Open311Request type or transform. |
| 7 | **Error format variance** | Low | `src/lib/open311/xml.ts:92-102` & `src/app/api/open311/v2/services/route.ts:48-58` | JSON error response returns array `[{ code, description }]` while spec shows single error object `{ code: "...", description: "..." }`. XML errors wrap in `<errors>` with single `<error>` child (spec-compliant). | `NextResponse.json([{ code, description }])` vs. XML `<errors><error>` — inconsistent envelopes. |
| 8 | **POST response structure** | Low | `src/app/api/open311/v2/requests/route.ts:285-311` | POST /requests returns array `[{ service_request_id, token, service_notice }]` instead of single-object envelope. Spec shows request object, not wrapped. | `NextResponse.json(responseBody)` where `responseBody = [...]` — should be bare object for single create. |
| 9 | **Missing field: status_notes** | Low | `src/lib/open311/transform.ts:13` | `status_notes` always empty string. Spec recommends for status transitions (e.g., "Work crew arrived", "Closed: duplicate of #xyz"). Current implementation doesn't populate. | `status_notes: ""` unconditionally in line 13. |
| 10 | **Missing field: service_notice** | Low | `src/lib/open311/transform.ts:18` | `service_notice` always empty string. Spec: "Public message about the service" (e.g., maintenance window, closure notice). Not populated. | `service_notice: ""` unconditionally in line 18. |
| 11 | **Missing endpoint: GET /requests/{id}/notes** | Low | N/A | Open311 spec §4.5 defines optional notes endpoint for request history/transitions. Not implemented. | No `src/app/api/open311/v2/requests/[id]/notes/route.ts`. |
| 12 | **Missing endpoint: GET /services/{code}** | Low | N/A | Spec §2.2 defines single-service lookup with metadata schema. Only bulk /services exists. | No `src/app/api/open311/v2/services/[code]/route.ts`. |
| 13 | **Missing: address_id normalization** | Low | `src/app/api/open311/v2/requests/route.ts:184-191` | POST accepts `address_string` but ignores standard `address_id` param (for linking to civic address database). No address validation or geocoding. | Accepts `address_string` only; ignores `address_id` param per spec. |

---

## XML Serialization Assessment

- **Strengths:** XML output well-formed (spec §5.1); proper escaping (`<`, `>`, `&`, quotes); charset declared; root elements correct for bulk requests/services.
- **Weakness:** Bare fields without wrapper (e.g., `<service_requests>` root is correct, but single GET /requests/{id} should wrap result in `<service_requests>` root even for one record).

---

## Content Negotiation

- ✓ Correctly implements `?format=xml|json` and `Accept: text/xml|application/xml` headers.
- ✓ XML declared with UTF-8 encoding.
- ⚠ JSON responses missing root object wrappers (items 1–3 above).

---

## Auth & Rate-Limiting

- ✓ POST /requests validates `api_key` with constant-time comparison (timing-safe).
- ✓ Rate limit 60 req/min per IP on both GET and POST.
- ⚠ No per-key rate limiting; all keys share same limit bucket (standard but worth noting).

---

## Data Safety

- ✓ Public SELECT excludes reporter PII, raw photo URLs, raw descriptions.
- ✓ UUID validation before DB lookup (prevents reflected error injection).
- ✓ media_url must use https.
- ✓ Rejected/merged reports excluded from public feed.

---

## Recommendations

1. **Critical (High):** Fix JSON response envelopes for items 1–3 (wrap in standard objects/arrays per spec).
2. **Important (Medium):** Add `service_metadata` processing and `address_id` field support.
3. **Nice-to-have:** Populate `status_notes` and `service_notice` from business logic.
4. **Optional:** Implement GET /services/{code} and GET /requests/{id}/notes endpoints.
