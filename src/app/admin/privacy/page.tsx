import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { auditAllCities } from "@/lib/privacy/audit";
import { ExportButton } from "./export-button";

// Live bucket audit — always fresh, never cached.
export const dynamic = "force-dynamic";

export const metadata = { title: "Privacy audit | Civic" };

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AdminPrivacyPage() {
  const report = await auditAllCities(new Date().toISOString());

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Privacy audit
          </h1>
          <p className="mt-1 text-sm text-subtle">
            Verifies no raw (unblurred) photos leaked into the public bucket.
            Exportable for records requests and legal review.
          </p>
        </div>
        <ExportButton report={report} />
      </div>

      {/* Overall posture */}
      <div
        className={`mt-6 flex items-center gap-3 rounded-[var(--radius-lg)] border p-5 ${
          report.ok
            ? "border-[var(--color-success)]/25 bg-[var(--color-success)]/[0.06]"
            : "border-[var(--color-danger)]/25 bg-[var(--color-danger)]/[0.06]"
        }`}
      >
        {report.ok ? (
          <ShieldCheck className="h-8 w-8 text-[var(--color-success)]" />
        ) : (
          <ShieldAlert className="h-8 w-8 text-[var(--color-danger)]" />
        )}
        <div>
          <p className="text-[15px] font-semibold text-foreground">
            {report.ok
              ? "No raw-photo leaks detected"
              : `${report.totalViolations} potential leak${report.totalViolations === 1 ? "" : "s"} flagged`}
          </p>
          <p className="text-[13px] text-subtle">
            {report.cities.length} cit
            {report.cities.length === 1 ? "y" : "ies"} scanned · generated{" "}
            {fmt(report.generatedAt)}
          </p>
        </div>
      </div>

      {/* Per-city breakdown */}
      <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-overlay text-left text-[12px] uppercase tracking-wide text-faint">
            <tr>
              <th className="px-4 py-2 font-medium">City</th>
              <th className="px-4 py-2 font-medium">Public photos scanned</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {report.cities.map((c) => (
              <tr key={c.cityId} className="border-t border-hairline align-top">
                <td className="px-4 py-3 font-medium text-foreground">
                  {c.cityName}
                </td>
                <td className="px-4 py-3 tabular-nums text-subtle">
                  {c.publicScanned.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {c.ok ? (
                    <Badge variant="success">● Clean</Badge>
                  ) : (
                    <div className="space-y-1">
                      <Badge variant="danger">
                        {c.violations.length} flagged
                      </Badge>
                      <ul className="mt-1 space-y-0.5 text-[12px] text-[var(--color-danger)]">
                        {c.violations.map((v) => (
                          <li key={v}>{v}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {report.cities.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-subtle">
                  No cities to audit.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[12px] text-faint">
        Heuristic: a file in <code>photos-public</code> whose size matches its{" "}
        <code>photos-raw</code> counterpart is flagged as a possible raw-photo
        leak (blurred copies are always smaller). Faces and plates are blurred
        client-side before upload; raw originals live in a restricted, TTL-bound
        bucket.
      </p>
    </div>
  );
}
