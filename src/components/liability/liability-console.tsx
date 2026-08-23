"use client";

import { useState } from "react";
import {
  confirmLiabilityImport,
  previewLiabilityImport,
} from "@/app/admin/liability/actions";
import {
  type ImportKind,
  type ImportPreview,
  SWEEP_HORIZONS,
  type SweepHorizon,
  type SweepRow,
} from "@/components/liability/queue-types";
import { Button } from "@/components/ui/button";
import { type CurrencyConfig, formatLocalDate } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   /admin/liability interactive half: the horizon chips over the
   expiry sweep, and the v1 contract-data importer (spec 3.5).

   All three horizons are fetched server-side and switched locally —
   60/30/7 is three small lists, and a round trip per chip would make
   the highest-ROI screen in the spec feel like a report builder.
   ================================================================== */

const titleize = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

interface Props {
  sweeps: Record<SweepHorizon, SweepRow[]>;
  currency: CurrencyConfig;
}

export function LiabilityConsole({ sweeps, currency }: Props) {
  const [horizon, setHorizon] = useState<SweepHorizon>(60);
  const rows = sweeps[horizon] ?? [];

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Warranty expiry sweep
          </h2>
          <div className="flex items-center gap-1.5">
            {SWEEP_HORIZONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHorizon(h)}
                className={cn(
                  "rounded-[var(--radius-sm)] border px-2.5 py-1 text-[12px] tabular-nums transition-colors",
                  horizon === h
                    ? "border-hairline-strong bg-[var(--accent)] text-[var(--accent-contrast)]"
                    : "border-hairline bg-overlay text-subtle hover:text-foreground",
                )}
              >
                {h} days
                <span className="ml-1.5 opacity-70">
                  {(sweeps[h] ?? []).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-hairline bg-surface px-4 py-8 text-center">
            <p className="text-sm text-subtle">
              No warranties lapsing within {horizon} days.
            </p>
            <p className="mt-1 text-[12px] text-faint">
              An empty sweep on a city with no capital jobs is not good news —
              it means there is nothing to check against. Import a paving
              schedule below.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-hairline bg-surface">
            <table className="w-full min-w-[40rem] text-left text-[13px]">
              <thead className="border-b border-hairline text-[11px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="px-3 py-2" scope="col">
                    Contract
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Contractor
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Job type
                  </th>
                  <th className="px-3 py-2" scope="col">
                    Warranty ends
                  </th>
                  <th className="px-3 py-2 text-right" scope="col">
                    Days left
                  </th>
                  <th className="px-3 py-2 text-right" scope="col">
                    Open defects
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.warrantyId}
                    className="border-b border-hairline last:border-b-0"
                  >
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {r.contractRef ? `#${r.contractRef}` : "(no reference)"}
                    </td>
                    <td className="px-3 py-2.5 text-subtle">
                      {r.contractorName ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-subtle">
                      {titleize(r.jobType)}
                      <span className="block text-[11px] text-faint">
                        {titleize(r.warrantyType)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-subtle">
                      {formatLocalDate(r.endsOn, currency)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        r.daysRemaining <= 7
                          ? "font-medium text-[var(--status-danger-fg)]"
                          : "text-subtle",
                      )}
                    >
                      {r.daysRemaining}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        r.openDefectCount > 0
                          ? "font-medium text-[var(--status-warning-fg)]"
                          : "text-faint",
                      )}
                    >
                      {r.openDefectCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ContractImport />
    </div>
  );
}

/* ------------------------------------------------------------------
   CSV importer — preview then confirm, mirroring /admin/import.
   ------------------------------------------------------------------ */

