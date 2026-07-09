import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock,
  HardHat,
  Link2,
  MapPin,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportCsat } from "@/components/resident/report-csat";
import {
  ReportPhoto,
  ReportTimeline,
} from "@/components/resident/report-timeline";
import PhotoGallery from "@/components/report/photo-gallery";
import { currencyForCitySlug, formatCost } from "@/lib/currency";
import { CATEGORY_META, KNOWN_CITIES } from "@/lib/dashboard-data";
import { listComments } from "@/lib/db/comments";
import { getReportPhotos } from "@/lib/db/report-photos";
import CommentThread from "@/components/report/comment-thread";
import { publicToken } from "@/lib/public-report";
import {
  getCurrentResident,
  getMyReport,
  getReportTimeline,
} from "@/lib/resident-data";
import { STATUS_LABEL, statusChipClass } from "@/lib/status";

// Anon-first: the resident's reports are session-scoped, so this can't be
// statically prerendered. Resolve per-request.
export const dynamic = "force-dynamic";

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
    description: `Status and timeline for this ${CATEGORY_META[
      report.category
    ].label.toLowerCase()} report.`,
  };
}

export default async function ReportDetailPage({ params }: PageProps) {
  const { reportId } = await params;
  const { citySlug } = await getCurrentResident();
  const currency = currencyForCitySlug(citySlug);

  const report = await getMyReport(citySlug, reportId);
  if (!report) notFound();

  // Multi-photo: fetch child report_photos rows. Gracefully returns [] when
  // migration 050 hasn't been applied or the report has no child rows (older
  // single-photo submissions). The primary photo always falls through to the
  // existing single <ReportPhoto> path.
  const extraPhotos = await getReportPhotos(reportId);

  // Comments — gracefully returns [] when migration 055 hasn't been applied.
  const comments = await listComments(reportId);
  // Build the gallery URL array from the child table when >1 photo, or fall
  // back to the primary report column for single-photo backward-compat.
  const galleryUrls =
    extraPhotos.length > 1
      ? extraPhotos.map((p) => p.public_url)
      : null; // null → use existing single-img path

  const steps = await getReportTimeline(citySlug, reportId);
  const meta = CATEGORY_META[report.category];
  const { lat, lng } = report.location;
  const isResolved = report.status === "closed";
  const isUnderFix =
    report.status === "in_progress" &&
    (report.fix_cost_estimate != null ||
      report.fix_time_estimate_days != null ||
      report.fix_note);

  // Close-out details for the resolved card: the "what was done" note and when.
  const resolvedStep = steps.find((s) => s.stage === "resolved" && s.done);
  const resolutionNote = resolvedStep?.note;
  const completedAt = report.completed_at ?? resolvedStep?.at ?? null;
  const completedLabel = completedAt
    ? new Date(completedAt).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pt-24 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] sm:px-4 md:pb-10">
      <Link
        href="/user/my-reports"
        className="mb-5 inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] px-2 -ml-2 text-[13px] font-medium text-subtle outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_60%,transparent)]"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        All reports
      </Link>

      {/* Hero — category + status + location */}
      <section className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="flex min-w-0 items-center gap-2.5 text-[28px] sm:text-[34px] font-semibold tracking-tight text-foreground leading-[1.1]">
            <span
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: meta.color }}
              aria-hidden="true"
            />
            <span className="truncate">{meta.label}</span>
          </h1>
          <span
            className={`mt-1 flex-shrink-0 rounded-md px-2 py-0.5 text-[12px] font-medium ${statusChipClass(report.status)}`}
          >
            {STATUS_LABEL[report.status]}
          </span>
        </div>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-2.5 inline-flex items-center gap-1.5 text-[13px] text-subtle transition-colors hover:text-foreground"
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

      {/* Photo(s) — multi-photo gallery when >1 photo (migration 050 applied +
          photos exist), before/after when resolved, else single primary photo.
          The resolution photo is the operational-transparency payoff: residents
          see the work that was done. */}
      <div className="mb-7 overflow-hidden rounded-xl border border-hairline bg-surface">
        {isResolved && report.afterPhoto ? (
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <figure className="relative border-b border-hairline sm:border-b-0 sm:border-r">
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
              <figcaption className="absolute left-2 top-2 rounded-md bg-[var(--color-success)]/85 px-2 py-0.5 text-[11px] font-medium text-black backdrop-blur-sm">
                Fixed
              </figcaption>
            </figure>
          </div>
        ) : galleryUrls ? (
          // Multi-photo gallery (>1 photo from report_photos child table).
          <div className="p-3">
            <PhotoGallery
              urls={galleryUrls}
              altPrefix={meta.label}
            />
          </div>
        ) : (
          // Single photo — backward-compatible path.
          <ReportPhoto
            src={report.photo_public_url}
            alt={`${meta.label} report at ${report.address}`}
          />
        )}
      </div>

      {/* Under Fix card — shown when staff has marked the report in_progress
          and provided public-facing cost/timeline context. */}
      {isUnderFix && (
        <section className="mb-7 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-primary)_25%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)] p-5">
          <div className="flex items-start gap-3">
            <HardHat
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--color-primary)]"
              strokeWidth={2}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                Work in progress
              </h2>
              <p className="mt-0.5 text-[13px] text-subtle">
                A crew is actively working on this issue.
              </p>
              {(report.fix_cost_estimate != null ||
                report.fix_time_estimate_days != null) && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {report.fix_cost_estimate != null && (
                    <div className="flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--color-primary)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] px-3 py-2">
                      <Banknote
                        className="h-3.5 w-3.5 text-[var(--color-primary)]"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      <span className="text-[13px] font-medium text-foreground">
                        Est. cost:{" "}
                        <span className="font-semibold">
                          {formatCost(report.fix_cost_estimate, currency)}
                        </span>
                      </span>
                    </div>
                  )}
                  {report.fix_time_estimate_days != null && (
                    <div className="flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--color-primary)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] px-3 py-2">
                      <Clock
                        className="h-3.5 w-3.5 text-[var(--color-primary)]"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      <span className="text-[13px] font-medium text-foreground">
                        Est. timeline:{" "}
                        <span className="font-semibold">
                          {report.fix_time_estimate_days}{" "}
                          {report.fix_time_estimate_days === 1 ? "day" : "days"}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              )}
              {report.fix_note && (
                <p className="mt-3 text-[13px] leading-relaxed text-subtle">
                  {report.fix_note}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Resolved card — the close-the-loop payoff. Shows WHAT was done and
          when, then asks the resident to confirm the fix (CSAT). Only when
          closed. */}
      {isResolved && (
        <section className="mb-7 rounded-[var(--radius-lg)] border border-[var(--color-success)]/25 bg-[var(--color-success)]/[0.06] p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--color-success)]"
              strokeWidth={2}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                Resolved{completedLabel ? ` · ${completedLabel}` : ""}
              </h2>
              {resolutionNote && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-subtle">
                  {resolutionNote}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 border-t border-hairline pt-4">
            <ReportCsat reportId={report.id} />
          </div>
        </section>
      )}

      {/* Timeline */}
      <section className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5 shadow-[var(--shadow-card)]">
        <h2 className="mb-5 text-[15px] font-semibold tracking-tight text-foreground">
          Progress
        </h2>
        <ReportTimeline steps={steps} />
      </section>

      {/* Public status link — an account-less, shareable view (opaque token, no
          PII). Lets a resident share progress, or check back without signing
          in. Opens the /r/[token] page. */}
      <Link
        href={`/r/${publicToken(report.id)}`}
        className="mt-6 inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-hairline bg-overlay px-4 text-[13px] font-medium text-subtle outline-none transition-colors hover:border-hairline-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_60%,transparent)]"
      >
        <Link2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        Public status link
      </Link>

      {/* Comment thread — resident+staff Q&A. Gracefully absent when migration
          055 hasn't been applied yet (listComments returns []). */}
      <CommentThread reportId={report.id} initialComments={comments} />
    </div>
  );
}
