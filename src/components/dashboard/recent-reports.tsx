import {
  AlertCircle,
  CheckCircle2,
  Clock,
  MapPin,
  Truck,
  Wrench,
} from "lucide-react";
import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils/cn";
import type { ReportStatus } from "@/lib/types";

interface RecentReportsProps {
  reports: DashboardReport[];
}

const STATUS_CONFIG: Record<
  ReportStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  open: {
    label: "Open",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  dispatched: {
    label: "Dispatched",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    icon: <Truck className="h-3 w-3" />,
  },
  in_progress: {
    label: "In Progress",
    className: "bg-purple-50 text-purple-700 border-purple-200",
    icon: <Wrench className="h-3 w-3" />,
  },
  closed: {
    label: "Resolved",
    className: "bg-green-50 text-green-700 border-green-200",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  merged: {
    label: "Merged",
    className: "bg-zinc-50 text-zinc-600 border-zinc-200",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-50 text-red-600 border-red-200",
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

export function RecentReports({ reports }: RecentReportsProps) {
  if (reports.length === 0) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Recent Reports</h2>
        <p className="mt-4 text-sm text-zinc-500">
          No reports have been submitted yet.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Recent Reports</h2>
      <ul className="mt-4 divide-y divide-zinc-100" role="list">
        {reports.map((report) => {
          const meta = CATEGORY_META[report.category];
          const statusCfg = STATUS_CONFIG[report.status];

          return (
            <li key={report.id}>
              <a
                href={`?focus=${report.id}`}
                className="flex items-center gap-4 py-3 transition-colors hover:bg-zinc-50 -mx-2 px-2 rounded-lg"
              >
                {/* severity dot + category color */}
                <span className="relative flex-shrink-0">
                  <span
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white text-sm font-bold"
                    style={{ backgroundColor: meta.color }}
                    aria-hidden="true"
                  >
                    {meta.label.charAt(0)}
                  </span>
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white",
                      severityColor(report.severity),
                    )}
                    title={`Severity ${report.severity}/5`}
                  />
                </span>

                {/* details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {meta.label}
                    </p>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
                        statusCfg.className,
                      )}
                    >
                      {statusCfg.icon}
                      {statusCfg.label}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-zinc-500">
                    <span className="inline-flex items-center gap-1 truncate">
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      {report.address}
                    </span>
                    <span className="inline-flex items-center gap-1 flex-shrink-0">
                      <Clock className="h-3 w-3" />
                      {timeAgo(report.created_at)}
                    </span>
                  </div>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function severityColor(s: number): string {
  if (s >= 5) return "bg-red-500";
  if (s >= 4) return "bg-orange-500";
  if (s >= 3) return "bg-amber-400";
  if (s >= 2) return "bg-yellow-300";
  return "bg-green-400";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
