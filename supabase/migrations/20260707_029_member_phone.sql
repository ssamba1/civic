-- =============================================================================
-- Civic – Member Phone
-- Migration: 20260707_024_member_phone.sql
--
-- Adds an optional contact phone to member profiles:
--   * users.phone – nullable, free-form contact number for a person or shared
--                   team login. Additive and nullable, so existing rows are
--                   untouched and no RLS change is needed (phone is covered by
--                   the same per-city users policies as email/display_name).
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone text;
