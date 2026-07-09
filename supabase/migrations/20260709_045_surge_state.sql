-- Migration 045: surge_state table (NEXT_100 #63)
-- Persists storm/emergency surge configuration per city.
-- Staff can activate surge mode to automatically reprioritise affected reports.

CREATE TABLE IF NOT EXISTS surge_state (
  city_id     TEXT        NOT NULL,
  active      BOOLEAN     NOT NULL DEFAULT FALSE,
  categories  TEXT[]      NOT NULL DEFAULT '{}',
  reason      TEXT        NOT NULL DEFAULT '',
  activated_at TIMESTAMPTZ,

  CONSTRAINT surge_state_pkey PRIMARY KEY (city_id),
  CONSTRAINT surge_state_city_fk FOREIGN KEY (city_id)
    REFERENCES cities (id) ON DELETE CASCADE
);

-- Index for quick lookup of all active surges (e.g. public read endpoint).
CREATE INDEX IF NOT EXISTS surge_state_active_idx ON surge_state (active)
  WHERE active = TRUE;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE surge_state ENABLE ROW LEVEL SECURITY;

-- Public: anyone can read the active flag (powers the resident-facing banner
-- and the GET /api/admin/surge endpoint).
CREATE POLICY "public_read_active_surge"
  ON surge_state
  FOR SELECT
  USING (TRUE);

-- Staff/admin: full read + write on their own city's surge state.
CREATE POLICY "staff_write_surge"
  ON surge_state
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('staff_dispatcher', 'staff_supervisor', 'admin')
        AND u.city_id = surge_state.city_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('staff_dispatcher', 'staff_supervisor', 'admin')
        AND u.city_id = surge_state.city_id
    )
  );
