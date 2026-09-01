// Shared shape every cold-start adapter (synthetic / arcgis / csv / open311)
// emits. The writer is adapter-agnostic: it consumes NormalizedReport[] only.
// See docs/planning/F5_INGEST.md §1.

import type { ReportCategory, ReportStatus } from "@/lib/types";

export type IngestSource = "synthetic" | "arcgis" | "open311" | "csv";

export interface NormalizedReport {
  source: IngestSource;
  /** Upstream id for idempotent re-import (unique per city+source). */
  sourceExternalId?: string;
  location: { lng: number; lat: number };
  category: ReportCategory;
  severity: 1 | 2 | 3 | 4 | 5;
  status: ReportStatus;
  /** ISO timestamp; preserves source/historical time (not now()). */
  createdAt: string;
  /** ISO timestamp when the issue was resolved. Backfills work_orders.completed_at
   *  so the resolution-time KPI is real. Set only for closed reports. */
  resolvedAt?: string;
  address?: string;
  photoUrl?: string;
  raw?: Record<string, unknown>;
}
