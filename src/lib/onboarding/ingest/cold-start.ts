// Cold-start orchestrator (F5) — the single entry the wizard's background job
// drives after provisionCity. Picks the data source (real ArcGIS if configured
// and non-empty, else the universal synthetic fallback) and persists via the
// writer. Honest degraded reporting: if ArcGIS was requested but yielded nothing,
// `degraded` explains the synthetic fallback (surfaced in the StatusBar).
//
// Job-row creation lives in the calling server action; pass its id as deps.jobId.

import type { BoundaryGeometry } from "@/lib/onboarding/tiger";
import type { Result } from "@/lib/types";
import { type ArcGisConfig, fetchArcGisReports } from "./arcgis";
import { generateSyntheticReports } from "./synthetic";
import type { NormalizedReport } from "./types";
import { type IngestDeps, ingestReports } from "./writer";

type FetchLike = typeof fetch;

export interface ColdStartInput {
  cityId: string;
  boundary: BoundaryGeometry;
  /** When set, try real ArcGIS data first; fall back to synthetic on miss. */
  arcgis?: ArcGisConfig;
  /** Synthetic fallback volume. Default 200. */
  syntheticCount?: number;
  seed?: number;
}

export interface ColdStartResult {
  source: "arcgis" | "synthetic";
  inserted: number;
  jobId: string | null;
  /** Set when ArcGIS was requested but empty/failed and we fell back to synthetic. */
  degraded?: string;
}

interface ColdStartDeps
  extends Pick<IngestDeps, "db" | "photoBaseUrl" | "jobId"> {
  fetchImpl?: FetchLike;
  now?: number;
}

export async function coldStart(
  input: ColdStartInput,
  deps: ColdStartDeps = {},
): Promise<Result<ColdStartResult>> {
  const now = deps.now ?? Date.now();
  let reports: NormalizedReport[];
  let source: "arcgis" | "synthetic";
  let degraded: string | undefined;

  if (input.arcgis) {
    const pulled = await fetchArcGisReports(input.arcgis, deps.fetchImpl, now);
    if (pulled.ok && pulled.data.length > 0) {
      reports = pulled.data;
      source = "arcgis";
    } else {
      degraded = pulled.ok
        ? "ArcGIS source returned no rows — filled with synthetic data"
        : `ArcGIS pull failed (${pulled.error}) — filled with synthetic data`;
      reports = generateSyntheticReports({
        boundary: input.boundary,
        count: input.syntheticCount ?? 200,
        seed: input.seed,
        now,
      });
      source = "synthetic";
    }
  } else {
    reports = generateSyntheticReports({
      boundary: input.boundary,
      count: input.syntheticCount ?? 200,
      seed: input.seed,
      now,
    });
    source = "synthetic";
  }

  const ingested = await ingestReports(input.cityId, reports, {
    db: deps.db,
    jobId: deps.jobId,
    photoBaseUrl: deps.photoBaseUrl,
  });
  if (!ingested.ok) return ingested;

  return {
    ok: true,
    data: {
      source,
      inserted: ingested.data.inserted,
      jobId: ingested.data.jobId,
      degraded,
    },
  };
}
