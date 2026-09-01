import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type {
  LiabilityEvaluation,
  LiabilityVerdict,
} from "@/lib/liability/types";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Liability badge, spec §3.4.

   Presentational only (no "use client", no server-only import) so the
   same component mounts inside a server page AND inside the client
   work-order detail pane.

   The rule this component exists to enforce: a bare "contractor
   liable" is never shown. Verdict, contract/permit reference, days
   remaining on the window, match distance and confidence all render
   together, because a wrong claim costs the city a vendor
   relationship at the next bid (§3.3).

   'unknown' is NOT city cost. A city that has not uploaded its paving
   schedule has no evidence either way, so it gets a muted prompt to
   supply the data, never a fabricated "the city pays for this".
   ================================================================== */

export interface LiabilityBadgeProps {
  evaluation: LiabilityEvaluation;
  /** Resolved name for `evaluation.liableContractorId`, when known. */
  contractorName?: string | null;
  /** When set, the contractor name renders as a link to this href (the
   *  Contractors workspace detail page). Name-only link. The rest of the
   *  meta line stays plain text. */
  contractorHref?: string | null;
  /** City's contract/PO number from the matched capital job. */
  contractRef?: string | null;
  /** Permit number from the matched utility permit. */
  permitRef?: string | null;
  className?: string;
}

const VERDICT_LABEL: Record<LiabilityVerdict, string> = {
  contractor_warranty: "Under warranty",
  utility_restoration: "Utility restoration",
  city_cost: "Out of warranty. City cost",
  unknown: "Liability unknown",
};

// Grayscale reskin: hue only ever encodes state. A live recovery window is
// actionable (info); a window inside 30 days is time-critical (warning); city
// cost and unknown carry no hue at all.
function verdictVariant(
  verdict: LiabilityVerdict,
  daysRemaining: number | null,
): "info" | "warning" | "default" {
  if (verdict === "city_cost" || verdict === "unknown") return "default";
  if (daysRemaining != null && daysRemaining <= 30) return "warning";
  return "info";
}

/** Whole days from today (UTC) to an ISO date. Negative once lapsed. */
export function daysUntil(
  isoDate: string | null,
  now = Date.now(),
): number | null {
  if (!isoDate) return null;
  const end = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(end)) return null;
  const today = Math.floor(now / 86_400_000) * 86_400_000;
  return Math.round((end - today) / 86_400_000);
}

function formatWindowDate(isoDate: string): string {
  const t = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return isoDate;
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function LiabilityBadge({
  evaluation,
  contractorName,
  contractorHref,
  contractRef,
  permitRef,
  className,
}: LiabilityBadgeProps) {
  const { verdict } = evaluation;

  if (verdict === "unknown") {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <Badge>No contract data</Badge>
        <span className="text-[11px] text-faint">
          No contract data. Add paving schedule to enable warranty tracking.
        </span>
      </div>
    );
  }

  const days = daysUntil(evaluation.windowEndsOn);
  const parts: string[] = [];
  if (verdict === "utility_restoration" && permitRef) {
    parts.push(`permit #${permitRef}`);
  } else if (contractRef) {
    parts.push(`contract #${contractRef}`);
  }
  if (evaluation.windowEndsOn) {
    const on = formatWindowDate(evaluation.windowEndsOn);
    parts.push(
      days == null
        ? `expires ${on}`
        : days < 0
          ? `lapsed ${on} (${Math.abs(days)}d ago)`
          : `expires ${on} (${days} ${days === 1 ? "day" : "days"})`,
    );
  }

  const meta: string[] = [];
  if (evaluation.matchDistanceM != null) {
    meta.push(`${Math.round(evaluation.matchDistanceM)}m from footprint`);
  }
  meta.push(`${Math.round(evaluation.confidence * 100)}% confidence`);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Badge variant={verdictVariant(verdict, days)}>
        {VERDICT_LABEL[verdict]}
      </Badge>
      {(contractorName || parts.length > 0) && (
        <span className="text-[12px] text-subtle leading-snug">
          {contractorName &&
            (contractorHref ? (
              <Link
                href={contractorHref}
                className="underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
              >
                {contractorName}
              </Link>
            ) : (
              <span>{contractorName}</span>
            ))}
          {contractorName && parts.length > 0 && " · "}
          {parts.join(" · ")}
        </span>
      )}
      <span className="text-[11px] tabular-nums text-faint">
        {meta.join(" · ")}
      </span>
    </div>
  );
}
