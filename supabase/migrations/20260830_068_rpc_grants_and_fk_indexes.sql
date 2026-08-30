-- ---------------------------------------------------------------------------
-- 068 — lock down three SECURITY DEFINER RPCs, and index two FK columns.
--
-- NOT APPLIED BY THE AGENT. Review, then apply with `pnpm db:migrate` (or the
-- Supabase MCP) like the rest of the migration set.
--
-- WHY THIS IS URGENT — verified against the LIVE database on 2026-08-30 using
-- the anon key only (no session, no login):
--
--   routing_unit_load(_city_id)               -> ALLOWED, returned 15 rows
--   search_document_chunks(_city_id, …)       -> ALLOWED, returned 5 rows
--   find_nearby_detection_cluster(_city_id,…) -> ALLOWED (callable)
--   camera_nearby_clusters(…)                 -> DENIED  (the correct pattern)
--
-- All three are SECURITY DEFINER, so they run as the definer and bypass RLS
-- entirely. The city id is a plain argument, so a caller supplies ANY city's
-- uuid — the exposure is not limited to the caller's own tenant:
--
--   * routing_unit_load leaks the whole org chart's operating data: per-unit
--     capacity, cost_per_job, SLA hours, skills, depot coordinates and open
--     work-order load. Migration 060's header says "Grants not captured", and
--     PostgreSQL's default for a new function is EXECUTE TO PUBLIC — so the
--     restriction was never there, rather than having been dropped.
--   * search_document_chunks returns chunks of the city's uploaded contracts
--     and policy documents (vendor pricing, named staff obligations). 065
--     granted it TO authenticated even though its own comment states callers
--     "are service-role server actions that have already resolved the caller's
--     city via getStaffAccessForCity".
--   * find_nearby_detection_cluster returns the nearest open damage cluster for
--     a coordinate. Granted TO authenticated, it lets anyone walk a grid of
--     lat/lng and map every active detection in a city — the same operational
--     data 056 declares "no anon/resident read at all".
--
-- SAFE TO APPLY: every caller in the codebase is a server module using the
-- service-role client —
--   search_document_chunks        -> src/lib/documents/retrieve.ts
--   find_nearby_detection_cluster -> src/lib/video/pipeline.ts
--   routing_unit_load             -> no caller in src/ at all
-- so no client path loses access. This migration only REVOKEs and adds
-- indexes; it creates and drops nothing, and is idempotent.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. RPC grants — mirror the camera_nearby_clusters pattern from 064.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.routing_unit_load(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.routing_unit_load(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.search_document_chunks(uuid, text, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_document_chunks(uuid, text, int)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.find_nearby_detection_cluster(uuid, float8, float8, text, float8)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_nearby_detection_cluster(uuid, float8, float8, text, float8)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Foreign-key indexes.
--
-- Both columns are ON DELETE CASCADE targets with no supporting index, so every
-- parent delete full-scans the child table. routing_events is an append-only
-- audit log that grows without bound, which makes the scan worse over time.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_routing_decisions_report
  ON public.routing_decisions (report_id);

CREATE INDEX IF NOT EXISTS idx_routing_events_work_order
  ON public.routing_events (work_order_id);
