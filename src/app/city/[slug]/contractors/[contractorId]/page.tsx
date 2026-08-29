import { ArrowLeft, FileText, HardHat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { daysUntil } from "@/components/liability/liability-badge";
import { createServerClient } from "@/lib/db/client";
import { getContractorDetail } from "@/lib/db/contractors";
import { getStaffAccessForCity } from "@/lib/staff-access";
import { timeAgo } from "@/lib/utils/time-ago";

// Staff-gated per-request surface (cookies) — never prerender or cache.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string; contractorId: string }>;
}

export const metadata: Metadata = {
  title: "Civic | Contractor",
};

const EYEBROW =
  "font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-faint";

const VERDICT_LABEL: Record<string, string> = {
  contractor_warranty: "Under warranty",
  utility_restoration: "Utility restoration",
  city_cost: "City cost",
  unknown: "Unknown",
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
  const liveWarranties = contractor.jobs.flatMap((j) =>
    j.warranties.filter((w) => w.startsOn <= today && w.endsOn >= today),
  );

  return (
    <div className="flex flex-col min-h-dvh bg-background">
      <div className="flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        {/* Header */}
        <section className="mb-5">
          <Link
            href={`/city/${slug}/contractors`}
            className="mb-2 inline-flex items-center gap-1.5 text-[13px] text-faint transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            Contractors
          </Link>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground leading-tight">
              <HardHat
                className="h-4.5 w-4.5 text-faint"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {contractor.name}
            </h1>
            <span
              className={`inline-flex items-center rounded-full border px-1.5 py-px font-mono text-[10px] uppercase tracking-wider ${
                contractor.active
                  ? "border-hairline-strong text-subtle"
                  : "border-hairline text-faint"
              }`}
            >
              {contractor.active ? "Active" : "Inactive"}
            </span>
            {contractor.email && (
              <span className="text-[13px] text-subtle">
                {contractor.email}
              </span>
            )}
            <span className="text-[13px] text-faint">
              Vendor since {formatDate(contractor.createdAt)}
            </span>
          </div>
        </section>

        {/* Stat strip */}
        <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Capital jobs", value: contractor.jobs.length },
            { label: "Live warranties", value: liveWarranties.length },
            { label: "Documents", value: contractor.documents.length },
            {
              label: "Attributed reports",
              value: contractor.liableReports.length,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-4 py-3"
            >
              <p className={EYEBROW}>{stat.label}</p>
              <p className="mt-1 text-[20px] font-semibold tabular-nums tracking-tight text-foreground">
                {stat.value}
              </p>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {/* Capital jobs + warranties */}
          <section className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface">
            <div className="border-b border-hairline px-4 py-3">
              <h2 className={EYEBROW}>Capital jobs &amp; warranties</h2>
            </div>
            {contractor.jobs.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-subtle">
                No capital jobs on file for this vendor.
              </p>
            ) : (
              <ul>
                {contractor.jobs.map((job, idx) => (
                  <li
                    key={job.id}
                    className={`px-4 py-3 ${idx > 0 ? "border-t border-hairline" : ""}`}
                  >
                    <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-medium text-foreground">
                      {job.contractRef && (
                        <span className="font-mono">#{job.contractRef}</span>
                      )}
                      <span>{titleize(job.jobType)}</span>
                      <span className="text-faint">
                        completed {formatDate(job.completedAt)}
                      </span>
                      {job.contractValueCents != null && (
                        <span className="tabular-nums text-subtle">
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
                      <ul className="mt-2 space-y-1">
                        {job.warranties.map((w) => {
                          const days = daysUntil(w.endsOn);
                          const live = w.startsOn <= today && w.endsOn >= today;
                          return (
                            <li
                              key={w.id}
                              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-subtle"
                            >
                              <span
                                className={`inline-flex items-center rounded-full border px-1.5 py-px font-mono text-[10px] uppercase tracking-wider ${
                                  live
                                    ? "border-hairline-strong text-subtle"
                                    : "border-hairline text-faint"
                                }`}
                              >
                                {live ? "Live" : "Lapsed"}
                              </span>
                              <span>{titleize(w.warrantyType)}</span>
                              <span className="tabular-nums text-faint">
                                {formatDate(w.startsOn)} →{" "}
                                {formatDate(w.endsOn)}
                                {live && days != null && ` (${days}d left)`}
                              </span>
                              {w.coversCategories && (
                                <span className="text-faint">
                                  covers{" "}
                                  {w.coversCategories.map(titleize).join(", ")}
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

          <div className="space-y-4">
            {/* Documents */}
            <section className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface">
              <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
                <h2 className={EYEBROW}>Documents</h2>
                <Link
                  href={`/city/${slug}/documents`}
                  className="text-[12px] text-faint transition-colors hover:text-foreground"
                >
                  Documents workspace →
                </Link>
              </div>
              {contractor.documents.length === 0 ? (
                <p className="px-4 py-6 text-[13px] text-subtle">
                  No documents filed under this vendor yet. Upload one in the
                  Documents workspace and pick the contractor in the dropdown.
                </p>
              ) : (
                <ul>
                  {contractor.documents.map((doc, idx) => (
                    <li
                      key={doc.id}
                      className={`flex items-start gap-3 px-4 py-3 ${
                        idx > 0 ? "border-t border-hairline" : ""
                      }`}
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
                          <span className={EYEBROW}>{doc.docKind}</span>
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

            {/* Attributed reports */}
            <section className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface">
              <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
                <h2 className={EYEBROW}>Attributed reports</h2>
                <Link
                  href={`/city/${slug}/grid`}
                  className="text-[12px] text-faint transition-colors hover:text-foreground"
                >
                  Open grid →
                </Link>
              </div>
              {contractor.liableReports.length === 0 ? (
                <p className="px-4 py-6 text-[13px] text-subtle">
                  No reports currently attributed to this vendor.
                </p>
              ) : (
                <ul>
                  {contractor.liableReports.map((r, idx) => (
                    <li
                      key={r.reportId}
                      className={`px-4 py-3 ${idx > 0 ? "border-t border-hairline" : ""}`}
                    >
                      <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-foreground">
                        <span className="font-medium">
                          {r.category ? titleize(r.category) : "Report"}
                        </span>
                        <span className="text-subtle">
                          {r.address ?? "No address on file"}
                        </span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-subtle">
                        <span className={EYEBROW}>
                          {VERDICT_LABEL[r.verdict] ?? titleize(r.verdict)}
                        </span>
                        {r.windowEndsOn && (
                          <span className="tabular-nums">
                            window ends {formatDate(r.windowEndsOn)}
                          </span>
                        )}
                        <span className="tabular-nums text-faint">
                          {Math.round(r.confidence * 100)}% confidence
                        </span>
                        <span className="text-faint">{titleize(r.status)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>

      <footer className="border-t border-hairline mt-10 pb-safe">
        <div className="mx-auto flex max-w-[1800px] flex-col items-center justify-between gap-3 px-3 py-6 text-[13px] text-faint sm:flex-row sm:px-4 lg:px-6">
          <span>Civic</span>
          <span>&copy; {new Date().getFullYear()} · Open311 compatible</span>
        </div>
      </footer>
    </div>
  );
}
