"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { requireClaimsAdmin } from "@/app/admin/claims/actions";
import type {
  ImportKind,
  ImportPreview,
  ImportPreviewRow,
  LedgerTotals,
  SweepHorizon,
  SweepRow,
} from "@/components/liability/queue-types";
import { createServerClient } from "@/lib/db/client";
import { fetchExpiringWarranties } from "@/lib/liability/sweep";
import { createLogger } from "@/lib/logger";
import { parseCsv } from "@/lib/onboarding/ingest/csv";
import type { Result } from "@/lib/types";

const log = createLogger("admin-liability");

/* ==================================================================
   /admin/liability — the expiry sweep, the recovery ledger, and the
   v1 way to get contract data into the system at all (spec 3.4/3.5/5.4).

   Every read degrades to an empty result: migration 062/063 are
   written but NOT applied, so this screen has to render its
   onboarding empty state on a database that has never seen a
   capital_jobs table.

   COORDINATE ASSUMPTION: every footprint written here is EPSG:4326
   lon/lat, matching `geography(GEOMETRY, 4326)`. Nothing reprojects.
   ================================================================== */

function num(row: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v !== "" && Number.isFinite(Number(v)))
      return Number(v);
  }
  return 0;
}

/**
 * Warranty expiry sweep — spec 3.4 calls this the highest-ROI screen in the
 * spec, because it converts "we forgot" into a worklist.
 *
 * The engine owns the query (`src/lib/liability/sweep.ts`); this only shapes
 * rows for the table and swallows the error arm, since a city that has not
 * applied migration 062 must land on the import empty state, not a 500.
 */
export async function getSweep(horizonDays: SweepHorizon): Promise<SweepRow[]> {
  const admin = await requireClaimsAdmin();
  if (!admin) return [];

  let result: Awaited<ReturnType<typeof fetchExpiringWarranties>>;
  try {
    result = await fetchExpiringWarranties(admin.cityId, horizonDays);
  } catch (err) {
    // A database that predates migration 062 has no capital_jobs table at all.
    // The screen must land on the import empty state, never a 500.
    log.error("warranty sweep threw", err, { horizonDays });
    return [];
  }
  if (!result.ok) {
    log.error("warranty sweep failed", new Error(String(result.error)), {
      horizonDays,
    });
    return [];
  }

  return result.data.map((w) => ({
    warrantyId: w.warrantyId,
    capitalJobId: w.capitalJobId,
    contractRef: w.contractRef,
    contractorName: w.contractorName,
    jobType: w.jobType,
    warrantyType: w.warrantyType,
    endsOn: w.endsOn,
    daysRemaining: w.daysRemaining,
    openDefectCount: w.openReportCount,
  }));
}

/** Recovery ledger totals (spec 5.4) — the renewal argument, from day one. */
export async function getLedgerTotals(): Promise<LedgerTotals> {
  const empty: LedgerTotals = {
    draft: 0,
    sent: 0,
    accepted: 0,
    declined: 0,
    disputed: 0,
    resolved: 0,
    dismissed: 0,
    inFlightCents: 0,
    recoveredCents: 0,
    unclaimedCents: 0,
  };

  const admin = await requireClaimsAdmin();
  if (!admin) return empty;

  const db = createServerClient();
  const { data, error } = await db
    .from("claims")
    .select("state, estimated_value_cents, recovered_value_cents")
    .eq("city_id", admin.cityId);

  if (error) {
    log.error("ledger fetch failed", error, { cityId: admin.cityId });
    return empty;
  }

  const totals = { ...empty };
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const state = String(row.state ?? "");
    const est = num(row, "estimated_value_cents");
    const rec = num(row, "recovered_value_cents");
    if (state in totals) {
      (totals as unknown as Record<string, number>)[state] += 1;
    }
    if (state === "resolved") totals.recoveredCents += rec;
    else if (state === "draft") totals.unclaimedCents += est;
    else if (state !== "dismissed") totals.inFlightCents += est;
  }
  return totals;
}

