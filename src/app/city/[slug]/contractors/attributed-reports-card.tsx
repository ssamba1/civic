"use client";

import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { CATEGORY_META } from "@/lib/dashboard-data";
import type { ContractorLiableReport } from "@/lib/db/contractors";
import {
  STATUS_LABEL,
  type StatusTone,
  statusChipClass,
  toneChipClass,
} from "@/lib/status";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Attributed-reports card — compact preview + "View all" modal so the
   full list (dozens of rows for an active vendor) never stretches the
   detail page. Chips reuse the app-wide status/tone system: hue only
   ever encodes state.
   ================================================================== */

const PREVIEW_COUNT = 4;

// Verdict → semantic tone. Under-warranty is a recovery the city can act on
// (success); utility restoration is informational; city cost / unknown carry
// no hue, matching the LiabilityBadge's grayscale rule.
const VERDICT_TONE: Record<string, StatusTone> = {
  contractor_warranty: "success",
  utility_restoration: "info",
  city_cost: "neutral",
  unknown: "neutral",
};

const VERDICT_LABEL: Record<string, string> = {
  contractor_warranty: "Under warranty",
  utility_restoration: "Utility restoration",
  city_cost: "City cost",
  unknown: "Unknown",
};

function titleize(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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

function statusChip(status: string): { cls: string; label: string } {
  if (status in STATUS_LABEL) {
    const s = status as ReportStatus;
    return { cls: statusChipClass(s), label: STATUS_LABEL[s] };
  }
  return { cls: toneChipClass("neutral"), label: titleize(status) };
}

function ReportRow({ r }: { r: ContractorLiableReport }) {
  const meta = r.category
    ? (CATEGORY_META[r.category as ReportCategory] ?? null)
    : null;
  const chip = statusChip(r.status);
  const verdictTone = VERDICT_TONE[r.verdict] ?? "neutral";
  return (
    <li className="border-b border-hairline px-4 py-3 last:border-b-0 sm:px-5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: meta?.color ?? "var(--color-faint)" }}
            aria-hidden
          />
          {meta?.label ?? (r.category ? titleize(r.category) : "Report")}
        </span>
        <span className="min-w-0 flex-1 truncate text-subtle">
          {r.address ?? "No address on file"}
        </span>
        <span
          className={cn(
            "rounded-[var(--radius-md)] px-2 py-0.5 text-[11px] font-medium",
            chip.cls,
          )}
        >
          {chip.label}
        </span>
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-3.5 text-[12px] text-subtle">
        <span
          className={cn(
            "rounded-[var(--radius-md)] px-2 py-0.5 text-[11px] font-medium",
            toneChipClass(verdictTone),
          )}
        >
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
      </p>
    </li>
  );
}

export function AttributedReportsCard({
  slug,
  reports,
}: {
  slug: string;
  reports: ContractorLiableReport[];
}) {
  const [open, setOpen] = useState(false);
  const preview = reports.slice(0, PREVIEW_COUNT);

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-5">
        <h2 className="text-[13px] font-semibold text-foreground">
          Attributed reports
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-[12px] tabular-nums text-faint">
            {reports.length}
          </span>
          <Link
            href={`/city/${slug}/grid`}
            className="text-[12px] text-faint transition-colors hover:text-foreground"
          >
            Open grid →
          </Link>
        </div>
      </header>

      {reports.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <p className="text-sm font-medium text-foreground">
            No attributed reports
          </p>
          <p className="mt-1 text-[13px] text-faint">
            Reports land here when the liability engine matches them to this
            vendor's warranty or restoration window.
          </p>
        </div>
      ) : (
        <>
          <ul>
            {preview.map((r) => (
              <ReportRow key={r.reportId} r={r} />
            ))}
          </ul>
          {reports.length > PREVIEW_COUNT && (
            <div className="border-t border-hairline px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-hairline bg-overlay px-3 text-[13px] font-medium text-subtle outline-none transition-colors duration-150 hover:bg-overlay-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
              >
                View all {reports.length}
              </button>
            </div>
          )}
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Attributed reports (${reports.length})`}
        className="max-w-2xl"
      >
        <ul className="custom-scrollbar -mx-5 max-h-[60vh] overflow-y-auto border-t border-hairline">
          {reports.map((r) => (
            <ReportRow key={r.reportId} r={r} />
          ))}
        </ul>
      </Modal>
    </section>
  );
}
