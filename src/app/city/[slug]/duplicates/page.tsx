/**
 * Staff-only duplicates hub for a city.
 *
 * Lists open reports that have at least one near-geo candidate duplicate,
 * linking each to an inline merge panel.
 *
 * Access gate: same pattern as /city/[slug]/grid — staff only, with redirect
 * to login for non-staff; demo city is always readable.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { findDuplicateCandidates } from "@/app/staff/merge-actions";
import DuplicateMergePanel from "@/components/staff/duplicate-merge-panel";
import { fetchCity as fetchCityMock } from "@/lib/dashboard-data";
import { fetchCity as fetchCityFromDb } from "@/lib/dashboard-queries";
import { createServerClient } from "@/lib/db/client";
import { DEMO_CITY } from "@/lib/demo-auth";
import type { ScoredCandidate } from "@/lib/staff/merge";
import { isStaffForCity } from "@/lib/staff-access";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  let city = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) city = await fetchCityMock(slug);
  if (!city) return { title: "City not found | Civic" };
  return {
    title: `Civic | ${city.name} — Duplicate Reports`,
    description: `Staff tool for reviewing and merging duplicate infrastructure reports in ${city.name}, ${city.state}.`,
  };
}

async function requireStaffFor(slug: string): Promise<void> {
  if (await isStaffForCity(slug)) return;
  redirect(`/login?redirect=/city/${slug}/duplicates`);
}

// ─── Candidate fetching ───────────────────────────────────────────────────────

interface ReportWithCandidates {
  id: string;
  address: string | null;
  category: string | null;
  created_at: string;
  candidates: ScoredCandidate[];
}

/**
 * Fetch open reports for the city, then call findDuplicateCandidates for each.
 * Filters to only those with at least one candidate (score >= 0 at any distance).
 * Cap at 50 reports to keep page load bounded.
 */
async function fetchReportsWithDuplicates(
  cityId: string,
): Promise<ReportWithCandidates[]> {
  const db = createServerClient();

  const { data: reports, error } = await db
    .from("reports")
    .select("id, address, created_at, category:classifications(category)")
    .eq("city_id", cityId)
    .eq("status", "open")
    .is("merged_into", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !reports) return [];

  // Fan out — in parallel, fetch candidates for each report.
  const results = await Promise.allSettled(
    reports.map(async (r) => {
      const catRaw = r.category;
      const category = Array.isArray(catRaw)
        ? ((catRaw[0] as { category?: string } | undefined)?.category ?? null)
        : ((catRaw as { category?: string } | null)?.category ?? null);

      const result = await findDuplicateCandidates(r.id);
      const candidates = result.ok ? result.data : [];

      return {
        id: r.id,
        address: r.address,
        category,
        created_at: r.created_at,
        candidates,
      } satisfies ReportWithCandidates;
    }),
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<ReportWithCandidates> =>
        r.status === "fulfilled" && r.value.candidates.length > 0,
    )
    .map((r) => r.value)
    .sort((a, b) => b.candidates[0].score - a.candidates[0].score);
}

// ─── Report row component ─────────────────────────────────────────────────────

function ReportRow({ report }: { report: ReportWithCandidates }) {
  const topScore = Math.round(report.candidates[0].score * 100);
  const scoreColor =
    topScore >= 80
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      : topScore >= 60
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      {/* Report header */}
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {report.category && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                {report.category.replace(/_/g, " ")}
              </span>
            )}
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${scoreColor}`}
            >
              Top match {topScore}%
            </span>
            <span className="text-xs text-muted-foreground">
              {report.candidates.length} candidate
              {report.candidates.length !== 1 ? "s" : ""}
            </span>
          </div>
          {report.address && (
            <p className="mt-1 truncate text-sm font-medium">
              {report.address}
            </p>
          )}
          <p className="font-mono text-xs text-muted-foreground">{report.id}</p>
        </div>
        <Link
          href={`/report/${report.id}`}
          className="shrink-0 text-xs text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
        >
          View report
        </Link>
      </div>

      {/* Merge panel */}
      <div className="px-5 py-4">
        <DuplicateMergePanel
          reportId={report.id}
          initialCandidates={report.candidates}
        />
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DuplicatesPage({ params }: PageProps) {
  const { slug } = await params;

  // Resolve city.
  let city = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) city = await fetchCityMock(slug);
  if (!city) notFound();

  // Gate to staff.
  if (slug !== DEMO_CITY) await requireStaffFor(slug);

  // Fetch open reports with duplicate candidates.
  const reports = await fetchReportsWithDuplicates(city.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Duplicate reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open reports in {city.name} that have potential duplicates nearby.
          Merge the weaker report into the canonical one to reduce noise.
        </p>
      </div>

      {/* Empty state */}
      {reports.length === 0 && (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <p className="text-base font-medium">No duplicates detected</p>
          <p className="mt-2 text-sm text-muted-foreground">
            All open reports appear to be unique. Check back after new
            submissions arrive.
          </p>
        </div>
      )}

      {/* Report list */}
      <Suspense fallback={null}>
        <ul className="space-y-6">
          {reports.map((r) => (
            <li key={r.id}>
              <ReportRow report={r} />
            </li>
          ))}
        </ul>
      </Suspense>
    </div>
  );
}
