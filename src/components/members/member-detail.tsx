import { Mail, Phone, Users } from "lucide-react";
import Link from "next/link";
import { teamIcon } from "@/components/teams/team-icon";
import { CATEGORY_META } from "@/lib/dashboard-data";
import type {
  MemberDetail as MemberDetailData,
  MemberRow,
} from "@/lib/db/members";
import { STATUS_LABEL, statusChipClass, toneChipClass } from "@/lib/status";
import { TEAMS, type TeamId } from "@/lib/teams";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import {
  MemberActivityTimeline,
  type TimelineEntry,
} from "./member-activity-timeline";

/* ==================================================================
   Member detail, a single member's profile, activity, and report
   history. Server component: it does all the report/event merge and
   label/time formatting, handing the interactive timeline island a
   flat, serializable entry list.

   Grayscale enterprise register. Differentiation is weight and
   outline, never hue. Contact PII is masked upstream (in the page) for
   demo sessions; this component only renders what it is given.
   ================================================================== */

// Mirrors the events query cap in lib/db/members (MEMBER_EVENTS_CAP). When the
// returned array is at the cap the true count is unknown, so the tile reads "N+".
const EVENTS_CAP = 100;

// Grayscale role badges, copied from members-table (module-private there) so
// the badge here matches the roster exactly.
const ROLE_META: Record<MemberRow["role"], { label: string; badge: string }> = {
  admin: {
    label: "Admin",
    badge: "border-transparent bg-accent text-accent-contrast",
  },
  staff_supervisor: {
    label: "Supervisor",
    badge: "border-hairline-strong bg-overlay-strong text-foreground",
  },
  staff_dispatcher: {
    label: "Dispatcher",
    badge: "border-hairline bg-overlay text-subtle",
  },
  resident: {
    label: "Resident",
    badge: "border-transparent bg-transparent text-faint",
  },
};

// Human labels for lifecycle event types (see the report_events migration).
// `status_*` and unknown types fall through to the humanizer below.
const EVENT_LABEL: Record<string, string> = {
  report_created: "Submitted a report",
  classification_overridden: "Corrected a classification",
  ai_classified: "Report classified by AI",
  classification_failed: "Classification failed",
  work_order_created: "Created a work order",
  dispatched: "Dispatched a crew",
  resolved: "Marked a report resolved",
  duplicate_detected: "Flagged a duplicate",
};

// Event types that map 1:1 onto a timeline glyph kind (see KIND_ICON in the
// timeline island). Everything else collapses to "status" or "generic".
const KNOWN_EVENT_KINDS = new Set([
  "classification_overridden",
  "ai_classified",
  "classification_failed",
  "work_order_created",
  "dispatched",
  "resolved",
  "duplicate_detected",
]);

function humanizeToken(token: string): string {
  const s = token.replace(/_/g, " ").trim();
  return s.length === 0 ? "Activity" : s.charAt(0).toUpperCase() + s.slice(1);
}

function humanizeEvent(type: string): string {
  const known = EVENT_LABEL[type];
  if (known) return known;
  if (type.startsWith("status_")) {
    const raw = type.slice("status_".length);
    const label =
      raw in STATUS_LABEL
        ? STATUS_LABEL[raw as ReportStatus]
        : humanizeToken(raw);
    return `Changed status to ${label}`;
  }
  return humanizeToken(type);
}

function iconKind(type: string): string {
  if (type === "report_created") return "report";
  if (type.startsWith("status_")) return "status";
  return KNOWN_EVENT_KINDS.has(type) ? type : "generic";
}

