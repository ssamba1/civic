-- =============================================================================
-- Migration: 20260828_065_city_documents.sql
-- Documents workspace: staff upload policy/contract documents; the text is
-- chunked and stored so the relevant guidance can be pulled up alongside a
-- report (e.g. "pothole on Peachtree Industrial Blvd" → the response-time SLA
-- and the contractor clause that governs that road class).
--
-- Retrieval is POSTGRES FULL-TEXT, not embeddings. There is no pgvector in
-- this project (see the note in 20260613_011_dedup_rpc.sql) and this migration
-- deliberately does not add it: a generated tsvector + GIN index + ts_rank is
-- exact, cheap, needs no model call, and survives a cold restore.
--
-- Storage: the ORIGINAL uploaded file lands in the PRIVATE 'city-documents'
-- bucket (service-role only, no storage.objects policies). Municipal contracts
-- carry vendor pricing and staff names. Nothing here is publicly addressable.
--
-- RLS: default deny. Both tables are staff-only within the caller's city;
-- all writes go through the service role (bypasses RLS), matching the video
-- pipeline's and classify pipeline's write pattern, so there is deliberately
-- no authenticated INSERT/UPDATE/DELETE policy.
--
-- NOT auto-applied. Run with: npm run db:migrate
-- Re-runnable: IF NOT EXISTS / ON CONFLICT DO NOTHING throughout.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS city_documents (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id       uuid        NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  title         text        NOT NULL,
  -- Original client-side filename, kept for display only.
  filename      text        NOT NULL,
  -- Object path in the private 'city-documents' bucket. NULL for pasted text,
  -- which has no uploaded original to keep.
  storage_path  text,
  doc_kind      text        NOT NULL DEFAULT 'other'
                  CHECK (doc_kind IN ('policy', 'contract', 'spec', 'other')),
  uploaded_by   uuid        REFERENCES users (id) ON DELETE SET NULL,
  -- Denormalized count of document_chunks rows; kept current by the writer.
  chunk_count   int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_city_documents_city
  ON city_documents (city_id, created_at DESC);

CREATE TABLE IF NOT EXISTS document_chunks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid        NOT NULL REFERENCES city_documents (id) ON DELETE CASCADE,
  -- Denormalized from the document so RLS and retrieval never need a JOIN.
  city_id      uuid        NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  -- 0-based position within the document; restores reading order.
  ordinal      int         NOT NULL,
  content      text        NOT NULL,
  -- Nearest enclosing markdown heading, so a retrieved chunk can say where in
  -- the document it came from without re-reading the source.
  heading      text,
  -- Heading is indexed alongside the body: "warranty" in a section title is at
  -- least as good a signal as "warranty" in a sentence.
  tsv          tsvector    GENERATED ALWAYS AS (
                 to_tsvector('english', coalesce(heading, '') || ' ' || content)
               ) STORED,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_tsv
  ON document_chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS idx_document_chunks_city
  ON document_chunks (city_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_ordinal
  ON document_chunks (document_id, ordinal);

-- ---------------------------------------------------------------------------
-- 2. RLS, default deny; staff-only within their city
-- ---------------------------------------------------------------------------

ALTER TABLE city_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- SELECT: staff of the owning city. Contracts carry vendor pricing and named
-- staff obligations. No anon/resident read at all.
DROP POLICY IF EXISTS city_documents_select_staff ON city_documents;
CREATE POLICY city_documents_select_staff ON city_documents
  FOR SELECT TO authenticated
  USING (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS document_chunks_select_staff ON document_chunks;
CREATE POLICY document_chunks_select_staff ON document_chunks
  FOR SELECT TO authenticated
  USING (is_staff() AND city_id = current_user_city_id());

-- No INSERT/UPDATE/DELETE policy on purpose: ingestion, chunking, and deletion
-- all run in server actions on the service-role client (bypasses RLS), which
-- keeps chunk_count and the storage object in step with the rows.

-- ---------------------------------------------------------------------------
-- 3. Private storage bucket
-- ---------------------------------------------------------------------------
-- PRIVATE (public = false) with NO storage.objects policies: only the service
-- role reads/writes it. Staff download via short-lived signed URLs minted
-- server-side, same as the video buckets.

INSERT INTO storage.buckets (id, name, public)
VALUES ('city-documents', 'city-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Guidance retrieval RPC
-- ---------------------------------------------------------------------------
-- PostgREST cannot express `ORDER BY ts_rank(...)` against a query-time
-- tsquery, so ranked retrieval lives in an RPC, same shape as
-- find_nearby_detection_cluster. websearch_to_tsquery (not plainto_) so staff
-- can type quoted phrases and -negations in the retrieval box.
--
-- Two passes. The strict pass is the websearch query as typed (AND semantics).
-- Real scenarios rarely survive it: an operator types "pothole on Peachtree
-- Industrial Blvd" and the policy says "Boulevard", so one unmatched token
-- zeroes the whole result. The loose pass rewrites the query's ANDs to ORs and
-- runs only when the strict pass found nothing, ts_rank still floats the
-- chunks matching the most terms to the top. Phrase operators (<->) survive
-- the rewrite untouched; a query carrying a negation (!) skips the loose pass,
-- since OR-ing a negation would match nearly everything.
--
-- SECURITY DEFINER, but city scope is NOT taken on trust: callers are
-- service-role server actions that have already resolved the caller's city via
-- getStaffAccessForCity, and _city_id is always that resolved id.

CREATE OR REPLACE FUNCTION public.search_document_chunks(
  _city_id uuid,
  _query   text,
  _limit   int DEFAULT 5
)
RETURNS TABLE (
  chunk_id       uuid,
  document_id    uuid,
  document_title text,
  doc_kind       text,
  heading        text,
  ordinal        int,
  content        text,
  rank           real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('english', _query) AS strict
  ),
  qq AS (
    SELECT
      strict,
      CASE
        WHEN strict::text = '' OR strict::text LIKE '%!%' THEN strict
        ELSE replace(strict::text, ' & ', ' | ')::tsquery
      END AS loose
    FROM q
  ),
  strict_hits AS (
    SELECT
      dc.id, dc.document_id, d.title, d.doc_kind, dc.heading, dc.ordinal,
      dc.content, ts_rank(dc.tsv, qq.strict) AS rank
    FROM document_chunks dc
    JOIN city_documents d ON d.id = dc.document_id
    CROSS JOIN qq
    WHERE dc.city_id = _city_id AND dc.tsv @@ qq.strict
  ),
  loose_hits AS (
    SELECT
      dc.id, dc.document_id, d.title, d.doc_kind, dc.heading, dc.ordinal,
      dc.content, ts_rank(dc.tsv, qq.loose) AS rank
    FROM document_chunks dc
    JOIN city_documents d ON d.id = dc.document_id
    CROSS JOIN qq
    WHERE dc.city_id = _city_id
      AND dc.tsv @@ qq.loose
      AND NOT EXISTS (SELECT 1 FROM strict_hits)
  )
  SELECT * FROM (
    SELECT * FROM strict_hits
    UNION ALL
    SELECT * FROM loose_hits
  ) hits
  ORDER BY hits.rank DESC, hits.ordinal ASC
  LIMIT GREATEST(1, LEAST(coalesce(_limit, 5), 50));
$$;

GRANT EXECUTE ON FUNCTION public.search_document_chunks(uuid, text, int)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE city_documents IS
  'Staff-uploaded municipal source documents (policies, contracts, specs) for a city. The original file lives in the private city-documents bucket; the text lives in document_chunks.';
COMMENT ON TABLE document_chunks IS
  'Ordered ~800-char text chunks of a city_document with a generated english tsvector. Full-text retrieval only. This project has no pgvector and stores no embeddings.';
COMMENT ON FUNCTION public.search_document_chunks(uuid, text, int) IS
  'City-scoped ranked guidance lookup: websearch_to_tsquery + ts_rank over document_chunks.tsv.';
