# Runbook: Smart routing enablement (OUTFLANK #5)

Category→team routing, crew auto-assign (load-balanced), and geographic zone
routing are **built and wired end-to-end** in the classify pipeline. Two of the
three ship *dark*, safe to deploy, zero effect until a city opts in. This
runbook is the opt-in procedure.

## 1. Category → team routing: ON by default

No action needed. `work_orders.team_key` is stamped at work-order creation
(`classify-pipeline.ts`) via `resolveTeamKeyForCategory`, per-city `city_teams`
config first, static `CATEGORY_TO_TEAM` map as fallback. Staff category
reassignment re-resolves and rewrites `team_key`.

## 2. Crew auto-assign: feature-flagged OFF

Load-aware crew assignment (`autoAssignCrew` in `src/lib/ai/crew-assign.ts`)
picks a crew by `city_id + team_key + crew_type + active`, preferring staffed
crews then the **fewest open work orders** (load balancing). It only runs when:

```bash
AI_CREW_ASSIGN=1        # set in the server environment
```

Preconditions before enabling:
- The city has rows in `crews` (division = `team_key`) with `active = true`.
- Each crew's `crew_type` matches the values the work-order AI emits (the
  per-city `crew_types` catalog seeds these, 7 defaults: paving, line_crew,
  sign_crew, cleanup, concrete, arborist, drain_crew).
- If no crew matches a work order's `crew_type`, `autoAssignCrew` no-ops
  (assignment stays null), not an error, just unassigned.

Verify after enabling: submit a report in a category whose team has an active
crew of the right type; confirm `work_orders.assigned_crew_id` is populated.

## 3. Geographic zone routing: shipped dark, no polygons seeded

`resolve_zone_team(_report_id)` (migration `033_routing_zones`) runs
`ST_Contains(zone.boundary, report.location)` and, when a zone matches,
**overrides** the category-resolved `team_key`. Ties break by `priority DESC`
then smaller area. The `routing_zones` table is empty until an admin seeds
polygons, so this has zero effect out of the box.

To seed a zone (until a polygon-draw admin UI exists, insert directly, service
role, RLS is service-write only):

```sql
insert into routing_zones (city_id, name, team_key, priority, boundary, active)
values (
  '<city-uuid>',
  'North district',
  'streets_roads',
  10,
  ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[ -84.16,34.22 ],[ -84.12,34.22 ],[ -84.12,34.20 ],[ -84.16,34.20 ],[ -84.16,34.22 ]]]]}')::geography,
  true
);
```

Verify: submit a report whose location falls inside the polygon; confirm its
work order's `team_key` is the zone's team, not the category default.

## Notes

- Zone routing maps a polygon to a **team**, not a specific crew. Crew selection
  still flows through `autoAssignCrew` (team + crew_type + load).
- All three layers are independent: category routing always runs; crew assign is
  gated by `AI_CREW_ASSIGN`; zone override runs whenever a matching polygon
  exists. Enable them in any order.
