-- 032: crews.description, per-crew routing blurb.
--
-- crew_types.description (031) tells the AI what a TYPE of labor does; this
-- column differentiates SIBLING crews of the same type ("North side arterial
-- roads" vs "Downtown + parks district") so the work-order generator can emit
-- a crew_hint naming the best-fit crew. Optional. Empty means "no signal,
-- let the load balancer decide" (src/lib/ai/crew-assign.ts).
--
-- No RLS change: crews policies (030) already row-scope by city for staff.

ALTER TABLE crews
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

COMMENT ON COLUMN crews.description IS
  'What distinguishes this crew from same-type siblings (coverage area, specialty). Read by the AI work-order router for crew_hint. Empty = no signal.';