function ContractImport() {
  const [kind, setKind] = useState<ImportKind>("capital_jobs");
  const [text, setText] = useState("");
  const [footprint, setFootprint] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    inserted: number;
    skipped: number;
  } | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  async function handlePreview() {
    if (!text.trim()) {
      setError("Paste or upload a CSV first.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await previewLiabilityImport({
      text,
      kind,
      sharedFootprint: footprint,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.replace(/_/g, " "));
      return;
    }
    setPreview(result.data);
  }

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const result = await confirmLiabilityImport({
      text,
      kind,
      sharedFootprint: footprint,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.replace(/_/g, " "));
      return;
    }
    setDone(result.data);
    setPreview(null);
    setText("");
    setFootprint("");
  }

  return (
    <section>
      <h2 className="mb-1 text-base font-semibold tracking-tight text-foreground">
        Import contract data
      </h2>
      <p className="mb-4 max-w-2xl text-[13px] text-subtle">
        A paving schedule is usually one spreadsheet a year. Upload it here and
        columns are matched by header name. Coordinates are read as{" "}
        <strong className="font-medium text-foreground">EPSG:4326</strong>{" "}
        (WGS-84 lon/lat) — nothing is reprojected, so a State Plane export must
        be converted before upload.
      </p>

      {error && (
        <p className="mb-3 rounded-[var(--radius-sm)] border border-hairline bg-overlay px-3 py-2 text-sm text-[var(--status-danger-fg)]">
          {error}
        </p>
      )}
      {done && (
        <p className="mb-3 rounded-[var(--radius-sm)] border border-hairline bg-overlay px-3 py-2 text-sm text-[var(--status-success-fg)]">
          Imported {done.inserted} row{done.inserted === 1 ? "" : "s"}
          {done.skipped > 0
            ? ` · ${done.skipped} skipped (no usable footprint or date)`
            : ""}
          .
        </p>
      )}

      <div className="space-y-4 rounded-[var(--radius-md)] border border-hairline bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          {(["capital_jobs", "utility_permits"] as ImportKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setPreview(null);
              }}
              className={cn(
                "rounded-[var(--radius-sm)] border px-2.5 py-1 text-[12px] transition-colors",
                kind === k
                  ? "border-hairline-strong bg-[var(--accent)] text-[var(--accent-contrast)]"
                  : "border-hairline bg-overlay text-subtle hover:text-foreground",
              )}
            >
              {k === "capital_jobs" ? "Capital jobs" : "Utility permits"}
            </button>
          ))}
        </div>

        <div>
          <label
            htmlFor="liability-csv-file"
            className="mb-1 block text-[12px] font-medium text-subtle"
          >
            Upload CSV
          </label>
          <input
            id="liability-csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="block w-full text-[12px] text-subtle file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-hairline file:bg-overlay file:px-3 file:py-1.5 file:text-[12px] file:text-foreground"
          />
        </div>

        <div>
          <label
            htmlFor="liability-csv-text"
            className="mb-1 block text-[12px] font-medium text-subtle"
          >
            …or paste CSV
          </label>
          <textarea
            id="liability-csv-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
            }}
            rows={6}
            spellCheck={false}
            placeholder={
              kind === "capital_jobs"
                ? 'contract_ref,job_type,completed_at,warranty_ends_on,footprint\n2024-17,resurfacing,2024-06-14,2029-06-14,"LINESTRING(-84.14 34.20, -84.13 34.21)"'
                : "permittee_name,permit_ref,restored_on,liability_ends_on,trench\nTelecom Y,P-8821,2025-03-02,2030-03-02,34.207 -84.141; 34.209 -84.139"
            }
            className="w-full rounded-[var(--radius-sm)] border border-hairline bg-[var(--background)] px-3 py-2 font-mono text-[12px] text-foreground placeholder:text-faint"
          />
        </div>

        <div>
          <label
            htmlFor="liability-footprint"
            className="mb-1 block text-[12px] font-medium text-subtle"
          >
            Shared footprint (used for rows without their own geometry column)
          </label>
          <textarea
            id="liability-footprint"
            value={footprint}
            onChange={(e) => {
              setFootprint(e.target.value);
              setPreview(null);
            }}
            rows={3}
            spellCheck={false}
            placeholder="LINESTRING(-84.1408 34.2073, -84.1391 34.2090)   —or—   34.2073, -84.1408; 34.2090, -84.1391"
            className="w-full rounded-[var(--radius-sm)] border border-hairline bg-[var(--background)] px-3 py-2 font-mono text-[12px] text-foreground placeholder:text-faint"
          />
          <p className="mt-1 text-[11px] text-faint">
            WKT is taken as-is. Loose pairs are read as{" "}
            <strong className="font-medium">lat, lng</strong> (map order) and
            written as a LINESTRING in lon-lat order; a single pair becomes a
            POINT.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            isPending={busy}
            onClick={handlePreview}
          >
            Preview
          </Button>
          {preview && (
            <Button type="button" isPending={busy} onClick={handleConfirm}>
              Import {preview.total} row{preview.total === 1 ? "" : "s"}
            </Button>
          )}
        </div>

        {preview && (
          <div className="space-y-3 border-t border-hairline pt-4">
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-faint">
                Column mapping
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                {Object.entries(preview.mapping).map(([field, header]) => (
                  <li key={field} className="text-subtle">
                    {field.replace(/_/g, " ")} →{" "}
                    <span
                      className={
                        header ? "text-foreground" : "italic text-faint"
                      }
                    >
                      {header ?? "unmapped"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-faint">
                First {preview.rows.length} of {preview.total}
                {preview.skipped > 0 ? ` · ${preview.skipped} skipped` : ""}
              </p>
              <ul className="space-y-1">
                {preview.rows.map((r) => (
                  <li
                    key={`${r.label}-${r.footprint}`}
                    className="rounded-[var(--radius-sm)] border border-hairline bg-overlay px-3 py-1.5 text-[12px]"
                  >
                    <span className="font-medium text-foreground">
                      {r.label}
                    </span>{" "}
                    <span className="text-subtle">{r.detail}</span>
                    <span className="block truncate font-mono text-[11px] text-faint">
                      {r.footprint}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
