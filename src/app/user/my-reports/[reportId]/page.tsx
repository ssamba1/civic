import { ArrowLeft, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ReportPhoto,
  ReportTimeline,
} from "@/components/resident/report-timeline";
import { CATEGORY_META, KNOWN_CITIES } from "@/lib/dashboard-data";
import {
  getCurrentResident,
  getMyReport,
  getReportTimeline,
} from "@/lib/resident-data";
import type { ReportStatus } from "@/lib/types";

// Anon-first: the resident's reports are session-scoped, so this can't be
// statically prerendered. Resolve per-request.
export const dynamic = "force-dynamic";

// Resident-facing status copy — mirrors recent-reports/report-detail tones but
// reads "Resolved" rather than the internal "closed".
const STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Open",
  dispatched: "Dispatched",
  in_progress: "In progress",
  closed: "Resolved",
  merged: "Merged",
  rejected: "Closed",
};

const STATUS_TONE: Record<ReportStatus, string> = {
  open: "text-[#ff9f0a] bg-[#ff9f0a]/10",
  dispatched: "text-[#0a84ff] bg-[#0a84ff]/10",
  in_progress: "text-[#5ac8fa] bg-[#5ac8fa]/10",
  closed: "text-[#30d158] bg-[#30d158]/10",
  merged: "text-zinc-400 bg-white/[0.06]",
  rejected: "text-[#ff453a] bg-[#ff453a]/10",
};

interface PageProps {
  params: Promise<{ reportId: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { reportId } = await params;
  const { citySlug } = await getCurrentResident();
  const report = await getMyReport(citySlug, reportId);
  const name = KNOWN_CITIES[citySlug]?.name ?? KNOWN_CITIES.cumming.name;
  if (!report) return { title: `Report not found | Civic` };
  return {
    title: `Civic | ${CATEGORY_META[report.category].label} report — ${name}`,
    description: `Status and timeline for your ${CATEGORY_META[
      report.category
    ].label.toLowerCase()} report.`,
  };
}

export default async function ReportDetailPage({ params }: PageProps) {
  const { reportId } = await params;
  const { citySlug } = await getCurrentResident();

  const report = await getMyReport(citySlug, reportId);
  if (!report) notFound();

  const steps = await getReportTimeline(citySlug, reportId);
  const meta = CATEGORY_META[report.category];
  const { lat, lng } = report.location;
  const isResolved = report.status === "closed";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-24 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] sm:px-6 md:pb-10">
      <Link
        href="/user/my-reports"
        className="mb-5 inline-flex h-9 items-center gap-1.5 rounded-full px-2 -ml-2 text-[13px] font-medium text-zinc-400 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        All reports
      </Link>

      {/* Hero — category + status + location */}
      <section className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="flex min-w-0 items-center gap-2.5 text-[28px] sm:text-[34px] font-semibold tracking-tight text-white leading-[1.1]">
            <span
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: meta.color }}
              aria-hidden="true"
            />
            <span className="truncate">{meta.label}</span>
          </h1>
          <span
            className={`mt-1 flex-shrink-0 rounded-md px-2 py-0.5 text-[12px] font-medium ${STATUS_TONE[report.status]}`}
          >
            {STATUS_LABEL[report.status]}
          </span>
        </div>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-2.5 inline-flex items-center gap-1.5 text-[13px] text-zinc-400 transition-colors hover:text-white"
          title="Open in Google Maps"
        >
          <MapPin
            className="h-3.5 w-3.5 flex-shrink-0"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="truncate underline-offset-2 group-hover:underline">
            {report.address}
          </span>
        </a>
      </section>

      {/* Photo(s) — show before/after when a resolution photo exists, else the
          single report photo. The resolution photo is the operational-
          transparency payoff: residents see the work that was done. */}
      <div className="mb-7 overflow-hidden rounded-xl border border-white/[0.06] bg-[#1c1c1e]">
        {isResolved && report.afterPhoto ? (
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <figure className="relative border-b border-white/[0.06] sm:border-b-0 sm:border-r">
              <ReportPhoto
                src={report.photo_public_url}
                alt={`${meta.label} — reported`}
              />
              <figcaption className="absolute left-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                Reported
              </figcaption>
            </figure>
            <figure className="relative">
              <ReportPhoto
                src={report.afterPhoto}
                alt={`${meta.label} — after the fix`}
              />
              <figcaption className="absolute left-2 top-2 rounded-md bg-[#30d158]/85 px-2 py-0.5 text-[11px] font-medium text-black backdrop-blur-sm">
                Fixed
              </figcaption>
            </figure>
          </div>
        ) : (
          <ReportPhoto
            src={report.photo_public_url}
            alt={`${meta.label} report at ${report.address}`}
          />
        )}
      </div>

      {/* Timeline */}
      <section className="rounded-[14px] border border-white/[0.06] bg-[#1c1c1e] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
        <h2 className="mb-5 text-[15px] font-semibold tracking-tight text-white">
          Progress
        </h2>
        <ReportTimeline steps={steps} />
      </section>
    </div>
  );
}
