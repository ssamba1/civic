import "server-only";

import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import type { Result } from "@/lib/types";

const logger = createLogger("[documents-retrieve]");

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

export interface GuidanceChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  docKind: string;
  heading: string | null;
  ordinal: number;
  content: string;
  rank: number;
}

interface GuidanceRow {
  chunk_id: string;
  document_id: string;
  document_title: string;
  doc_kind: string;
  heading: string | null;
  ordinal: number;
  content: string;
  rank: number;
}

export interface FindGuidanceInput {
  cityId: string;
  /** Free text — a scenario ("pothole on Peachtree Industrial Blvd"), not a
   *  keyword list. websearch_to_tsquery also honours "quoted phrases" and
   *  -exclusions, so staff can narrow without learning tsquery syntax. */
  query: string;
  limit?: number;
}

/**
 * SERVER-ONLY. Ranked, city-scoped guidance lookup over the uploaded document
 * corpus — Postgres full-text (`websearch_to_tsquery` + `ts_rank`) via the
 * `search_document_chunks` RPC. There are no embeddings in this project.
 *
 * A query with no indexable terms (punctuation, stop words only) is not an
 * error: it simply matches nothing, and the caller renders an empty state.
 */
export async function findGuidance({
  cityId,
  query,
  limit = DEFAULT_LIMIT,
}: FindGuidanceInput): Promise<Result<GuidanceChunk[]>> {
  const trimmed = query.trim();
  if (!cityId || !trimmed) return { ok: false, error: "invalid_input" };

  const db = createServerClient();
  const { data, error } = await db.rpc("search_document_chunks", {
    _city_id: cityId,
    _query: trimmed,
    _limit: Math.min(Math.max(limit, 1), MAX_LIMIT),
  });

  if (error) {
    logger.error("search_document_chunks failed", error, { cityId });
    return { ok: false, error: "search_failed" };
  }

  const rows = (data ?? []) as GuidanceRow[];
  return {
    ok: true,
    data: rows.map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      docKind: row.doc_kind,
      heading: row.heading,
      ordinal: row.ordinal,
      content: row.content,
      rank: Number(row.rank),
    })),
  };
}
