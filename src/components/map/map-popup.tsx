import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";

interface MapPopupProps {
  report: DashboardReport;
}

function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STATUS_STYLES: Record<
  string,
  { label: string; style: string }
> = {
  open: {
    label: "Open",
    style: "background:#fef3c7;color:#92400e;",
  },
  dispatched: {
    label: "Dispatched",
    style: "background:#dbeafe;color:#1e40af;",
  },
  in_progress: {
    label: "In Progress",
    style: "background:#ede9fe;color:#6b21a8;",
  },
  closed: {
    label: "Resolved",
    style: "background:#dcfce7;color:#166534;",
  },
  merged: {
    label: "Merged",
    style: "background:#f4f4f5;color:#3f3f46;",
  },
  rejected: {
    label: "Rejected",
    style: "background:#fee2e2;color:#b91c1c;",
  },
};

export function renderPopupHTML(report: DashboardReport): string {
  const meta = CATEGORY_META[report.category];
  const statusEntry = STATUS_STYLES[report.status] ?? {
    label: report.status,
    style: "background:#f4f4f5;color:#3f3f46;",
  };

  return `
    <div style="min-width:200px;max-width:280px;font-family:system-ui,sans-serif;">
      <div style="width:100%;height:120px;border-radius:8px 8px 0 0;overflow:hidden;background:#f4f4f5;">
        <img
          src="${esc(report.photo_public_url)}"
          alt="${esc(meta.label)} report"
          style="width:100%;height:100%;object-fit:cover;"
          onerror="this.style.display='none'"
        />
      </div>
      <div style="padding:10px 12px 12px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(meta.color)};flex-shrink:0;"></span>
          <strong style="font-size:14px;color:#18181b;">${esc(meta.label)}</strong>
          <span style="font-size:11px;padding:2px 8px;border-radius:9999px;font-weight:500;${statusEntry.style}">
            ${esc(statusEntry.label)}
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;font-size:12px;color:#71717a;">
          <span>Severity ${esc(String(report.severity))}/5</span>
          <span style="color:#d4d4d8;">|</span>
          <span>${esc(severityLabel(report.severity))}</span>
        </div>
        <p style="margin:6px 0 0;font-size:12px;color:#52525b;">${esc(report.address)}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#a1a1aa;">${esc(timeAgoCompact(report.created_at))}</p>
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
