import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { DEMO_REPORTER_ID } from "@/lib/demo-reports";

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

const STATUS_TONE: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "#ff9f0a" },
  dispatched: { label: "Dispatched", color: "#0a84ff" },
  in_progress: { label: "In progress", color: "#5ac8fa" },
  closed: { label: "Resolved", color: "#30d158" },
  merged: { label: "Merged", color: "#86868b" },
  rejected: { label: "Rejected", color: "#ff453a" },
};

function formatExactDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "Reported" label: a just-injected point (the live demo, or any sub-minute
// report) reads "just now" to match the list rows + the "Live" pill; older
// reports fall back to the absolute date.
function formatReported(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  return formatExactDate(iso);
}

function estimateRepairCost(
  reportId: string,
  category: string,
  severity: number,
): string {
  let hash = 0;
  for (let i = 0; i < reportId.length; i++) {
    hash = reportId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const variance = (Math.abs(hash) % 40) - 20;

  let baseCost = 100;
  switch (category) {
    case "water_leak":
      baseCost = 450;
      break;
    case "drainage":
      baseCost = 350;
      break;
    case "sidewalk_damage":
      baseCost = 280;
      break;
    case "pothole":
      baseCost = 180;
      break;
    case "streetlight":
      baseCost = 120;
      break;
    case "tree_down":
      baseCost = 150;
      break;
    case "illegal_dump":
      baseCost = 220;
      break;
    case "graffiti":
      baseCost = 65;
      break;
    case "debris":
      baseCost = 80;
      break;
  }

  const total = baseCost * severity + variance;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(total);
}

function slaWindow(severity: number): string {
  if (severity >= 5) return "< 2 hours";
  if (severity >= 4) return "< 12 hours";
  if (severity >= 3) return "< 48 hours";
  if (severity >= 2) return "< 5 days";
  return "< 14 days";
}

export function renderPopupHTML(report: DashboardReport): string {
  const meta = CATEGORY_META[report.category];
  const status = STATUS_TONE[report.status] ?? {
    label: report.status,
    color: "#86868b",
  };
  const cost = estimateRepairCost(report.id, report.category, report.severity);
  const sla = slaWindow(report.severity);
  // Presenter-injected demo point: blue glow on the popup container + a "Live"
  // pill so it reads as the freshly-added marker. (cn() N/A — this surface is an
  // HTML string, not JSX, so the class is written into the root's class attr.)
  const isDemo =
    report.demo === true || report.reporter_id === DEMO_REPORTER_ID;

  return `
    <style>@keyframes popupShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}@media (prefers-reduced-motion:reduce){.popup-img-shimmer{animation:none!important}}</style>
    <div class="${isDemo ? "demo-glow" : ""}" style="width:100%;max-width:min(300px,90vw);border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',Inter,system-ui,sans-serif;color:#f5f5f7;">
      <div class="popup-img-shimmer" style="position:relative;width:100%;height:140px;border-radius:12px 12px 0 0;overflow:hidden;background:linear-gradient(110deg,#1c1c1e 30%,#2c2c2e 50%,#1c1c1e 70%);background-size:200% 100%;animation:popupShimmer 1.4s linear infinite;">
        <img
          src="${esc(report.photo_public_url)}"
          alt="${esc(meta.label)} report"
          style="width:100%;height:100%;object-fit:cover;"
          onerror="this.style.display='none'"
        />
        ${
          isDemo
            ? `<span style="position:absolute;top:10px;left:10px;display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:rgba(10,132,255,0.95);color:#ffffff;font-size:11px;font-weight:600;letter-spacing:0.02em;box-shadow:0 1px 6px rgba(10,132,255,0.5);"><span style="width:6px;height:6px;border-radius:999px;background:#ffffff;"></span>Live</span>`
            : ""
        }
      </div>
      <div style="padding:14px 16px 16px;">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;">
          <strong style="font-size:15px;color:#ffffff;letter-spacing:-0.01em;font-weight:600;">${esc(meta.label)}</strong>
          <span style="font-size:12px;color:${esc(status.color)};">${esc(status.label)}</span>
        </div>
        <a href="https://www.google.com/maps/search/?api=1&query=${report.location.lat},${report.location.lng}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:4px 0 0;font-size:13px;color:#a1a1aa;line-height:1.35;text-decoration:none;" onmouseover="this.style.color='#0a84ff';this.style.textDecoration='underline';" onmouseout="this.style.color='#a1a1aa';this.style.textDecoration='none';">${esc(report.address)}</a>

        <div style="margin:14px 0 0;display:flex;flex-direction:column;gap:7px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;color:#86868b;">
            <span>Severity</span>
            <span style="color:#f5f5f7;">${esc(String(report.severity))}/5</span>
          </div>
          <div style="display:flex;justify-content:space-between;color:#86868b;">
            <span>Reported</span>
            <span style="color:#f5f5f7;">${esc(formatReported(report.created_at))}</span>
          </div>
          <div style="display:flex;justify-content:space-between;color:#86868b;">
            <span>Est. cost</span>
            <span style="color:#f5f5f7;">${esc(cost)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;color:#86868b;">
            <span>SLA</span>
            <span style="color:#f5f5f7;">${esc(sla)}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

export type { MapPopupProps };
