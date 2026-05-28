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

function formatExactDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function estimateRepairCost(reportId: string, category: string, severity: number): string {
  // Deterministic stable hash based on ID characters to ensure cost is persistent across clicks
  let hash = 0;
  for (let i = 0; i < reportId.length; i++) {
    hash = reportId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const variance = (Math.abs(hash) % 40) - 20; // -$20 to +$20
  
  let baseCost = 100;
  switch (category) {
    case "water_leak": baseCost = 450; break;
    case "drainage": baseCost = 350; break;
    case "sidewalk_damage": baseCost = 280; break;
    case "pothole": baseCost = 180; break;
    case "streetlight": baseCost = 120; break;
    case "tree_down": baseCost = 150; break;
    case "illegal_dump": baseCost = 220; break;
    case "graffiti": baseCost = 65; break;
    case "debris": baseCost = 80; break;
  }
  
  const total = baseCost * severity + variance;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(total);
}

function getUrgencyMeta(severity: number): { label: string; bg: string; text: string; sla: string } {
  if (severity >= 5) {
    return { label: "CRITICAL (P1)", bg: "#fee2e2", text: "#ef4444", sla: "< 2 Hrs" };
  }
  if (severity >= 4) {
    return { label: "HIGH (P2)", bg: "#ffedd5", text: "#f97316", sla: "< 12 Hrs" };
  }
  if (severity >= 3) {
    return { label: "MEDIUM (P3)", bg: "#e0e7ff", text: "#6366f1", sla: "< 48 Hrs" };
  }
  if (severity >= 2) {
    return { label: "LOW (P4)", bg: "#f3f4f6", text: "#4b5563", sla: "< 5 Days" };
  }
  return { label: "ROUTINE (P5)", bg: "#f3f4f6", text: "#9ca3af", sla: "< 14 Days" };
}

export function renderPopupHTML(report: DashboardReport): string {
  const meta = CATEGORY_META[report.category];
  const statusEntry = STATUS_STYLES[report.status] ?? {
    label: report.status,
    style: "background:#f4f4f5;color:#3f3f46;",
  };
  const urgency = getUrgencyMeta(report.severity);

  return `
    <div style="min-width:210px;max-width:280px;font-family:system-ui,-apple-system,sans-serif;">
      <div style="width:100%;height:120px;border-radius:8px 8px 0 0;overflow:hidden;background:#f4f4f5;position:relative;">
        <img
          src="${esc(report.photo_public_url)}"
          alt="${esc(meta.label)} report"
          style="width:100%;height:100%;object-fit:cover;"
          onerror="this.style.display='none'"
        />
        <div style="position:absolute;bottom:8px;right:8px;background:rgba(24,24,27,0.75);backdrop-filter:blur(4px);color:white;font-size:9px;font-family:monospace;padding:2px 6px;border-radius:4px;font-weight:700;">
          ID: ${esc(report.id)}
        </div>
      </div>
      <div style="padding:10px 12px 12px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(meta.color)};flex-shrink:0;"></span>
          <strong style="font-size:14px;color:#18181b;">${esc(meta.label)}</strong>
          <span style="font-size:10px;padding:2px 8px;border-radius:9999px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;${statusEntry.style}">
            ${esc(statusEntry.label)}
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;font-size:12px;color:#71717a;font-weight:500;">
          <span>Severity ${esc(String(report.severity))}/5</span>
          <span style="color:#d4d4d8;">|</span>
          <span>${esc(severityLabel(report.severity))}</span>
        </div>
        
        <p style="margin:6px 0 0;font-size:12px;color:#3f3f46;font-weight:600;line-height:1.3;">${esc(report.address)}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#71717a;">Received ${esc(timeAgoCompact(report.created_at))}</p>

        <!-- Elegant Divider -->
        <div style="margin:10px 0; border-top:1px dashed #e4e4e7;"></div>

        <!-- Metrics Grid -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px 8px; font-size:11px; margin-top:2px; line-height:1.2;">
          <div>
            <span style="display:block; color:#a1a1aa; font-weight:700; font-size:8px; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Date Reported</span>
            <span style="color:#27272a; font-weight:600;">${esc(formatExactDate(report.created_at))}</span>
          </div>
          <div>
            <span style="display:block; color:#a1a1aa; font-weight:700; font-size:8px; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Est. Repair Cost</span>
            <span style="color:#0f766e; font-weight:700;">${esc(estimateRepairCost(report.id, report.category, report.severity))}</span>
          </div>
          
          <div style="grid-column: span 2; display:flex; justify-content:space-between; align-items:center; background:#f4f4f5; padding:6px 8px; border-radius:6px; margin-top:2px; border:1px solid #e4e4e7;">
            <div>
              <span style="display:block; color:#71717a; font-weight:700; font-size:8px; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Priority SLA</span>
              <span style="color:${esc(urgency.text)}; font-weight:800; font-size:10px; letter-spacing:0.01em;">${esc(urgency.label)}</span>
            </div>
            <div style="text-align:right;">
              <span style="display:block; color:#71717a; font-weight:700; font-size:8px; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">SLA Deadline</span>
              <span style="color:#4f46e5; font-weight:700; font-size:10px;">${esc(urgency.sla)}</span>
            </div>
          </div>
        </div>

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
