import "server-only";

import { createServerClient } from "@/lib/db/client";
import { maskEmail } from "@/lib/db/members";
import { createLogger } from "@/lib/logger";
import type { Result } from "@/lib/types";

const logger = createLogger("[contractors-db]");

/* ==================================================================
   Contractors workspace queries.

   contractors (migration 053/062) deliberately carries NO client-readable
   RLS policy. A vendor must never enumerate a city's other vendors. Every
   read here therefore runs on the service-role client with an explicit
   city_id filter, the same trust model as the documents actions.

   Demo-grade sessions get maskEmail'd addresses (same rationale as the
   members table: demo credentials are public, vendor emails are PII).
   ================================================================== */

export interface ContractorListRow {
  id: string;
  name: string;
  email: string | null;
  active: boolean;
  createdAt: string;
  /** Capital jobs on file for this vendor. */
  jobCount: number;
  /** Warranty windows containing today. */
  liveWarranties: number;
  /** Soonest ends_on among live warranties, ISO date, the sweep signal. */
  nextExpiry: string | null;
  /** Documents filed under this vendor. */
  documentCount: number;
  /** Reports currently attributed to this vendor's warranty/restoration. */
  liableReports: number;
}

export interface ContractorWarranty {
  id: string;
  warrantyType: string;
  startsOn: string;
  endsOn: string;
  coversCategories: string[] | null;
  bondRef: string | null;
}

export interface ContractorJob {
  id: string;
  contractRef: string | null;
  jobType: string;
  description: string | null;
  completedAt: string;
  contractValueCents: number | null;
  source: string;
  warranties: ContractorWarranty[];
}

export interface ContractorDocument {
  id: string;
  title: string;
  filename: string;
  docKind: string;
  chunkCount: number;
  createdAt: string;
}

export interface ContractorLiableReport {
  reportId: string;
  verdict: string;
  windowEndsOn: string | null;
  confidence: number;
  address: string | null;
  status: string;
  category: string | null;
  createdAt: string;
}

export interface ContractorDetail {
  id: string;
  name: string;
  email: string | null;
  active: boolean;
  createdAt: string;
  jobs: ContractorJob[];
  documents: ContractorDocument[];
  liableReports: ContractorLiableReport[];
}

/** UTC calendar date of "now". Warranty windows are dates, not instants. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * All contractors for a city with the aggregates the list view filters on.
 * Four batched queries (contractors, jobs+warranties, documents, liability),
 * joined in memory. Vendor counts are tens, not thousands.
 */
export async function listContractors(
  cityId: string,
  opts: { maskPii: boolean },
): Promise<Result<ContractorListRow[]>> {
  const db = createServerClient();

  const { data: contractorRows, error: cErr } = await db
    .from("contractors")
    .select("id, name, email, active, created_at")
    .eq("city_id", cityId)
    .order("name");
  if (cErr) {
    logger.error("contractors list failed", cErr, { cityId });
    return { ok: false, error: "query_failed" };
  }
  const contractors = (contractorRows ?? []) as {
    id: string;
    name: string;
    email: string | null;
    active: boolean;
    created_at: string;
  }[];
  if (contractors.length === 0) return { ok: true, data: [] };
  const ids = contractors.map((c) => c.id);

  const [jobsRes, docsRes, liabilityRes] = await Promise.all([
    db
      .from("capital_jobs")
      .select("id, contractor_id, warranties(id, ends_on, starts_on)")
      .eq("city_id", cityId)
      .in("contractor_id", ids),
    db
      .from("city_documents")
      .select("id, contractor_id")
      .eq("city_id", cityId)
      .in("contractor_id", ids),
    db
      .from("report_liability")
      .select("liable_contractor_id, reports!inner(city_id)")
      .eq("reports.city_id", cityId)
      .in("liable_contractor_id", ids),
  ]);

  const today = todayIso();
  const jobCount = new Map<string, number>();
  const liveWarranties = new Map<string, number>();
  const nextExpiry = new Map<string, string>();
  for (const row of (jobsRes.data ?? []) as {
    id: string;
    contractor_id: string | null;
    warranties:
      | { id: string; ends_on: string; starts_on: string }[]
      | { id: string; ends_on: string; starts_on: string }
      | null;
  }[]) {
    if (!row.contractor_id) continue;
    jobCount.set(row.contractor_id, (jobCount.get(row.contractor_id) ?? 0) + 1);
    const list = Array.isArray(row.warranties)
      ? row.warranties
      : row.warranties
        ? [row.warranties]
        : [];
    for (const w of list) {
      if (w.starts_on <= today && w.ends_on >= today) {
        liveWarranties.set(
          row.contractor_id,
          (liveWarranties.get(row.contractor_id) ?? 0) + 1,
        );
        const prev = nextExpiry.get(row.contractor_id);
        if (!prev || w.ends_on < prev)
          nextExpiry.set(row.contractor_id, w.ends_on);
      }
    }
  }

  const documentCount = new Map<string, number>();
  for (const row of (docsRes.data ?? []) as {
    contractor_id: string | null;
  }[]) {
    if (!row.contractor_id) continue;
    documentCount.set(
      row.contractor_id,
      (documentCount.get(row.contractor_id) ?? 0) + 1,
    );
  }

  const liableReports = new Map<string, number>();
  for (const row of (liabilityRes.data ?? []) as {
    liable_contractor_id: string | null;
  }[]) {
    if (!row.liable_contractor_id) continue;
    liableReports.set(
      row.liable_contractor_id,
      (liableReports.get(row.liable_contractor_id) ?? 0) + 1,
    );
  }

  return {
    ok: true,
    data: contractors.map((c) => ({
      id: c.id,
      name: c.name,
      email: opts.maskPii ? maskEmail(c.email) : c.email,
      active: c.active,
      createdAt: c.created_at,
      jobCount: jobCount.get(c.id) ?? 0,
      liveWarranties: liveWarranties.get(c.id) ?? 0,
      nextExpiry: nextExpiry.get(c.id) ?? null,
      documentCount: documentCount.get(c.id) ?? 0,
      liableReports: liableReports.get(c.id) ?? 0,
    })),
  };
}

