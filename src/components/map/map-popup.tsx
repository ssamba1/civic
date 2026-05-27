import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils/cn";

interface MapPopupProps {
  report: DashboardReport;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-amber-100 text-amber-800" },
  dispatched: { label: "Dispatched", className: "bg-blue-100 text-blue-800" },
  in_progress: {
    label: "In Progress",
    className: "bg-purple-100 text-purple-800",
  },
  closed: { label: "Resolved", className: "bg-green-100 text-green-800" },
  merged: { label: "Merged", className: "bg-zinc-100 text-zinc-700" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700" },
};

export function renderPopupHTML(report: DashboardReport): string {
  const meta = CATEGORY_META[report.category];
  const status = STATUS_LABELS[report.status] ?? {
    label: report.status,
    className: "bg-zinc-100 text-zinc-700",
  };

  return `
    <div style="min-width:200px;max-width:280px;font-family:system-ui,sans-serif;">
      <div style="width:100%;height:120px;border-radius:8px 8px 0 0;overflow:hidden;background:#f4f4f5;">
        <img
          src="${report.photo_public_url}"
          alt="${meta.label} report"
          style="width:100%;height:100%;object-fit:cover;"
          onerror="this.style.display='none'"
        />
      </div>
      <div style="padding:10px 12px 12px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${meta.color};flex-shrink:0;"></span>
          <strong style="font-size:14px;color:#18181b;">${meta.label}</strong>
          <span style="font-size:11px;padding:2px 8px;border-radius:9999px;font-weight:500;"
                class="${status.className}">
            ${status.label}
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;font-size:12px;color:#71717a;">
          <span>Severity ${report.severity}/5</span>
          <span style="color:#d4d4d8;">|</span>
          <span>${severityLabel(report.severity)}</span>
        </div>
        <p style="margin:6px 0 0;font-size:12px;color:#52525b;">${report.address}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#a1a1aa;">${timeAgoCompact(report.created_at)}</p>
      </div>
    </div>
  `;
}

function severityLabel(s: number): string {
  if (s >= 5) return "Critical";
  if (s >= 4) return "High";
  if (s >= 3) return "Medium";
  if (s >= 2) return "Low";
  return "Minor";
}

function timeAgoCompact(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export type { MapPopupProps };
