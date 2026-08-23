-- =============================================================================
-- Civic – Camera ingest (Phase B)
-- Migration: 20260823_064_camera.sql
-- Spec: docs/planning/CAMERA_LIABILITY_PIPELINE.md §4.2, §4.4
--
--   camera_devices     – a registered vehicle dashcam or fixed camera
--   detection_clusters – the same physical defect, seen many times
--   detections         – one surviving detector hit on one frame
--
-- Why clusters exist: a bus passes the same pothole ~20x/day over ~180 school
-- days. Detections collapse into a cluster (same damage_class, within
-- CLUSTER_RADIUS_M, cluster not resolved) and only a cluster that clears the
-- promotion threshold (N passes over >= 2 distinct days) ever becomes a report.
-- That is what keeps one pothole from generating 3,600 reports and one LLM call
-- per frame.
--
-- Security model:
--
--   staff       – SELECT, own city only. Camera data is operational, not public.
--   admin       – INSERT / UPDATE / DELETE on camera_devices (fleet management)
--                 and UPDATE/DELETE on cluster state (dismiss a false positive).
--   INGEST      – has NO POLICY. There is deliberately no anon or authenticated
--                 INSERT policy on detections or detection_clusters anywhere in
--                 this migration. Frames arrive at POST /api/camera/frames,
--                 which authenticates an api_keys row with scope
--                 'camera:ingest' and then writes with the SERVICE ROLE, which
--                 bypasses RLS. An RLS insert policy would mean a leaked anon
--                 key could forge detections at arbitrary coordinates and, via
--                 promotion, forge reports and liability claims.
--   contractor  – nothing. A vendor must not be able to enumerate where the
--                 city's cameras have been looking.
--   anon        – nothing. Default deny.
--
-- Privacy note (agents.md rule #2): crop_url points at a blurred crop in the
-- public photo bucket. The ingest route drops any crop whose server-side blur
-- failed; an unblurred byte is never persisted, so there is no "raw" column
-- here on purpose. Raw frames are not stored at all (spec §8.3).
--
-- Idempotent: IF NOT EXISTS + DROP POLICY IF EXISTS, wrapped in a transaction.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. camera_devices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS camera_devices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id     uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  label       text NOT NULL,
  -- Fleet-side identifier (bus number, truck asset tag). Free text: cities do
  -- not share a fleet-numbering convention.
  vehicle_ref text,
  kind        text NOT NULL DEFAULT 'vehicle',
  active      boolean NOT NULL DEFAULT true,
  -- Last time the device successfully posted a batch. Lets staff notice a
  -- camera that quietly stopped uploading, which otherwise looks like "no
  -- defects on that route".
  last_seen_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT camera_devices_kind_check CHECK (kind IN ('vehicle', 'fixed'))
);

CREATE INDEX IF NOT EXISTS idx_camera_devices_city ON camera_devices (city_id);

-- ---------------------------------------------------------------------------
-- 2. detection_clusters
--
-- Created before `detections` because detections.cluster_id references it.
--
-- state:
--   observing  – accumulating passes, below the promotion threshold
--   promoted   – a report was created from it (promoted_report_id)
--   resolved   – the report closed; later detections at the same spot must open
--                a NEW cluster, which is exactly the recurrence signal the
--                hotspot analytics and the contractor scorecard want
--   dismissed  – staff marked it a false positive
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS detection_clusters (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id             uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  centroid            geography(POINT, 4326) NOT NULL,
  damage_class        text NOT NULL,
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  observation_count   int NOT NULL DEFAULT 0,
  peak_score          numeric,
  promoted_report_id  uuid REFERENCES reports (id) ON DELETE SET NULL,
  state               text NOT NULL DEFAULT 'observing',
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT detection_clusters_state_check
    CHECK (state IN ('observing', 'promoted', 'resolved', 'dismissed'))
);

-- The cluster-assignment query is a ST_DWithin against every live cluster in
-- the city on every surviving frame — the hot path of the whole ingest tier.
CREATE INDEX IF NOT EXISTS idx_detection_clusters_centroid
  ON detection_clusters USING GIST (centroid);

CREATE INDEX IF NOT EXISTS idx_detection_clusters_city_state
  ON detection_clusters (city_id, state);

-- ---------------------------------------------------------------------------
-- 3. detections
--
-- One row per surviving detector hit. Below-threshold frames never reach this
-- table (and their images are never stored) — the detector gate throws ~95% of
-- frames away before anything is persisted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS detections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id          uuid NOT NULL REFERENCES camera_devices (id) ON DELETE CASCADE,
  city_id            uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  -- Device-local frame id. Idempotency key for batch re-upload over flaky
  -- depot wifi: the same batch posted twice must not double-count a cluster.
  frame_external_id  text NOT NULL,
  captured_at        timestamptz NOT NULL,
  location           geography(POINT, 4326) NOT NULL,
  damage_class       text NOT NULL,
  score              numeric NOT NULL,
  heading_deg        numeric,
  speed_mps          numeric,
  -- Blurred crop in the public bucket. NULL is not allowed: a detection whose
  -- crop could not be blurred is dropped entirely rather than stored crop-less.
  crop_url           text NOT NULL,
  cluster_id         uuid REFERENCES detection_clusters (id) ON DELETE SET NULL,
  -- Set when the owning cluster is promoted, so a report can be traced back to
  -- the exact frames that justified it (the evidence chain in a claim packet).
  report_id          uuid REFERENCES reports (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT detections_score_check CHECK (score >= 0 AND score <= 1)
);

