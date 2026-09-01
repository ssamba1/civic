# 0005: Cross-jurisdiction routing (escalate to parent city)

- Status: **Accepted** (2026-07-08)
- Scope: which jurisdiction owns a work order when a category is county-owned.

## Context

`category_routing.escalates_to_parent` and `cities.parent_id` (both migration
024) existed but nothing read them. A report on a county-owned asset inside a
city boundary still landed with the city, the multi-tenant §6 containment case.

## Decision

- Migration 034 adds `work_orders.owner_city_id` (nullable, NULL means the
  report's own city, the common case) + `resolve_report_jurisdiction(_report_id)`
  SECURITY DEFINER RPC returning the parent city when the report's category is
  flagged `escalates_to_parent` AND the city has a `parent_id`, else the report's
  own city.
- `lib/routing/jurisdiction.ts:resolveOwningCity()` wraps the RPC, no-op-safe
  (falls back to the report's own city on any error).
- The classify pipeline stamps `owner_city_id` only when it differs from the
  report's city (guarded, logged).

## Alternatives considered

- **Reassign `reports.city_id`**: destructive, loses where the report was
  filed; breaks the resident's city association. Rejected.
- **Zone-polygon ownership** (migration 033): geographic, complementary, that
  answers "which team by PLACE"; this answers "which jurisdiction by
  category-ownership". Both can apply.

## Consequences

- Ships dark: no city seeds `escalates_to_parent`, so `owner_city_id` stays NULL
  and routing is unchanged until a city opts in.
- A parent-jurisdiction dashboard that filters by `owner_city_id` is future work.
