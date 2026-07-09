import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  isLangCode,
  type LangCode,
  SUPPORTED_LANGS,
  translateBatch,
} from "@/lib/ai/translate";
import { recordCsat } from "@/lib/notify/csat";
import { type PublicStatus, resolvePublicReport } from "@/lib/public-report";
import { type StatusTone, toneChipClass } from "@/lib/status";
import { ShareActions } from "./share-actions";

// Public, account-less status page — resolved per request from an opaque token.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ rate?: string; lang?: string }>;
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

function fmtDate(iso: string, lang: LangCode): string {
  return new Date(iso).toLocaleDateString(lang === "en" ? undefined : lang, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// English source copy for the page. Translated as one batch per request into
// the reporter's chosen language (#31 / #9); English returns it untouched.
const COPY = {
  targetPassed: "Target date passed",
  estimatedFixBy: "Estimated fix by",
  overdueBody:
    "This is past its target service window. The crew is still on it — check back for updates.",
  onTrackBody:
    "Based on the typical service window for this issue type. Weather and priority can shift the date.",
  resolved: "Resolved",
  resolvedBody:
    "This issue has been fixed. Thanks for reporting it — reports like this keep the city running.",
  ratedUp: "Thanks — glad it worked out. Your rating was recorded.",
  ratedDown:
    "Sorry it wasn't fixed right. Your rating was recorded — the crew will take another look.",
  csatPrompt: "How did the crew do?",
  history: "History",
  reported: "Reported",
  footer:
    "This is a public status page. No account needed — bookmark this link to check back anytime.",
} as const;

type CopyKey = keyof typeof COPY;
const COPY_KEYS = Object.keys(COPY) as CopyKey[];

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
  const { rate, lang: langParam } = await searchParams;
  const lang: LangCode = isLangCode(langParam) ? langParam : "en";
  const rated =
    (rate === "up" || rate === "down") && isResolved
      ? await recordCsat(report.reportId, rate)
      : null;

  // Translate the static copy, the two dynamic labels, and every history note
  // in a single batch. Failures fall back to source per-string, so `t`/labels
  // are always populated.
  const notes = (report.updates ?? []).map((u) => u.note ?? "");
  const translated = await translateBatch(
    [
      ...COPY_KEYS.map((k) => COPY[k]),
      report.categoryLabel,
      report.statusLabel,
      ...notes,
    ],
    lang,
  );
  const t = Object.fromEntries(
    COPY_KEYS.map((k, i) => [k, translated[i]]),
  ) as Record<CopyKey, string>;
  const categoryLabel = translated[COPY_KEYS.length];
  const statusLabel = translated[COPY_KEYS.length + 1];
  const noteAt = (i: number) => translated[COPY_KEYS.length + 2 + i];

  // Preserve the CSAT param when switching language so a rating link still works.
  const langHref = (code: LangCode) => {
    const qs = new URLSearchParams();
    if (rate === "up" || rate === "down") qs.set("rate", rate);
    if (code !== "en") qs.set("lang", code);
    const s = qs.toString();
    return s ? `?${s}` : "?";
  };

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
        {/* Brand + language selector */}
        <div className="mb-8 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full bg-[var(--color-primary)]"
              aria-hidden="true"
            />
            <span className="text-[15px] font-semibold tracking-tight text-foreground">
              Civic
            </span>
          </div>
          <nav
            aria-label="Language"
            className="flex flex-wrap items-center gap-1 text-[12px]"
          >
            {(Object.keys(SUPPORTED_LANGS) as LangCode[]).map((code) => (
              <Link
                key={code}
                href={langHref(code)}
                aria-current={code === lang ? "true" : undefined}
                className={
                  code === lang
                    ? "rounded-md bg-overlay px-2 py-0.5 font-medium text-foreground"
                    : "rounded-md px-2 py-0.5 text-subtle hover:text-foreground"
                }
              >
                {SUPPORTED_LANGS[code]}
              </Link>
            ))}
          </nav>
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
              <span className="truncate">{categoryLabel}</span>
            </h1>
            <span
              className={`mt-1 flex-shrink-0 rounded-md px-2.5 py-0.5 text-[12px] font-medium ${toneChipClass(PUBLIC_STATUS_TONE[report.publicStatus])}`}
            >
              {statusLabel}
            </span>
          </div>
          <p className="mt-2 text-[13px] text-subtle">
            {report.address} · {t.reported} {fmtDate(report.filedAt, lang)}
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
                  alt={`${categoryLabel} — ${t.reported}`}
                  className="aspect-[16/9] w-full object-cover"
                />
                <figcaption className="absolute left-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                  {t.reported}
                </figcaption>
              </figure>
              <figure className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {/* biome-ignore lint/performance/noImgElement: dynamic external resident-uploaded photo URL, not optimizable by next/image */}
                <img
                  src={report.resolutionPhotoUrl}
                  alt={`${categoryLabel} — ${t.resolved}`}
                  className="aspect-[16/9] w-full object-cover"
                />
                <figcaption className="absolute left-2 top-2 rounded-md bg-[var(--color-success)]/85 px-2 py-0.5 text-[11px] font-medium text-black backdrop-blur-sm">
                  {t.resolved}
                </figcaption>
              </figure>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            // biome-ignore lint/performance/noImgElement: dynamic external resident-uploaded photo URL, not optimizable by next/image
            <img
              src={report.photoUrl}
              alt={`${categoryLabel} at ${report.address}`}
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
                    {overdue ? t.targetPassed : t.estimatedFixBy}
                  </h2>
                  <p className="mt-1.5 text-[20px] font-semibold tracking-tight text-foreground">
                    {fmtDate(report.estimatedFixBy, lang)}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-subtle">
                    {overdue ? t.overdueBody : t.onTrackBody}
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
              {t.resolved}
              {report.resolvedAt
                ? ` · ${fmtDate(report.resolvedAt, lang)}`
                : ""}
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-subtle">
              {t.resolvedBody}
            </p>
            {rated ? (
              <p className="mt-3 text-[13px] font-medium text-foreground">
                {rated === "up" ? t.ratedUp : t.ratedDown}
              </p>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-[13px]">
                <span className="text-subtle">{t.csatPrompt}</span>
                <a
                  href={
                    langHref(lang) === "?"
                      ? "?rate=up"
                      : `${langHref(lang)}&rate=up`
                  }
                  className="rounded-md border border-hairline px-2.5 py-1 font-medium text-foreground hover:bg-overlay"
                >
                  👍
                </a>
                <a
                  href={
                    langHref(lang) === "?"
                      ? "?rate=down"
                      : `${langHref(lang)}&rate=down`
                  }
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
              {t.history}
            </h2>
            <ol className="mt-3 space-y-3 border-l border-hairline pl-4">
              {report.updates.map((u, i) => (
                <li key={`${u.at}-${u.statusLabel}`} className="relative">
                  <span
                    className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-[var(--color-primary)]"
                    aria-hidden="true"
                  />
                  <p className="text-[13px] font-medium text-foreground">
                    {u.statusLabel}
                    <span className="ml-2 font-normal text-faint">
                      {fmtDate(u.at, lang)}
                    </span>
                  </p>
                  {u.note && (
                    <p className="mt-0.5 text-[13px] leading-relaxed text-subtle">
                      {noteAt(i)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <p className="mt-8 text-[12px] text-faint">{t.footer}</p>

        <ShareActions />
      </div>
    </main>
  );
}