/**
 * One contractor with everything the detail page shows: capital jobs and
 * their warranty windows, documents filed under the vendor, and the reports
 * currently attributed to it. City scoping on every query. A contractor id
 * from another city returns not_found, never data.
 */
export async function getContractorDetail(
  cityId: string,
  contractorId: string,
  opts: { maskPii: boolean },
): Promise<Result<ContractorDetail>> {
  const db = createServerClient();

  const { data: contractor, error: cErr } = await db
    .from("contractors")
    .select("id, name, email, active, created_at")
    .eq("city_id", cityId)
    .eq("id", contractorId)
    .maybeSingle<{
      id: string;
      name: string;
      email: string | null;
      active: boolean;
      created_at: string;
    }>();
  if (cErr) {
    logger.error("contractor fetch failed", cErr, { cityId, contractorId });
    return { ok: false, error: "query_failed" };
  }
  if (!contractor) return { ok: false, error: "not_found" };

  const [jobsRes, docsRes, liabilityRes] = await Promise.all([
    db
      .from("capital_jobs")
      .select(
        "id, contract_ref, job_type, description, completed_at, contract_value_cents, source, warranties(id, warranty_type, starts_on, ends_on, covers_categories, bond_ref)",
      )
      .eq("city_id", cityId)
      .eq("contractor_id", contractorId)
      .order("completed_at", { ascending: false }),
    db
      .from("city_documents")
      .select("id, title, filename, doc_kind, chunk_count, created_at")
      .eq("city_id", cityId)
      .eq("contractor_id", contractorId)
      .order("created_at", { ascending: false }),
    db
      .from("report_liability")
      .select(
        "report_id, verdict, window_ends_on, confidence, reports!inner(city_id, address, status, created_at, classifications(category))",
      )
      .eq("reports.city_id", cityId)
      .eq("liable_contractor_id", contractorId)
      .order("evaluated_at", { ascending: false })
      .limit(100),
  ]);

  interface WarrantyEmbed {
    id: string;
    warranty_type: string;
    starts_on: string;
    ends_on: string;
    covers_categories: string[] | null;
    bond_ref: string | null;
  }
  const jobs: ContractorJob[] = (
    (jobsRes.data ?? []) as {
      id: string;
      contract_ref: string | null;
      job_type: string;
      description: string | null;
      completed_at: string;
      contract_value_cents: number | null;
      source: string;
      warranties: WarrantyEmbed[] | WarrantyEmbed | null;
    }[]
  ).map((j) => ({
    id: j.id,
    contractRef: j.contract_ref,
    jobType: j.job_type,
    description: j.description,
    completedAt: j.completed_at,
    contractValueCents: j.contract_value_cents,
    source: j.source,
    warranties: (Array.isArray(j.warranties)
      ? j.warranties
      : j.warranties
        ? [j.warranties]
        : []
    ).map((w) => ({
      id: w.id,
      warrantyType: w.warranty_type,
      startsOn: w.starts_on,
      endsOn: w.ends_on,
      coversCategories: w.covers_categories,
      bondRef: w.bond_ref,
    })),
  }));

  const documents: ContractorDocument[] = (
    (docsRes.data ?? []) as {
      id: string;
      title: string;
      filename: string;
      doc_kind: string;
      chunk_count: number;
      created_at: string;
    }[]
  ).map((d) => ({
    id: d.id,
    title: d.title,
    filename: d.filename,
    docKind: d.doc_kind,
    chunkCount: d.chunk_count,
    createdAt: d.created_at,
  }));

  interface ReportEmbed {
    city_id: string;
    address: string | null;
    status: string;
    created_at: string;
    classifications:
      | { category: string | null }[]
      | { category: string | null }
      | null;
  }
  const liableReports: ContractorLiableReport[] = (
    (liabilityRes.data ?? []) as unknown as {
      report_id: string;
      verdict: string;
      window_ends_on: string | null;
      confidence: number;
      reports: ReportEmbed | ReportEmbed[] | null;
    }[]
  ).map((r) => {
    const rep = Array.isArray(r.reports) ? r.reports[0] : r.reports;
    const cls = rep
      ? Array.isArray(rep.classifications)
        ? rep.classifications[0]
        : rep.classifications
      : null;
    return {
      reportId: r.report_id,
      verdict: r.verdict,
      windowEndsOn: r.window_ends_on,
      confidence: Number(r.confidence),
      address: rep?.address ?? null,
      status: rep?.status ?? "open",
      category: cls?.category ?? null,
      createdAt: rep?.created_at ?? "",
    };
  });

  return {
    ok: true,
    data: {
      id: contractor.id,
      name: contractor.name,
      email: opts.maskPii ? maskEmail(contractor.email) : contractor.email,
      active: contractor.active,
      createdAt: contractor.created_at,
      jobs,
      documents,
      liableReports,
    },
  };
}

/**
 * Lightweight id+name list for the Documents upload dropdown. Active vendors
 * only, a document filed today concerns a vendor the city still works with.
 */
export async function listContractorOptions(
  cityId: string,
): Promise<{ id: string; name: string }[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("contractors")
    .select("id, name")
    .eq("city_id", cityId)
    .eq("active", true)
    .order("name");
  if (error) {
    logger.error("contractor options failed", error, { cityId });
    return [];
  }
  return (data ?? []) as { id: string; name: string }[];
}
