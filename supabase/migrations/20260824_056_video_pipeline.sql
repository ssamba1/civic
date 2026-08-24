-- =============================================================================
-- Migration: 20260824_056_video_pipeline.sql
-- Video-feed damage mapping pipeline (NEXT_100 #70, phase 1).
--
-- Two-stage architecture:
--   Stage 1 (LLM-free): video clips → sampled frames → local ONNX road-damage
--     detector → geo/visually clustered damage_detections. Continuous and
--     cheap — no model API cost.
--   Stage 2 (LLM, on escalation only): a detection_cluster crossing the
--     confidence threshold gets a Gemini "decision" run over in-DB context
--     (SLA targets, crew catalog, nearby report history, past corrections).
--     The decision + full supporting dossier persist on the cluster; a
--     "dispatch" decision spins off a normal reports row that flows through
--     the existing classify/work-order pipeline unchanged.
--
-- video_feeds.kind carries 'upload' | 'rtsp' | 'phone' from day one so the
-- phase-2 RTSP puller and phase-3 phone-dashcam PWA plug in with no schema
-- change; phase 1 only exercises 'upload'.
--
-- Privacy: detection frames come from city cameras and are NOT blurred —
-- they never enter a public bucket. Both new buckets are private; staff view
-- frames via short-lived signed URLs minted server-side. A dispatched report
-- gets a static placeholder as its public photo.
--
-- RLS: default deny. All four tables are staff-only within the caller's city;
-- pipeline writes go through the service role (bypasses RLS), matching the
-- classify pipeline's write pattern.
--
-- NOT auto-applied. Run with: npm run db:migrate
-- Re-runnable: IF NOT EXISTS / ON CONFLICT DO NOTHING throughout.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS video_feeds (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id     uuid        NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  kind        text        NOT NULL CHECK (kind IN ('upload', 'rtsp', 'phone')),
  name        text        NOT NULL,
  -- rtsp/phone source endpoint; NULL for kind='upload'.
  stream_url  text,
  active      boolean     NOT NULL DEFAULT true,
  created_by  uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_clips (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id         uuid        NOT NULL REFERENCES video_feeds (id) ON DELETE CASCADE,
  -- Denormalized from the feed so RLS and pipeline writes never need a JOIN.
  city_id         uuid        NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  -- Object path in the private 'video-clips' bucket.
  storage_path    text        NOT NULL,
  duration_s      numeric,
  captured_at     timestamptz,
  -- Where the clip started (dashcam) or the fixed camera position.
  start_location  geography(POINT, 4326),
  -- Optional GPS track for moving cameras: [{"t": <sec>, "lng": .., "lat": ..}].
  -- Detections interpolate their location from this by frame timestamp.
  gps_track       jsonb,
  status          text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  error           text,
  frames_sampled  int,
  detections_found int,
  detector_version text,
  created_by      uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_clips_feed ON video_clips (feed_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_clips_city_status ON video_clips (city_id, status);

-- Clusters before detections: damage_detections.cluster_id references this.
CREATE TABLE IF NOT EXISTS detection_clusters (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id             uuid        NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  -- Representative point (best detection's location); NULL when the source
  -- clip carried no GPS — such clusters can only be manually reviewed.
  location            geography(POINT, 4326),
  -- Detector class key (e.g. 'pothole', 'alligator_crack') — NOT the report
  -- category; the decision stage maps to a report category itself.
  class               text        NOT NULL,
  max_confidence      real        NOT NULL DEFAULT 0,
  frame_count         int         NOT NULL DEFAULT 0,
  -- Plain uuid (no FK) to avoid a circular constraint with damage_detections.
  best_detection_id   uuid,
  status              text        NOT NULL DEFAULT 'candidate'
                        CHECK (status IN ('candidate', 'escalated', 'dispatched',
                                          'monitoring', 'dismissed', 'merged')),
  -- Stage-2 outcome. NULL until the decision run happens.
  decision            text        CHECK (decision IN ('dispatch', 'monitor',
                                                      'dismiss', 'merge')),
  decision_confidence real,
  decision_rationale  text,
  -- Full supporting dossier: context offered to the model (nearby report ids,
  -- SLA hours, crew catalog snapshot), the model's citations, severity,
  -- mapped category, cost band, model + prompt version. Auditable record of
  -- WHY the system acted.
  decision_dossier    jsonb,
  decision_model      text,
  decided_at          timestamptz,
  -- Spun-off report on decision='dispatch'.
  report_id           uuid        REFERENCES reports (id) ON DELETE SET NULL,
  -- Existing report this cluster was folded into on decision='merge'.
  merged_report_id    uuid        REFERENCES reports (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_detection_clusters_city_status
  ON detection_clusters (city_id, status);
CREATE INDEX IF NOT EXISTS idx_detection_clusters_location
  ON detection_clusters USING gist (location);

CREATE TABLE IF NOT EXISTS damage_detections (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id     uuid        NOT NULL REFERENCES video_clips (id) ON DELETE CASCADE,
  city_id     uuid        NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  -- Seconds into the clip the frame was sampled at.
  frame_ts_s  numeric     NOT NULL,
  -- Object path of the full frame in the private 'video-frames' bucket.
  frame_path  text        NOT NULL,
  location    geography(POINT, 4326),
  class       text        NOT NULL,
  confidence  real        NOT NULL,
  -- Normalized {x, y, w, h} in [0,1] frame coordinates.
  bbox        jsonb,
  -- 16-char hex aHash of the frame, for visual near-dup grouping.
  phash       text,
  cluster_id  uuid        REFERENCES detection_clusters (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_damage_detections_clip ON damage_detections (clip_id);
CREATE INDEX IF NOT EXISTS idx_damage_detections_cluster ON damage_detections (cluster_id);

-- ---------------------------------------------------------------------------
-- 2. RLS — default deny; staff-only within their city
-- ---------------------------------------------------------------------------

ALTER TABLE video_feeds        ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_clips        ENABLE ROW LEVEL SECURITY;
ALTER TABLE detection_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE damage_detections  ENABLE ROW LEVEL SECURITY;

-- SELECT: staff of the owning city. Camera positions, GPS tracks, and raw
-- frame paths are operationally sensitive — no anon/resident read at all.
DROP POLICY IF EXISTS video_feeds_select_staff ON video_feeds;
CREATE POLICY video_feeds_select_staff ON video_feeds
  FOR SELECT TO authenticated
  USING (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS video_clips_select_staff ON video_clips;
CREATE POLICY video_clips_select_staff ON video_clips
  FOR SELECT TO authenticated
  USING (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS detection_clusters_select_staff ON detection_clusters;
CREATE POLICY detection_clusters_select_staff ON detection_clusters
  FOR SELECT TO authenticated
  USING (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS damage_detections_select_staff ON damage_detections;
CREATE POLICY damage_detections_select_staff ON damage_detections
  FOR SELECT TO authenticated
  USING (is_staff() AND city_id = current_user_city_id());

-- INSERT: staff can register feeds and clips for their own city. Detections,
-- clusters, and all UPDATEs are pipeline-only writes (service role, bypasses
-- RLS) — no authenticated write policy on purpose.
DROP POLICY IF EXISTS video_feeds_insert_staff ON video_feeds;
CREATE POLICY video_feeds_insert_staff ON video_feeds
  FOR INSERT TO authenticated
  WITH CHECK (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS video_clips_insert_staff ON video_clips;
CREATE POLICY video_clips_insert_staff ON video_clips
  FOR INSERT TO authenticated
  WITH CHECK (is_staff() AND city_id = current_user_city_id());

-- Staff may deactivate/rename their own city's feeds.
DROP POLICY IF EXISTS video_feeds_update_staff ON video_feeds;
CREATE POLICY video_feeds_update_staff ON video_feeds
  FOR UPDATE TO authenticated
  USING (is_staff() AND city_id = current_user_city_id())
  WITH CHECK (is_staff() AND city_id = current_user_city_id());

-- ---------------------------------------------------------------------------
-- 3. Private storage buckets
-- ---------------------------------------------------------------------------
-- Both buckets are PRIVATE (public = false) and get NO storage.objects
-- policies: only the service role reads/writes them. Frames contain unblurred
-- faces/plates from city cameras and must never be publicly addressable —
-- staff UI access is via short-lived signed URLs minted server-side.

INSERT INTO storage.buckets (id, name, public)
VALUES ('video-clips', 'video-clips', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('video-frames', 'video-frames', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Nearby-cluster lookup RPC (hard rule 7: geo queries use PostGIS)
-- ---------------------------------------------------------------------------
-- Cross-clip continuity: before creating a new cluster the pipeline asks for
-- an existing same-class cluster within _radius_m that hasn't been closed out.
-- SECURITY DEFINER like find_nearby_open_reports; service-role callers only in
-- practice, but EXECUTE stays open to authenticated for future staff tooling.

CREATE OR REPLACE FUNCTION public.find_nearby_detection_cluster(
  _city_id  uuid,
  _lng      float8,
  _lat      float8,
  _class    text,
  _radius_m float8 DEFAULT 15
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dc.id
  FROM detection_clusters dc
  WHERE dc.city_id = _city_id
    AND dc.class = _class
    AND dc.status IN ('candidate', 'escalated', 'monitoring')
    AND dc.location IS NOT NULL
    AND ST_DWithin(
      dc.location,
      ST_MakePoint(_lng, _lat)::geography,
      _radius_m
    )
  ORDER BY ST_Distance(dc.location, ST_MakePoint(_lng, _lat)::geography)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_nearby_detection_cluster(uuid, float8, float8, text, float8)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE video_feeds IS
  'Registered video sources for the damage-mapping pipeline (migration 056 / NEXT_100 #70). kind=upload is the phase-1 path; rtsp/phone are schema-ready for later phases.';
COMMENT ON TABLE video_clips IS
  'Uploaded/captured video segments awaiting or having completed LLM-free damage detection.';
COMMENT ON TABLE damage_detections IS
  'Per-frame detector hits (class/confidence/bbox) from the local ONNX road-damage model. No LLM involved at this stage.';
COMMENT ON TABLE detection_clusters IS
  'Geo/visually grouped detections. Escalation runs the Gemini decision stage and persists the decision + supporting dossier here; dispatch decisions link the spun-off report.';