/* ------------------------------------------------------------------
   CSV import (spec 3.5 v1: manual + CSV; ArcGIS is v2).
   ------------------------------------------------------------------ */

/** Column aliases per logical field. First header that matches wins. */
const CAPITAL_ALIASES: Record<string, string[]> = {
  contract_ref: ["contract_ref", "contract", "contract_no", "po", "po_number"],
  job_type: ["job_type", "type", "work_type"],
  description: ["description", "scope", "notes", "name"],
  completed_at: ["completed_at", "completion_date", "completed", "end_date"],
  contract_value: ["contract_value", "value", "amount", "cost"],
  warranty_type: ["warranty_type"],
  warranty_ends_on: ["warranty_ends_on", "warranty_end", "warranty_expires"],
  footprint: ["footprint", "geometry", "wkt", "the_geom", "shape"],
  external_id: ["id", "external_id", "project_id"],
};

const PERMIT_ALIASES: Record<string, string[]> = {
  permittee_name: ["permittee_name", "permittee", "utility", "company"],
  permit_ref: ["permit_ref", "permit", "permit_no", "permit_number"],
  restored_on: ["restored_on", "restoration_date", "restored"],
  liability_ends_on: [
    "liability_ends_on",
    "liability_end",
    "degradation_end",
    "warranty_expires",
  ],
  footprint: ["trench", "footprint", "geometry", "wkt", "the_geom", "shape"],
  external_id: ["id", "external_id"],
};

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

function buildMapping(
  headers: string[],
  aliases: Record<string, string[]>,
): Record<string, number | null> {
  const normalized = headers.map(norm);
  const out: Record<string, number | null> = {};
  for (const [field, candidates] of Object.entries(aliases)) {
    const idx = normalized.findIndex((h) => candidates.includes(h));
    out[field] = idx >= 0 ? idx : null;
  }
  return out;
}

/**
 * Footprint parser. Accepts either WKT/EWKT straight out of a GIS export, or
 * the pragmatic fallback the spec asks for: a list of lat/lng pairs a clerk can
 * paste from a map. Pairs are read as LAT,LNG (the order every consumer web map
 * prints) and emitted as WKT lon-lat, which is what EPSG:4326 requires.
 * Returns null when nothing usable is present — the caller skips the row.
 */
function parseFootprint(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  if (/^srid=\d+;/i.test(text)) return text;
  if (
    /^(point|linestring|polygon|multipoint|multilinestring|multipolygon|geometrycollection)\s*[(z]/i.test(
      text,
    )
  ) {
    return `SRID=4326;${text}`;
  }

  const pairs: [number, number][] = [];
  for (const chunk of text.split(/[;\n]+/)) {
    const nums = chunk.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 2) continue;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const lat = Number(nums[i]);
      const lng = Number(nums[i + 1]);
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      pairs.push([lng, lat]);
    }
  }
  if (pairs.length === 0) return null;
  if (pairs.length === 1) {
    return `SRID=4326;POINT(${pairs[0][0]} ${pairs[0][1]})`;
  }
  return `SRID=4326;LINESTRING(${pairs.map(([x, y]) => `${x} ${y}`).join(", ")})`;
}

/**
 * Read a spreadsheet cell as a CALENDAR date (no time, no zone).
 *
 * `Date.parse("3/5/2026")` is interpreted in the server's local timezone;
 * `.toISOString()` then re-expresses it in UTC. West of UTC that lands on the
 * previous day, so a warranty imported as 2026-03-05 was stored as 2026-03-04.
 * These dates decide whether a defect is still under warranty, so a one-day
 * drift silently changes liability at the boundary — and it moved with the
 * deploy region, which makes it maddening to reproduce.
 *
 * A date-only string has no instant attached, so no conversion should happen:
 * ISO input is taken verbatim, and anything else is read back through local
 * calendar getters rather than a UTC re-projection.
 */
