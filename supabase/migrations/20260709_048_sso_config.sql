-- =============================================================================
-- Civic – SSO / SAML configuration (NEXT_100 #83)
-- Migration: 20260709_048_sso_config.sql
--
-- Stores per-city SAML IdP configuration for future SSO integration.
-- Scaffold only — no live SAML assertion processing yet (see sso.ts TODO).
-- RLS: admin-only read/write. No staff or resident access.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS sso_configs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id      uuid REFERENCES cities(id) ON DELETE CASCADE,
  -- SAML IdP EntityId (globally unique identifier for the IdP)
  entity_id    text NOT NULL,
  -- IdP Single Sign-On URL (redirect binding)
  sso_url      text NOT NULL,
  -- IdP signing certificate (PEM or base64 DER)
  x509cert     text NOT NULL,
  -- Email domain that routes to this IdP (e.g. "example.com")
  email_domain text NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email_domain)
);

CREATE OR REPLACE FUNCTION update_sso_configs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sso_configs_updated_at ON sso_configs;
CREATE TRIGGER trg_sso_configs_updated_at
  BEFORE UPDATE ON sso_configs
  FOR EACH ROW EXECUTE FUNCTION update_sso_configs_updated_at();

-- RLS: admin-only
ALTER TABLE sso_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sso_configs_admin_all" ON sso_configs;
CREATE POLICY "sso_configs_admin_all" ON sso_configs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

COMMIT;
