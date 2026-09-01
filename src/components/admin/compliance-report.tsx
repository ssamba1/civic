/**
 * Presentational compliance report component.
 * Pure display, no data fetching.  Import ComplianceReport from lib/compliance/report.ts.
 */
import type { ComplianceReport } from "@/lib/compliance/report";

interface Props {
  report: ComplianceReport;
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300 print:border print:border-green-500 print:text-green-700">
      ● {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300 print:border print:border-red-500 print:text-red-700">
      ✕ {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 py-3 first:border-0 dark:border-zinc-800 print:border-zinc-300">
      <span className="text-sm text-zinc-600 dark:text-zinc-400 print:text-zinc-700">
        {label}
      </span>
      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 print:text-black">
        {value}
      </span>
    </div>
  );
}

export function ComplianceReportView({ report }: Props) {
  const generated = new Date(report.generatedAt).toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <div className="space-y-8 print:space-y-6">
      <p className="text-sm text-zinc-500 dark:text-zinc-400 print:text-zinc-600">
        Generated {generated}
      </p>

      {/* Privacy */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100 print:text-black">
          Privacy
        </h2>
        <div className="rounded-lg border border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900 print:border-zinc-300">
          <Row
            label="Photo blur coverage"
            value={
              report.privacy.blurCoveragePercent !== null
                ? `${report.privacy.blurCoveragePercent.toFixed(1)}%`
                : "-"
            }
          />
          <Row
            label="Raw photo TTL"
            value={`${report.privacy.rawPhotoTtlDays} days`}
          />
          <Row
            label="PII redaction at intake"
            value={
              <StatusBadge
                ok={report.privacy.piiRedactionEnabled}
                label={
                  report.privacy.piiRedactionEnabled ? "Enabled" : "Disabled"
                }
              />
            }
          />
        </div>
      </section>

      {/* Security */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100 print:text-black">
          Security
        </h2>
        <div className="rounded-lg border border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900 print:border-zinc-300">
          <Row
            label="Tables with RLS enabled"
            value={
              report.security.rlsEnabledTablesCount !== null
                ? report.security.rlsEnabledTablesCount
                : "-"
            }
          />
        </div>
      </section>

      {/* Open311 */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100 print:text-black">
          Open311
        </h2>
        <div className="rounded-lg border border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900 print:border-zinc-300">
          <Row
            label="GeoReport v2 conformance"
            value={
              <StatusBadge
                ok={report.open311.conformanceEnabled}
                label={
                  report.open311.conformanceEnabled ? "Active" : "Inactive"
                }
              />
            }
          />
        </div>
      </section>

      {/* Data retention */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100 print:text-black">
          Data retention
        </h2>
        <div className="rounded-lg border border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900 print:border-zinc-300">
          <Row
            label="Raw photo TTL"
            value={`${report.dataRetention.rawPhotoTtlDays} days`}
          />
          <Row
            label="Free-text description TTL"
            value={`${report.dataRetention.freetextTtlDays} days`}
          />
        </div>
      </section>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-600 print:text-zinc-500">
        This report is generated from live system state. It does not constitute
        a legal certification. Retain a printed copy for audit records.
      </p>
    </div>
  );
}
