import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, MapPin } from "lucide-react";

import { CATEGORY_META, KNOWN_CITIES } from "@/lib/dashboard-data";
import type { ReportStatus } from "@/lib/types";
import { timeAgo } from "@/lib/utils/time-ago";
import { cn } from "@/lib/utils/cn";
import { getCurrentResident, getMyReport, getReportTimeline } from "@/lib/resident-data";
import { Prose } from "@/components/analytics/bento-primitives";
import { ReportTimeline, ReportPhoto } from "@/components/resident/report-timeline";

// Dynamic — a resident report id is not enumerable at build time.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ reportId: string }>;
}

// Local tone maps mirror recent-reports.tsx / report-detail.tsx (those copies
// are module-private). Reused verbatim so the pill matches every other surface.
const STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Open",
  dispatched: "Dispatched",
  in_progress: "In progress",
  closed: "Resolved",
  merged: "Merged",
  rejected: "Rejected",
};

const STATUS_TONE: Record<ReportStatus, string> = {
  open: "text-[#ff9f0a] bg-[#ff9f0a]/10",
  dispatched: "text-[#0a84ff] bg-[#0a84ff]/10",
  in_progress: "text-[#5ac8fa] bg-[#5ac8fa]/10",
  closed: "text-[#30d158] bg-[#30d158]/10",
  merged: "text-zinc-400 bg-white/[0.06]",
  rejected: "text-[#ff453a] bg-[#ff453a]/10",
};

// Status-aware "what happens next" copy — morale-boosting resident tone.
// Branches so a resolved/merged/rejected report never reads as "still coming".
function whatHappensNext(status: ReportStatus): string {
  switch (status) {
    case "closed":
      return "All done — the city resolved this one. Thanks for flagging it: reports like yours are exactly how the city stays ahead of problems.";
    case "in_progress":
      return "A crew is actively on this now. Once the work wraps, we'll mark it resolved and you'll get an update right here.";
    case "dispatched":
      return "Your report reached the right team and is queued for a crew. Next you'll see it move to In progress as work begins.";
    case "merged":
      return "We spotted a nearby report covering the same issue and combined them, so the city tackles it as one job. You'll still get every update.";
    case "rejected":
      return "After a closer look the city closed this one without action. If something's changed on the ground, you're always welcome to file a fresh report.";
    default: // open
      return "We've logged your report. Next it gets routed to the right team and dispatched to a crew — we'll keep this timeline updated every step of the way.";
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { reportId } = await params;
  const cityName = KNOWN_CITIES.cumming.name;
  return {
    title: `Civic | Report ${reportId.slice(0, 8)} — ${cityName}`,
    description: `Status timeline and details for your ${cityName} report.`,
  };
}

export default async function ResidentReportDetailPage({ params }: PageProps) {
  const { reportId } = await params;
  const { citySlug } = await getCurrentResident();

  const report = await getMyReport(citySlug, reportId);
  if (!report) notFound();

  const steps = await getReportTimeline(citySlug, reportId);
  const meta = CATEGORY_META[report.category];

  return (
    /* pb clears the resident BottomTabBar on mobile; desktop keeps pb-10. */
    <div className="mx-auto w-full max-w-5xl px-4 pt-16 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-24 sm:pb-10 lg:px-8">
      {/* Back link — min-tap (44px) hit area so it's easily tappable on mobile */}
      <Link
        href="/user/my-reports"
        className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] text-zinc-400 transition-colors hover:text-white -ml-1 px-1"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        My reports
      </Link>

      {/* Report header */}
      <header className="mt-3 flex flex-col gap-3 sm:mt-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="flex min-w-0 items-center gap-2.5 text-[22px] sm:text-[28px] font-semibold tracking-tight text-white leading-[1.15]">
            <span
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: meta.color }}
              aria-hidden
            />
            <span className="truncate">{meta.label}</span>
          </h1>
          <span
            className={cn(
              "mt-1.5 flex-shrink-0 rounded-md px-2 py-0.5 text-[12px] font-medium",
              STATUS_TONE[report.status],
            )}
          >
            {STATUS_LABEL[report.status]}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 text-[13px] text-zinc-400 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} />
            <span>{report.address}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} />
            Filed {timeAgo(report.created_at)} ago
          </span>
        </div>
      </header>

      {/* Photo — full-bleed on mobile (no horizontal margin), rounded + bordered */}
      <div className="-mx-4 mt-5 overflow-hidden border-y border-white/[0.06] bg-[#1c1c1e] sm:mx-0 sm:mt-6 sm:rounded-[14px] sm:border">
        <ReportPhoto
          key={report.id}
          src={report.photo_public_url}
          alt={`${meta.label} report at ${report.address}`}
        />
      </div>

      {/* Timeline + what happens next — single column on mobile, 12-col on lg */}
      <section className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-12 lg:items-start">
        <div className="rounded-[14px] border border-white/[0.06] bg-[#1c1c1e] p-4 sm:p-6 lg:col-span-7">
          <h2 className="mb-4 text-[15px] font-semibold text-white sm:mb-5">
            Progress
          </h2>
          <ReportTimeline steps={steps} />
        </div>

        <div className="rounded-[14px] border border-white/[0.06] bg-[#1c1c1e] p-4 sm:p-6 lg:col-span-5">
          <h2 className="mb-3 text-[15px] font-semibold text-white">
            What happens next
          </h2>
          <Prose>{whatHappensNext(report.status)}</Prose>
        </div>
      </section>
    </div>
  );
}
