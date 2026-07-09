import { createServerClient } from "@/lib/db/client";
import { ComplianceReportView } from "@/components/admin/compliance-report";
import { PrintButton } from "@/components/admin/print-button";
import { buildComplianceReport } from "@/lib/compliance/report";
import { RAW_PHOTO_TTL_DAYS } from "@/lib/privacy/retention";

export const dynamic = "force-dynamic";

export const metadata = { title: "Compliance report | Civic Admin" };

export default async function CompliancePage() {
  const db = createServerClient();

  // ── blur coverage ────────────────────────────────────────────────────────
  // Count reports total vs reports with blur_version set (migration 040).
  // Best-effort: null on error.
  let blurCoveragePercent: number | null = null;
  try {
    const [{ count: total }, { count: withBlur }] = await Promise.all([
      db.from("reports").select("*", { count: "exact", head: true }),
      db
        .from("reports")
        .select("*", { count: "exact", head: true })
        .not("blur_version", "is", null),
    ]);
    if (total && total > 0) {
      blurCoveragePercent = Math.round(((withBlur ?? 0) / total) * 1000) / 10;
    }
  } catch {
    // Non-fatal — report renders with null
  }

  // ── RLS table count ──────────────────────────────────────────────────────
  // Query pg_tables joined to pg_class to count tables with RLS enabled.
  // Requires service role or a privileged function; falls back to null.
  let rlsEnabledTablesCount: number | null = null;
  try {
    const { data } = await db.rpc("count_rls_enabled_tables");
    if (typeof data === "number") rlsEnabledTablesCount = data;
  } catch {
    // RPC may not exist yet — non-fatal
  }

  // ── retention settings ───────────────────────────────────────────────────
  // Use the hardcoded constant as base; override with DB row if it exists.
  let rawPhotoTtlDays = RAW_PHOTO_TTL_DAYS;
  let freetextTtlDays = 365;
  try {
    const { data: cities } = await db
      .from("cities")
      .select("id")
      .eq("active", true)
      .limit(1)
      .single<{ id: string }>();
    if (cities?.id) {
      const { data: rs } = await db
        .from("retention_settings")
        .select("raw_photo_ttl_days, freetext_ttl_days")
        .eq("city_id", cities.id)
        .maybeSingle<{
          raw_photo_ttl_days: number;
          freetext_ttl_days: number;
        }>();
      if (rs) {
        rawPhotoTtlDays = rs.raw_photo_ttl_days;
        freetextTtlDays = rs.freetext_ttl_days;
      }
    }
  } catch {
    // Non-fatal
  }

  const report = buildComplianceReport({
    blurCoveragePercent,
    rawPhotoTtlDays,
    freetextTtlDays,
    rlsEnabledTablesCount,
    open311ConformanceEnabled: true, // always active per hard rules
    piiRedactionEnabled: true, // wired at intake in report/actions.ts
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 print:px-0 print:py-4">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Compliance report
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Point-in-time snapshot of privacy, security, and data-retention
            posture for audit and records requests.
          </p>
        </div>
        <PrintButton />
      </div>

      {/* Print header — hidden on screen */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold text-black">
          Civic — Compliance report
        </h1>
      </div>

      <div className="mt-8 print:mt-4">
        <ComplianceReportView report={report} />
      </div>
    </div>
  );
}
