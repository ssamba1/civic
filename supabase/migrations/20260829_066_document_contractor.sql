-- =============================================================================
-- Migration: 20260829_066_document_contractor.sql
-- Link a city document to the contractor it concerns, so the Contractors
-- workspace can list a vendor's agreements/warranty certificates and the
-- Documents upload form can file a document under a vendor.
--
-- Nullable by design: most documents (policies, specs) concern no vendor.
-- ON DELETE SET NULL — deleting a contractor must never take the city's
-- governing documents with it.
--
-- No RLS change: city_documents policies from 065 already scope reads to
-- staff of the owning city, and contractors (062) deliberately has no
-- client-readable policy — all contractor reads stay on the service role.
--
-- NOT auto-applied. Run with: npm run db:migrate
-- Re-runnable: IF NOT EXISTS throughout.
-- =============================================================================

ALTER TABLE city_documents
  ADD COLUMN IF NOT EXISTS contractor_id uuid
    REFERENCES contractors (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_city_documents_contractor
  ON city_documents (contractor_id)
  WHERE contractor_id IS NOT NULL;

COMMENT ON COLUMN city_documents.contractor_id IS
  'Vendor this document concerns (contract, warranty certificate). NULL for general policies/specs. 066.';