function parseDateOnly(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseCents(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const JOB_TYPES = new Set([
  "resurfacing",
  "sidewalk",
  "signal",
  "streetlight",
  "other",
]);

/**
 * Mirrors the CHECK constraint on warranties.warranty_type (migration 062).
 * An out-of-range value from the CSV used to reach the INSERT and fail the
 * whole warranty batch, so the import is normalised here the same way
 * job_type already is.
 */
const WARRANTY_TYPES = new Set([
  "workmanship",
  "pavement_performance",
  "manufacturer",
  "maintenance_bond",
]);

/** Normalise a CSV warranty_type to a value the DB CHECK accepts. */
function normalizeWarrantyType(raw: string | undefined | null): string {
  const v =
    raw
      ?.trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_") ?? "";
  return WARRANTY_TYPES.has(v) ? v : "workmanship";
}

interface ParsedImport {
  headers: string[];
  mapping: Record<string, number | null>;
  records: Record<string, unknown>[];
  preview: ImportPreviewRow[];
  skipped: number;
}

function parseImport(
  text: string,
  kind: ImportKind,
  sharedFootprint: string | null,
): Result<ParsedImport> {
  const grid = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (grid.length < 2) return { ok: false, error: "csv_needs_header_and_rows" };

  const headers = grid[0].map((h) => h.trim());
  const aliases = kind === "capital_jobs" ? CAPITAL_ALIASES : PERMIT_ALIASES;
  const mapping = buildMapping(headers, aliases);
  const shared = parseFootprint(sharedFootprint);

  const cell = (row: string[], field: string): string | undefined => {
    const idx = mapping[field];
    return idx == null ? undefined : row[idx];
  };

  const records: Record<string, unknown>[] = [];
  const preview: ImportPreviewRow[] = [];
  let skipped = 0;

  for (const row of grid.slice(1)) {
    const footprint = parseFootprint(cell(row, "footprint")) ?? shared;
    if (!footprint) {
      skipped += 1;
      continue;
    }

    if (kind === "capital_jobs") {
      const completedAt = parseDateOnly(cell(row, "completed_at"));
      if (!completedAt) {
        skipped += 1;
        continue;
      }
      const jobTypeRaw = norm(cell(row, "job_type") ?? "");
      const record = {
        contract_ref: cell(row, "contract_ref")?.trim() || null,
        job_type: JOB_TYPES.has(jobTypeRaw) ? jobTypeRaw : "other",
        description: cell(row, "description")?.trim() || null,
        completed_at: completedAt,
        contract_value_cents: parseCents(cell(row, "contract_value")),
        footprint,
        source: "csv",
        source_external_id: cell(row, "external_id")?.trim() || null,
        // Carried alongside the job; written into `warranties` after insert.
        __warranty_type: normalizeWarrantyType(cell(row, "warranty_type")),
        __warranty_ends_on: parseDateOnly(cell(row, "warranty_ends_on")),
      };
      records.push(record);
      if (preview.length < 10) {
        preview.push({
          label: record.contract_ref ?? record.description ?? "(no reference)",
          detail: `${record.job_type} · completed ${completedAt}${
            record.__warranty_ends_on
              ? ` · warranty to ${record.__warranty_ends_on}`
              : " · no warranty date"
          }`,
          footprint: footprint.slice(0, 60),
        });
      }
    } else {
      const permittee = cell(row, "permittee_name")?.trim();
      if (!permittee) {
        skipped += 1;
        continue;
      }
      const record = {
        permittee_name: permittee,
        permit_ref: cell(row, "permit_ref")?.trim() || null,
        restored_on: parseDateOnly(cell(row, "restored_on")),
        liability_ends_on: parseDateOnly(cell(row, "liability_ends_on")),
        trench: footprint,
        source: "csv",
        source_external_id: cell(row, "external_id")?.trim() || null,
      };
      records.push(record);
      if (preview.length < 10) {
        preview.push({
          label: permittee,
          detail: `${record.permit_ref ? `permit #${record.permit_ref} · ` : ""}liability to ${record.liability_ends_on ?? "unknown"}`,
          footprint: footprint.slice(0, 60),
        });
      }
    }
  }

  if (records.length === 0) return { ok: false, error: "no_importable_rows" };
  return { ok: true, data: { headers, mapping, records, preview, skipped } };
}

export async function previewLiabilityImport(input: {
  text: string;
  kind: ImportKind;
  sharedFootprint?: string;
}): Promise<Result<ImportPreview>> {
  const admin = await requireClaimsAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const parsed = parseImport(
    input.text,
    input.kind,
    input.sharedFootprint ?? null,
  );
  if (!parsed.ok) return parsed;

  const { headers, mapping, records, preview, skipped } = parsed.data;
  const readable: Record<string, string | null> = {};
  for (const [field, idx] of Object.entries(mapping)) {
    readable[field] = idx == null ? null : (headers[idx] ?? null);
  }

  return {
    ok: true,
    data: {
      headers,
      mapping: readable,
      rows: preview,
      total: records.length,
      skipped,
    },
  };
}

export async function confirmLiabilityImport(input: {
  text: string;
  kind: ImportKind;
  sharedFootprint?: string;
}): Promise<Result<{ inserted: number; skipped: number }>> {
  const admin = await requireClaimsAdmin();
  if (!admin) return { ok: false, error: "unauthorized" };

  const parsed = parseImport(
    input.text,
    input.kind,
    input.sharedFootprint ?? null,
  );
  if (!parsed.ok) return parsed;

  const db = createServerClient();
  const { records, skipped } = parsed.data;

  if (input.kind === "utility_permits") {
    const { data, error } = await db
      .from("utility_permits")
      .insert(records.map((r) => ({ ...r, city_id: admin.cityId })))
      .select("id");
    if (error) {
      log.error("utility permit import failed", error);
      return { ok: false, error: "import_failed" };
    }
    revalidatePath("/admin/liability");
    return { ok: true, data: { inserted: (data ?? []).length, skipped } };
  }

  const jobs = records.map((r) => {
    const { __warranty_type, __warranty_ends_on, ...job } = r as Record<
      string,
      unknown
    > & { __warranty_type?: string; __warranty_ends_on?: string | null };
    return {
      job: { ...job, city_id: admin.cityId },
      __warranty_type,
      __warranty_ends_on,
    };
  });

  const { data, error } = await db
    .from("capital_jobs")
    .insert(jobs.map((j) => j.job))
    .select("id, completed_at");
  if (error) {
    log.error("capital job import failed", error);
    return { ok: false, error: "import_failed" };
  }

  const inserted = (data ?? []) as { id: string; completed_at: string }[];

  // A capital job with no warranty row never reaches the sweep, so the
  // warranty is written in the same import rather than a second screen.
  const warranties = inserted
    .map((row, i) => {
      const endsOn = jobs[i]?.__warranty_ends_on ?? null;
      if (!endsOn) return null;
      return {
        capital_job_id: row.id,
        warranty_type: jobs[i]?.__warranty_type || "workmanship",
        starts_on: row.completed_at,
        ends_on: endsOn,
      };
    })
    .filter((w): w is NonNullable<typeof w> => w !== null);

  if (warranties.length > 0) {
    const { error: wErr } = await db.from("warranties").insert(warranties);
    if (wErr) {
      log.error("warranty rows import failed", wErr);
      // Do NOT report success. A capital job with no warranty row is invisible
      // to the expiry sweep and can never produce a liability verdict, so
      // silently swallowing this loses the entire point of the import while
      // telling staff it worked. Surfacing it lets them fix the CSV and retry;
      // the capital jobs are already in, so the retry is additive.
      revalidatePath("/admin/liability");
      return {
        ok: false,
        error: `capital_jobs_imported_but_warranties_failed: ${wErr.message}`,
      };
    }
  }

  revalidatePath("/admin/liability");
  return { ok: true, data: { inserted: inserted.length, skipped } };
}
