import { ArrowLeft, FileText, HardHat, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { daysUntil } from "@/components/liability/liability-badge";
import { createServerClient } from "@/lib/db/client";
import { getContractorDetail } from "@/lib/db/contractors";
import { getStaffAccessForCity } from "@/lib/staff-access";
import { type StatusTone, toneChipClass } from "@/lib/status";
import { cn } from "@/lib/utils/cn";
import { timeAgo } from "@/lib/utils/time-ago";
import { AttributedReportsCard } from "../attributed-reports-card";

// Staff-gated per-request surface (cookies) — never prerender or cache.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string; contractorId: string }>;
}

export const metadata: Metadata = {
  title: "Civic | Contractor",
  // Vendor emails are PII behind an auth gate; keep this out of search indexes.
  robots: { index: false, follow: false },
};

function formatDate(isoDate: string): string {
  const t = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return isoDate;
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function titleize(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Same tile as the member detail page — the two profile surfaces must read
// as one system.
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
      <p className="text-[13px] text-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function WarrantyChip({ live }: { live: boolean }) {
  const tone: StatusTone = live ? "success" : "neutral";
  return (
    <span
      className={cn(
        "rounded-[var(--radius-md)] px-2 py-0.5 text-[11px] font-medium",
        toneChipClass(tone),
      )}
    >
      {live ? "Live" : "Lapsed"}
    </span>
  );
}

export default async function ContractorDetailPage({ params }: PageProps) {
  const { slug, contractorId } = await params;
  const access = await getStaffAccessForCity(slug);
  if (access !== "real" && access !== "demo") notFound();

  const db = createServerClient();
  const { data: city } = await db
    .from("cities")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle<{ id: string; name: string }>();
  if (!city) notFound();

  const detail = await getContractorDetail(city.id, contractorId, {
    maskPii: access === "demo",
  });
  if (!detail.ok) notFound();
  const contractor = detail.data;

  const today = new Date().toISOString().slice(0, 10);
  const isLive = (w: { startsOn: string; endsOn: string }) =>
    w.startsOn <= today && w.endsOn >= today;
  const liveWarranties = contractor.jobs.flatMap((j) =>
    j.warranties.filter(isLive),
  );

  return (
    <div className="flex flex-col min-h-dvh bg-background">
      <div className="flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        <div className="flex flex-col gap-4">
          {/* Profile header — same card as the member detail page. */}
          <section className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <Link
              href={`/city/${slug}/contractors`}
              className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-faint transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
              Contractors
            </Link>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
                    {contractor.name}
                  </h1>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-[var(--radius-md)] border px-2 py-0.5 text-[11px] font-medium",
                      contractor.active
                        ? "border-hairline-strong bg-overlay-strong text-foreground"
                        : "border-hairline bg-overlay text-faint",
                    )}
                  >
                    {contractor.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-subtle">
                  <span className="inline-flex items-center gap-1.5">
                    <HardHat
                      className="h-3.5 w-3.5 text-faint"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    Contract vendor
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Mail
                      className="h-3.5 w-3.5 shrink-0 text-faint"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    <span className="truncate">{contractor.email ?? "—"}</span>
                  </span>
                </div>
                {access === "demo" && (
                  <p className="mt-2.5 text-[12px] text-faint">
                    Demo session — contact details are masked.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-x-6 gap-y-1 text-[12px] sm:flex-col sm:gap-y-1.5 sm:text-right">
                <div>
                  <span className="text-faint">Vendor since </span>
                  <span className="text-subtle">
                    {formatDate(contractor.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Stat tiles. */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="Capital jobs"
              value={String(contractor.jobs.length)}
            />
            <StatTile
              label="Live warranties"
              value={String(liveWarranties.length)}
            />
            <StatTile
              label="Documents"
              value={String(contractor.documents.length)}
            />
            <StatTile
              label="Attributed reports"
              value={String(contractor.liableReports.length)}
            />
          </div>

          {/* Jobs + documents (left, stacked) · attributed reports (right). */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <section className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
                <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-5">
                  <h2 className="text-[13px] font-semibold text-foreground">
                    Capital jobs &amp; warranties
                  </h2>
                  <span className="text-[12px] tabular-nums text-faint">
                    {contractor.jobs.length}
                  </span>
                </header>
                {contractor.jobs.length === 0 ? (
                  <div className="px-4 py-16 text-center">
                    <p className="text-sm font-medium text-foreground">
                      No capital jobs
                    </p>
                    <p className="mt-1 text-[13px] text-faint">
                      Import a paving schedule to put this vendor's work on
                      file.
                    </p>
                  </div>
                ) : (
                  <ul>
                    {contractor.jobs.map((job) => (
                      <li
                        key={job.id}
                        className="border-b border-hairline px-4 py-3 last:border-b-0 sm:px-5"
                      >
                        <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-medium text-foreground">
                          {job.contractRef && (
                            <span className="font-mono">
                              #{job.contractRef}
                            </span>
                          )}
                          <span>{titleize(job.jobType)}</span>
                          <span className="font-normal text-faint">
                            completed {formatDate(job.completedAt)}
                          </span>
                          {job.contractValueCents != null && (
                            <span className="font-normal tabular-nums text-subtle">
                              $
                              {Math.round(
                                job.contractValueCents / 100,
                              ).toLocaleString()}
                            </span>
                          )}
                        </p>
                        {job.description && (
                          <p className="mt-1 max-w-[90ch] text-[13px] leading-relaxed text-subtle">
                            {job.description}
                          </p>
                        )}
                        {job.warranties.length > 0 && (
                          <ul className="mt-2 space-y-1.5">
                            {job.warranties.map((w) => {
                              const live = isLive(w);
                              const days = daysUntil(w.endsOn);
                              return (
                                <li
                                  key={w.id}
                                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-subtle"
                                >
                                  <WarrantyChip live={live} />
                                  <span>{titleize(w.warrantyType)}</span>
                                  <span className="tabular-nums text-faint">
                                    {formatDate(w.startsOn)} →{" "}
                                    {formatDate(w.endsOn)}
                                    {live && days != null && ` (${days}d left)`}
                                  </span>
                                  {w.coversCategories && (
                                    <span className="text-faint">
                                      covers{" "}
                                      {w.coversCategories
                                        .map(titleize)
                                        .join(", ")}
                                    </span>
                                  )}
                                  {w.bondRef && (
                                    <span className="font-mono text-faint">
                                      bond {w.bondRef}
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
                <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-5">
                  <h2 className="text-[13px] font-semibold text-foreground">
                    Documents
                  </h2>
                  <Link
                    href={`/city/${slug}/documents`}
                    className="text-[12px] text-faint transition-colors hover:text-foreground"
                  >
                    Documents workspace →
                  </Link>
                </header>
                {contractor.documents.length === 0 ? (
                  <div className="px-4 py-16 text-center">
                    <p className="text-sm font-medium text-foreground">
                      No documents filed
                    </p>
                    <p className="mt-1 text-[13px] text-faint">
                      Upload one in the Documents workspace and pick this
                      contractor in the dropdown.
                    </p>
                  </div>
                ) : (
                  <ul>
                    {contractor.documents.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-start gap-3 border-b border-hairline px-4 py-3 last:border-b-0 sm:px-5"
                      >
                        <FileText
                          className="mt-0.5 h-4 w-4 flex-shrink-0 text-faint"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {doc.title}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-subtle">
                            <span className="font-mono text-[11px] uppercase tracking-wider text-faint">
                              {doc.docKind}
                            </span>
                            <span className="tabular-nums">
                              {doc.chunkCount} chunks
                            </span>
                            <span className="text-faint">
                              {timeAgo(doc.createdAt)}
                            </span>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <AttributedReportsCard
              slug={slug}
              reports={contractor.liableReports}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