-- Idempotent ingest: one detection per (device, frame). A frame yielding two
-- distinct damage classes is out of scope for v1 — the route keeps the highest
-- scoring hit per frame.
CREATE UNIQUE INDEX IF NOT EXISTS uq_detections_device_frame
  ON detections (device_id, frame_external_id);

CREATE INDEX IF NOT EXISTS idx_detections_location
  ON detections USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_detections_cluster
  ON detections (cluster_id)
  WHERE cluster_id IS NOT NULL;

-- Promotion asks "how many distinct UTC dates has this cluster been seen on".
CREATE INDEX IF NOT EXISTS idx_detections_cluster_captured
  ON detections (cluster_id, captured_at);

-- ---------------------------------------------------------------------------
-- 4. RLS — default deny; staff read own city; admin write; ingest via service
--    role only (no INSERT policy anywhere below — this is deliberate).
-- ---------------------------------------------------------------------------
ALTER TABLE camera_devices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE detection_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE detections         ENABLE ROW LEVEL SECURITY;

-- --- camera_devices --------------------------------------------------------
DROP POLICY IF EXISTS camera_devices_staff_select ON camera_devices;
CREATE POLICY camera_devices_staff_select ON camera_devices
  FOR SELECT USING (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS camera_devices_admin_insert ON camera_devices;
CREATE POLICY camera_devices_admin_insert ON camera_devices
  FOR INSERT WITH CHECK (is_admin() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS camera_devices_admin_update ON camera_devices;
CREATE POLICY camera_devices_admin_update ON camera_devices
  FOR UPDATE USING (is_admin() AND city_id = current_user_city_id())
  WITH CHECK (is_admin() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS camera_devices_admin_delete ON camera_devices;
CREATE POLICY camera_devices_admin_delete ON camera_devices
  FOR DELETE USING (is_admin() AND city_id = current_user_city_id());

-- --- detection_clusters ----------------------------------------------------
DROP POLICY IF EXISTS detection_clusters_staff_select ON detection_clusters;
CREATE POLICY detection_clusters_staff_select ON detection_clusters
  FOR SELECT USING (is_staff() AND city_id = current_user_city_id());

-- Admins may dismiss / resolve a cluster from the UI. No INSERT policy: only
-- the ingest route (service role) creates clusters.
DROP POLICY IF EXISTS detection_clusters_admin_update ON detection_clusters;
CREATE POLICY detection_clusters_admin_update ON detection_clusters
  FOR UPDATE USING (is_admin() AND city_id = current_user_city_id())
  WITH CHECK (is_admin() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS detection_clusters_admin_delete ON detection_clusters;
CREATE POLICY detection_clusters_admin_delete ON detection_clusters
  FOR DELETE USING (is_admin() AND city_id = current_user_city_id());

-- --- detections ------------------------------------------------------------
DROP POLICY IF EXISTS detections_staff_select ON detections;
CREATE POLICY detections_staff_select ON detections
  FOR SELECT USING (is_staff() AND city_id = current_user_city_id());

-- Admins may prune detections (retention, false-positive cleanup). No INSERT
-- and no UPDATE policy: detections are append-only facts written by the ingest
-- route under the service role.
DROP POLICY IF EXISTS detections_admin_delete ON detections;
CREATE POLICY detections_admin_delete ON detections
  FOR DELETE USING (is_admin() AND city_id = current_user_city_id());

-- ---------------------------------------------------------------------------
-- camera_nearby_clusters() — candidate clusters for one incoming detection.
--
-- Called by the ingest route (src/lib/camera/ingest.ts nearbyClusters()) under
-- the service role. Distance is computed here with ST_Distance (AGENTS.md rule
-- #7: geo queries use PostGIS, never app-side math); the pure function
-- assignCluster() re-asserts the radius defensively.
--
-- Only 'observing' and 'promoted' clusters are candidates: a resolved or
-- dismissed cluster must NOT absorb new detections — a defect reappearing at a
-- resolved spot opens a NEW cluster, which is the recurrence/workmanship
-- signal (spec §4.4).
--
-- SECURITY: not SECURITY DEFINER, and EXECUTE is granted to service_role only.
-- The ingest route is the sole caller; anon/authenticated cannot probe cluster
-- locations through it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.camera_nearby_clusters(
  _city_id uuid,
  _lng double precision,
  _lat double precision,
  _radius_m double precision,
  _damage_class text
)
RETURNS TABLE (
  id uuid,
  damage_class text,
  state text,
  observation_count int,
  distance_m double precision
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    dc.id,
    dc.damage_class,
    dc.state,
    dc.observation_count,
    ST_Distance(
      dc.centroid,
      ST_SetSRID(ST_MakePoint(_lng, _lat), 4326)::geography
    ) AS distance_m
  FROM detection_clusters dc
  WHERE dc.city_id = _city_id
    AND dc.damage_class = _damage_class
    AND dc.state IN ('observing', 'promoted')
    AND ST_DWithin(
      dc.centroid,
      ST_SetSRID(ST_MakePoint(_lng, _lat), 4326)::geography,
      _radius_m
    )
  ORDER BY distance_m ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.camera_nearby_clusters(uuid, double precision, double precision, double precision, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.camera_nearby_clusters(uuid, double precision, double precision, double precision, text) TO service_role;

COMMIT;
