-- =============================================================================
-- Civic – Outbound webhook endpoints (NEXT_100 #79)
-- Migration: 20260709_047_webhooks.sql
--
-- Stores registered webhook endpoints per city. Secrets are stored plaintext
-- (hashed at-rest by Supabase storage encryption); the admin UI generates a
-- random secret at registration time — users copy it once.
-- RLS: read/write for admin role only. No resident/staff access.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id    uuid REFERENCES cities(id) ON DELETE CASCADE,
  url        text NOT NULL,
  -- HMAC-SHA256 secret; shown once at creation, stored hashed at the app layer
  secret     text NOT NULL,
  -- event filter: array of WebhookEventType strings
  -- e.g. ARRAY['report.created', 'report.closed']
  events     text[] NOT NULL DEFAULT ARRAY['report.created','report.status_changed','report.closed'],
  active     boolean NOT NULL DEFAULT true,
  label      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_webhook_endpoints_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webhook_endpoints_updated_at ON webhook_endpoints;
CREATE TRIGGER trg_webhook_endpoints_updated_at
  BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION update_webhook_endpoints_updated_at();

-- RLS: admin-only
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_endpoints_admin_all" ON webhook_endpoints;
CREATE POLICY "webhook_endpoints_admin_all" ON webhook_endpoints
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

COMMIT;
