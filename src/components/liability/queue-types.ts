/* ==================================================================
   Shared shapes for the liability admin surfaces.

   These live outside the two `actions.ts` files on purpose: a
   "use server" module may only export async functions, so the enums
   and row types the client components need have to sit in a plain
   module. Nothing here imports server code, so the client bundle
   stays clean.
   ================================================================== */

export const CLAIM_STATES = [
  "draft",
  "approved",
  "sent",
  "accepted",
  "declined",
  "disputed",
  "resolved",
  "dismissed",
] as const;

export type ClaimState = (typeof CLAIM_STATES)[number];

export interface ClaimQueueRow {
  id: string;
  report_id: string;
  state: ClaimState;
  basis: "warranty" | "utility_restoration";
  liable_contractor_id: string | null;
  contractor_name: string | null;
  contractor_email: string | null;
  estimated_value_cents: number | null;
  recovered_value_cents: number | null;
  sent_at: string | null;
  created_at: string;
  /** Denormalized so a queue row is readable without opening the packet. */
  report_address: string | null;
  report_category: string | null;
  window_ends_on: string | null;
  confidence: number | null;
  contract_ref: string | null;
  permit_ref: string | null;
}

/** Expiry-sweep horizons in days (spec 3.4). */
export const SWEEP_HORIZONS = [60, 30, 7] as const;
export type SweepHorizon = (typeof SWEEP_HORIZONS)[number];

/** One expiring warranty, as the sweep table renders it. */
export interface SweepRow {
  warrantyId: string;
  capitalJobId: string;
  contractRef: string | null;
  contractorName: string | null;
  jobType: string;
  warrantyType: string;
  endsOn: string;
  daysRemaining: number;
  openDefectCount: number;
}

/** Recovery ledger totals (spec 5.4). */
export interface LedgerTotals {
  draft: number;
  sent: number;
  accepted: number;
  declined: number;
  disputed: number;
  resolved: number;
  dismissed: number;
  /** Estimated value of everything sent but not yet resolved or dismissed. */
  inFlightCents: number;
  /** Sum of recovered_value_cents on resolved claims. */
  recoveredCents: number;
  /** Estimated value still sitting in a live window with nothing sent. */
  unclaimedCents: number;
}

export type ImportKind = "capital_jobs" | "utility_permits";

export interface ImportPreviewRow {
  label: string;
  detail: string;
  footprint: string;
}

export interface ImportPreview {
  headers: string[];
  /** Logical field → the CSV header it was mapped to (null = unmapped). */
  mapping: Record<string, string | null>;
  rows: ImportPreviewRow[];
  total: number;
  skipped: number;
}