// Coarse relative time, mirrors the roster table's helper (module-private
// there). Computed server-side so timestamps match the request render and never
// hydrate-mismatch; no date library dependency.
function relativeTime(iso: string | null): string {
  if (!iso) return "-";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "-";
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// Absolute calendar date, mirrors absoluteDate in report-timeline.
function absoluteDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function categoryLabel(category: string | null): string {
  if (!category) return "Uncategorized";
  return CATEGORY_META[category as ReportCategory]?.label ?? category;
}

// Status chip tolerant of unknown status strings, the contract types status as
// a plain string, so an out-of-band value degrades to a neutral chip rather than
// mis-rendering with an unrelated tone.
function statusChip(status: string): { cls: string; label: string } {
  if (status in STATUS_LABEL) {
    const s = status as ReportStatus;
    return { cls: statusChipClass(s), label: STATUS_LABEL[s] };
  }
  return { cls: toneChipClass("neutral"), label: humanizeToken(status) };
}

// Merge reports (as submissions) + lifecycle events into one newest-first feed.
// `report_created` events are dropped because reports[] already represents each
// submission. Keeping both would double every filing.
function buildTimeline(
  slug: string,
  detail: MemberDetailData,
): TimelineEntry[] {
  const gridHref = `/city/${slug}/grid`;
  const timed: Array<TimelineEntry & { iso: string }> = [];

  for (const r of detail.reports) {
    const cat = r.category ? categoryLabel(r.category) : null;
    timed.push({
      iso: r.createdAt,
      key: `r-${r.id}`,
      iconKind: "report",
      label: cat ? `Submitted a report · ${cat}` : "Submitted a report",
      note: null,
      timeLabel: relativeTime(r.createdAt),
      href: gridHref,
    });
  }
  for (const e of detail.events) {
    if (e.type === "report_created") continue;
    timed.push({
      iso: e.createdAt,
      key: `e-${e.id}`,
      iconKind: iconKind(e.type),
      label: humanizeEvent(e.type),
      note: e.note,
      timeLabel: relativeTime(e.createdAt),
      href: e.reportId ? gridHref : null,
    });
  }

  // ISO 8601 sorts lexicographically in chronological order → newest first.
  timed.sort((a, b) => (a.iso > b.iso ? -1 : a.iso < b.iso ? 1 : 0));
  return timed.map((t) => ({
    key: t.key,
    iconKind: t.iconKind,
    label: t.label,
    note: t.note,
    timeLabel: t.timeLabel,
    href: t.href,
  }));
}

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

interface MemberDetailProps {
  slug: string;
  detail: MemberDetailData;
  demo: boolean;
}

export function MemberDetail({ slug, detail, demo }: MemberDetailProps) {
  const { member, reports, statusCounts, events } = detail;
  const role = ROLE_META[member.role];
  const team = member.teamKey
    ? (TEAMS[member.teamKey as TeamId] ?? null)
    : null;
  const TeamIcon = team ? teamIcon(team.icon) : null;
  const timeline = buildTimeline(slug, detail);
  const gridHref = `/city/${slug}/grid`;

  const actionsValue = `${events.length}${events.length >= EVENTS_CAP ? "+" : ""}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Profile header. */}
      <section className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
                {member.displayName ?? "Unnamed member"}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center rounded-[var(--radius-md)] border px-2 py-0.5 text-[11px] font-medium",
                  role.badge,
                )}
              >
                {role.label}
              </span>
              {member.isShared && (
                <span className="inline-flex items-center gap-1 text-[11px] text-faint">
                  <Users
                    className="h-3 w-3"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  Shared login
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-subtle">
              <span className="inline-flex items-center gap-1.5">
                {TeamIcon && (
                  <TeamIcon
                    className="h-3.5 w-3.5 text-faint"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                )}
                {team ? team.shortLabel : "No team"}
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Mail
                  className="h-3.5 w-3.5 shrink-0 text-faint"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                <span className="truncate">{member.email ?? "-"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Phone
                  className="h-3.5 w-3.5 shrink-0 text-faint"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                {member.phone ?? "-"}
              </span>
            </div>

            {demo && (
              <p className="mt-2.5 text-[12px] text-faint">
                Demo session. Contact details are masked.
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-x-6 gap-y-1 text-[12px] sm:flex-col sm:gap-y-1.5 sm:text-right">
            <div>
              <span className="text-faint">Joined </span>
              <span className="text-subtle">
                {absoluteDate(member.joinedAt)}
              </span>
            </div>
            <div>
              <span className="text-faint">Last sign-in </span>
              <span className="text-subtle tabular-nums">
                {relativeTime(member.lastSignInAt)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Stat tiles. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Reports submitted"
          value={String(member.reportCount)}
        />
        <StatTile label="Actions taken" value={actionsValue} />
        <StatTile label="Open reports" value={String(statusCounts.open ?? 0)} />
        <StatTile
          label="Closed reports"
          value={String(statusCounts.closed ?? 0)}
        />
      </div>

      {/* Activity (left) + reports (right). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,9fr)]">
        <section className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-4 text-[13px] font-semibold text-foreground">
            Activity
          </h2>
          <MemberActivityTimeline entries={timeline} />
        </section>

        <section className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
          <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-5">
            <h2 className="text-[13px] font-semibold text-foreground">
              Reports
            </h2>
            <span className="text-[12px] tabular-nums text-faint">
              {member.reportCount}
            </span>
          </header>

          {reports.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                No reports yet
              </p>
              <p className="mt-1 text-[13px] text-faint">
                This member hasn&apos;t submitted any reports.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-hairline text-[11px] uppercase tracking-wide text-faint">
                      <th
                        scope="col"
                        className="px-4 py-2.5 font-medium sm:px-5"
                      >
                        Category
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Status
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Address
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Filed
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => {
                      const chip = statusChip(r.status);
                      return (
                        <tr
                          key={r.id}
                          className="border-b border-hairline transition-colors last:border-b-0 hover:bg-overlay"
                        >
                          <td className="px-4 py-3 align-middle sm:px-5">
                            <Link
                              href={gridHref}
                              className="font-medium text-foreground transition-colors hover:text-accent-text hover:underline focus-visible:outline-none focus-visible:underline"
                            >
                              {categoryLabel(r.category)}
                            </Link>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <span
                              className={cn(
                                "rounded-[var(--radius-md)] px-2 py-0.5 text-[11px] font-medium",
                                chip.cls,
                              )}
                            >
                              {chip.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-middle text-subtle">
                            <span className="line-clamp-1">
                              {r.address ?? "-"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 align-middle tabular-nums text-subtle">
                            {relativeTime(r.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {member.reportCount > reports.length && (
                <p className="border-t border-hairline px-4 py-3 text-[12px] text-faint sm:px-5">
                  Showing the {reports.length} most recent of{" "}
                  {member.reportCount}.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
