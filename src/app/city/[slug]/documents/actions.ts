"use server";

import { z } from "zod/v4";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { chunkDocument } from "@/lib/documents/chunk";
import { DOC_KINDS } from "@/lib/documents/kinds";
import { findGuidance, type GuidanceChunk } from "@/lib/documents/retrieve";
import { createLogger } from "@/lib/logger";
import { getStaffAccessForCity } from "@/lib/staff-access";
import type { Result } from "@/lib/types";

const logger = createLogger("[documents-actions]");

const DOCS_BUCKET = "city-documents";
/** Server-action bodies are capped by Next; a policy PDF-sized text file is
 *  well under this, and a paste of a whole municipal code is not the use case. */
const MAX_DOC_CHARS = 300_000;

/**
 * Gate every action: caller is REAL staff for the slug (demo personas cannot
 * write a city's governing documents) and the city exists. Returns the
 * resolved city id + caller id.
 */
async function requireDocumentsStaff(
  slug: string,
): Promise<Result<{ cityId: string; userId: string | null }>> {
  const access = await getStaffAccessForCity(slug);
  if (access !== "real") return { ok: false, error: "forbidden" };
  const user = await getAuthUser();
  const db = createServerClient();
  const { data: city } = await db
    .from("cities")
    .select("id")
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();
  if (!city) return { ok: false, error: "unknown_city" };
  // uploaded_by is nullable, so the local dev bypass (staff without a session)
  // can still ingest, unlike a clip, a document needs no attributable author.
  return { ok: true, data: { cityId: city.id, userId: user?.id ?? null } };
}

const ingestSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1).max(200),
  filename: z.string().min(1).max(200),
  docKind: z.enum(DOC_KINDS),
  text: z.string().min(1).max(MAX_DOC_CHARS),
  /** Vendor this document concerns (066), optional; null files it as a
   *  general city document. */
  contractorId: z.uuid().nullable().optional(),
});

/**
 * Ingest one document: keep the original bytes in the private bucket, chunk the
 * text server-side (the client's chunking is never trusted), insert the chunks,
 * and record the count on the parent row.
 */
export async function ingestDocument(
  input: z.infer<typeof ingestSchema>,
): Promise<Result<{ documentId: string; chunkCount: number }>> {
  const parsed = ingestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const gate = await requireDocumentsStaff(parsed.data.slug);
  if (!gate.ok) return gate;
  const { cityId, userId } = gate.data;

  const chunks = chunkDocument(parsed.data.text);
  if (chunks.length === 0) return { ok: false, error: "no_text_content" };

  const db = createServerClient();

  // The contractor link is taken only after proving the id belongs to THIS
  // city. A forged id from another city must not attach, and contractors has
  // no client-readable RLS to catch it (service role bypasses RLS).
  let contractorId: string | null = null;
  if (parsed.data.contractorId) {
    const { data: contractor } = await db
      .from("contractors")
      .select("id")
      .eq("id", parsed.data.contractorId)
      .eq("city_id", cityId)
      .maybeSingle<{ id: string }>();
    if (!contractor) return { ok: false, error: "unknown_contractor" };
    contractorId = contractor.id;
  }

  // Storage first: a document row whose original is missing is worse than an
  // orphaned object, which the bucket lifecycle can sweep.
  const storagePath = `${cityId}/${crypto.randomUUID()}.txt`;
  const { error: uploadErr } = await db.storage
    .from(DOCS_BUCKET)
    .upload(storagePath, new Blob([parsed.data.text], { type: "text/plain" }), {
      contentType: "text/plain; charset=utf-8",
    });
  if (uploadErr) {
    logger.error("original upload failed", uploadErr, { cityId });
    return { ok: false, error: "storage_upload_failed" };
  }

  const { data: doc, error: docErr } = await db
    .from("city_documents")
    .insert({
      city_id: cityId,
      title: parsed.data.title,
      filename: parsed.data.filename,
      storage_path: storagePath,
      doc_kind: parsed.data.docKind,
      uploaded_by: userId,
      contractor_id: contractorId,
      chunk_count: 0,
    })
    .select("id")
    .single<{ id: string }>();
  if (docErr || !doc) {
    logger.error("document insert failed", docErr ?? undefined, { cityId });
    await db.storage.from(DOCS_BUCKET).remove([storagePath]);
    return { ok: false, error: "document_insert_failed" };
  }

  const { error: chunkErr } = await db.from("document_chunks").insert(
    chunks.map((chunk) => ({
      document_id: doc.id,
      city_id: cityId,
      ordinal: chunk.ordinal,
      content: chunk.content,
      heading: chunk.heading,
    })),
  );
  if (chunkErr) {
    logger.error("chunk insert failed", chunkErr, { documentId: doc.id });
    // Cascade takes the (zero or partial) chunks with the parent row.
    await db.from("city_documents").delete().eq("id", doc.id);
    await db.storage.from(DOCS_BUCKET).remove([storagePath]);
    return { ok: false, error: "chunk_insert_failed" };
  }

  await db
    .from("city_documents")
    .update({ chunk_count: chunks.length })
    .eq("id", doc.id);

  return { ok: true, data: { documentId: doc.id, chunkCount: chunks.length } };
}

const deleteSchema = z.object({
  slug: z.string().min(1),
  documentId: z.uuid(),
});

/** Delete a document, its chunks (FK cascade), and its stored original. */
export async function deleteDocument(
  input: z.infer<typeof deleteSchema>,
): Promise<Result<{ documentId: string }>> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const gate = await requireDocumentsStaff(parsed.data.slug);
  if (!gate.ok) return gate;

  const db = createServerClient();
  const { data: doc } = await db
    .from("city_documents")
    .select("id, city_id, storage_path")
    .eq("id", parsed.data.documentId)
    .maybeSingle<{
      id: string;
      city_id: string;
      storage_path: string | null;
    }>();
  if (!doc || doc.city_id !== gate.data.cityId) {
    return { ok: false, error: "not_found" };
  }

  const { error } = await db
    .from("city_documents")
    .delete()
    .eq("id", doc.id)
    .eq("city_id", gate.data.cityId);
  if (error) {
    logger.error("document delete failed", error, { documentId: doc.id });
    return { ok: false, error: "delete_failed" };
  }
  // Path is read back from the row, never from the caller. It cannot be
  // pointed at another city's folder.
  if (doc.storage_path) {
    await db.storage.from(DOCS_BUCKET).remove([doc.storage_path]);
  }

  return { ok: true, data: { documentId: doc.id } };
}

const retrievalSchema = z.object({
  slug: z.string().min(1),
  query: z.string().min(2).max(500),
});

/**
 * "Test retrieval": run a scenario through the same lookup a report surface
 * would use, so an operator can see which clause the mechanism would surface.
 */
export async function testRetrieval(
  input: z.infer<typeof retrievalSchema>,
): Promise<Result<GuidanceChunk[]>> {
  const parsed = retrievalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const gate = await requireDocumentsStaff(parsed.data.slug);
  if (!gate.ok) return gate;

  return findGuidance({
    cityId: gate.data.cityId,
    query: parsed.data.query,
    limit: 6,
  });
}
