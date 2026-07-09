import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { recordCsat } from "@/lib/notify/csat";
import { type PublicStatus, resolvePublicReport } from "@/lib/public-report";
import { type StatusTone, toneChipClass } from "@/lib/status";
import { ShareActions } from "./share-actions";

// Public, account-less status page — resolved per request from an opaque token.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ rate?: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const report = await resolvePublicReport(token);
  if (!report) return { title: "Report not found | Civic" };
  return {
    title: `Civic | ${report.categoryLabel} — ${report.statusLabel}`,
    description: `Public status for a reported ${report.categoryLabel.toLowerCase()}.`,
    // Status pages carry a location — keep them out of search indexes.
    robots: { index: false, follow: false },
  };
}

// Maps the public-facing status (a simplified view of ReportStatus) onto the
// shared status tones so this page's chip matches the private report-detail
// page's statusChipClass exactly, instead of hand-rolling its own bright hues.
const PUBLIC_STATUS_TONE: Record<PublicStatus, StatusTone> = {
  in_progress: "info",
  resolved: "success",
  closed: "neutral",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function PublicReportPage({
  params,
  searchParams,
}: PageProps) {
  const { token } = await params;
  const report = await resolvePublicReport(token);
  if (!report) notFound();

  const isResolved = report.publicStatus === "resolved";

  // One-tap CSAT from the resolution email (?rate=up|down). Possession of the
  // unguessable token IS the auth — the reporter is the only one who has it.
  // Idempotent upsert; a repeat click just re-records.
  const { rate } = await searchParams;
  const rated =
    (rate === "up" || rate === "down") && isResolved
      ? await recordCsat(report.reportId, rate)
      : null;

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
        {/* Brand */}
        <div className="mb-8 flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full bg-[var(--color-primary)]"
            aria-hidden="true"
          />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Civic
          </span>
        </div>

        {/* Header */}
        <section className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <h1 className="flex min-w-0 items-center gap-2.5 text-[28px] sm:text-[34px] font-semibold tracking-tight text-foreground leading-[1.1]">
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ backgroundColor: report.categoryColor }}
                aria-hidden="true"
              />
              <span className="truncate">{report.categoryLabel}</span>
            </h1>
            <span
              className={`mt-1 flex-shrink-0 rounded-md px-2.5 py-0.5 text-[12px] font-medium ${toneChipClass(PUBLIC_STATUS_TONE[report.publicStatus])}`}
            >
              {report.statusLabel}
            </span>
          </div>
          <p className="mt-2 text-[13px] text-subtle">
            {report.address} · Reported {fmtDate(report.filedAt)}
          </p>
        </section>

        {/* Photo(s) */}
        <div className="mb-6 overflow-hidden rounded-xl border border-hairline bg-surface">
          {isResolved && report.resolutionPhotoUrl ? (
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <figure className="relative border-b border-hairline sm:border-b-0 sm:border-r">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {/* biome-ignore lint/performance/noImgElement: dynamic external resident-uploaded photo URL, not optimizable by next/image */}
                <img
                  src={report.photoUrl}
                  alt={`${report.categoryLabel} — reported`}
                  className="aspect-[16/9] w-full object-cover"
                />
                <figcaption className="absolute left-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                  Reported
                </figcaption>
              </figure>
              <figure className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {/* biome-ignore lint/performance/noImgElement: dynamic external resident-uploaded photo URL, not optimizable by next/image */}
                <img
                  src={report.resolutionPhotoUrl}
                  alt={`${report.categoryLabel} — after the fix`}
                  className="aspect-[16/9] w-full object-cover"
                />
                <figcaption className="absolute left-2 top-2 rounded-md bg-[var(--color-success)]/85 px-2 py-0.5 text-[11px] font-medium text-black backdrop-blur-sm">
                  Fixed
                </figcaption>
              </figure>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            // biome-ignore lint/performance/noImgElement: dynamic external resident-uploaded photo URL, not optimizable by next/image
            <img
              src={report.photoUrl}
              alt={`${report.categoryLabel} at ${report.address}`}
              className="aspect-[16/9] w-full object-cover"
            />
          )}
        </div>

        {/* Estimated fix-by target for still-open reports (OUTFLANK #4) */}
        {!isResolved && report.estimatedFixBy && (
          <section className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5">
            {(() => {
              const overdue = Date.parse(report.estimatedFixBy) < Date.now();
              return (
                <>
                  <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-faint">
                    {overdue ? "Target date passed" : "Estimated fix by"}
                  </h2>
                  <p className="mt-1.5 text-[20px] font-semibold tracking-tight text-foreground">
                    {fmtDate(report.estimatedFixBy)}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-subtle">
                    {overdue
                      ? "This is past its target service window. The crew is still on it — check back for updates."
                      : "Based on the typical service window for this issue type. Weather and priority can shift the date."}
                  </p>
                </>
              );
            })()}
          </section>
        )}

        {/* Resolved confirmation */}
        {isResolved && (
          <section className="rounded-[var(--radius-lg)] border border-[var(--color-success)]/25 bg-[var(--color-success)]/[0.06] p-5">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              Resolved
              {report.resolvedAt ? ` · ${fmtDate(report.resolvedAt)}` : ""}
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-subtle">
              This issue has been fixed. Thanks for reporting it — reports like
              this keep the city running.
            </p>
            {rated ? (
              <p className="mt-3 text-[13px] font-medium text-foreground">
                {rated === "up"
                  ? "Thanks — glad it worked out. Your rating was recorded."
                  : "Sorry it wasn't fixed right. Your rating was recorded — the crew will take another look."}
              </p>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-[13px]">
                <span className="text-subtle">How did the crew do?</span>
                <a
                  href={`?rate=up`}
                  className="rounded-md border border-hairline px-2.5 py-1 font-medium text-foreground hover:bg-overlay"
                >
                  👍
                </a>
                <a
                  href={`?rate=down`}
                  className="rounded-md border border-hairline px-2.5 py-1 font-medium text-foreground hover:bg-overlay"
                >
                  👎
                </a>
              </p>
            )}
          </section>
        )}

        {/* Real status history (live reports; demo corpus has none) */}
        {report.updates && report.updates.length > 0 && (
          <section className="mt-6">
            <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-faint">
              History
            </h2>
            <ol className="mt-3 space-y-3 border-l border-hairline pl-4">
              {report.updates.map((u) => (
                <li key={`${u.at}-${u.statusLabel}`} className="relative">
                  <span
                    className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-[var(--color-primary)]"
                    aria-hidden="true"
                  />
                  <p className="text-[13px] font-medium text-foreground">
                    {u.statusLabel}
                    <span className="ml-2 font-normal text-faint">
                      {fmtDate(u.at)}
                    </span>
                  </p>
                  {u.note && (
                    <p className="mt-0.5 text-[13px] leading-relaxed text-subtle">
                      {u.note}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <p className="mt-8 text-[12px] text-faint">
          This is a public status page. No account needed — bookmark this link
          to check back anytime.
        </p>

        <ShareActions />
      </div>
    </main>
  );
}
