"use client";

import {
  AllCommunityModule,
  type ColDef,
  type ICellRendererParams,
  ModuleRegistry,
  themeQuartz,
  type ValueFormatterParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import {
  type AlertTriangle,
  CircleDot,
  Construction,
  Droplets,
  HelpCircle,
  Lamp,
  Paintbrush,
  Signpost,
  Trash2,
  TreePine,
  Wind,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { GridReportRow } from "@/lib/staff/grid-data";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils/cn";

ModuleRegistry.registerModules([AllCommunityModule]);

// ── Civic palette (mirrors work-order-row.tsx so the grid matches the Inbox) ──
const CATEGORY_ICONS: Record<string, typeof AlertTriangle> = {
  pothole: CircleDot,
  streetlight: Lamp,
  downed_sign: Signpost,
  graffiti: Paintbrush,
  illegal_dump: Trash2,
  water_leak: Droplets,
  sidewalk_damage: Construction,
  tree_down: TreePine,
  debris: Wind,
  drainage: Droplets,
  faded_signage: Signpost,
  other: HelpCircle,
};

const SEVERITY_COLORS: Record<number, string> = {
  1: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400",
  2: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400",
  3: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400",
  4: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
  5: "bg-red-200 text-red-900 dark:bg-red-900/60 dark:text-red-300",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400",
  dispatched:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400",
  in_progress:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400",
  closed:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400",
  merged: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
};

// ── AG-Grid enterprise theme (token-free hex; ported from schedule-bot) ────────
const gridThemeLight = themeQuartz.withParams({
  accentColor: "#2563eb",
  backgroundColor: "#ffffff",
  headerBackgroundColor: "#f8fafc",
  headerTextColor: "#64748b",
  foregroundColor: "#0f172a",
  fontFamily: "inherit",
  rowHoverColor: "#f1f5f9",
  selectedRowBackgroundColor: "#e0edfb",
  oddRowBackgroundColor: "#ffffff",
  borderColor: "#e2e8f0",
  wrapperBorderRadius: "12px",
});
const gridThemeDark = themeQuartz.withParams({
  accentColor: "#3b82f6",
  backgroundColor: "#18181b",
  headerBackgroundColor: "#0f0f11",
  headerTextColor: "#9a9aa6",
  foregroundColor: "#f4f4f5",
  fontFamily: "inherit",
  rowHoverColor: "#27272a",
  selectedRowBackgroundColor: "#1e3a5f",
  oddRowBackgroundColor: "#18181b",
  borderColor: "#27272a",
  wrapperBorderRadius: "12px",
});

// ── cell renderers ────────────────────────────────────────────────────────────
function CategoryCell({ data }: ICellRendererParams<GridReportRow>) {
  if (!data) return null;
  const Icon = CATEGORY_ICONS[data.category ?? "other"] ?? HelpCircle;
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
        <Icon className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium capitalize text-zinc-900 dark:text-zinc-100">
          {(data.category ?? "unclassified").replace(/_/g, " ")}
        </span>
        {data.subcategory && (
          <span className="truncate text-xs text-zinc-500">
            {data.subcategory}
          </span>
        )}
      </span>
    </span>
  );
}

function SeverityCell({ value }: ICellRendererParams<GridReportRow, number>) {
  if (value == null) return <span className="text-zinc-400">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        SEVERITY_COLORS[value] ?? SEVERITY_COLORS[3],
      )}
    >
      {value}
    </span>
  );
}

/** Priority (urgency) — number + proportional bar. Emergencies have no work
 *  order (null priority) and instead surface an EMERGENCY tag, making the
 *  "emergency = dispatched, no priority math" reality visible in the grid. */
function PriorityCell({ data }: ICellRendererParams<GridReportRow>) {
  if (!data) return null;
  if (data.priority_score == null) {
    return data.is_emergency ? (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800 dark:bg-red-900/50 dark:text-red-300">
        EMERGENCY
      </span>
    ) : (
      <span className="text-zinc-400">—</span>
    );
  }
  const score = data.priority_score;
  // Practical non-emergency priorities sit ~3.5–15; clamp the bar domain to 20.
  const pct = Math.max(4, Math.min(100, (score / 20) * 100));
  const tone =
    score >= 10 ? "bg-red-500" : score >= 7 ? "bg-orange-500" : "bg-blue-500";
  return (
    <span className="flex items-center gap-2">
      <span className="tabular-nums text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {score.toFixed(1)}
      </span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <span
          className={cn("block h-full rounded-full", tone)}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}

function StatusCell({ data }: ICellRendererParams<GridReportRow>) {
  if (!data) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
          STATUS_STYLES[data.status] ?? STATUS_STYLES.open,
        )}
      >
        {data.status.replace(/_/g, " ")}
      </span>
      {data.needs_manual_review && (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">
          Review
        </span>
      )}
    </span>
  );
}

function SourceCell({ value }: ICellRendererParams<GridReportRow, string>) {
  if (!value) return <span className="text-zinc-400">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase",
        value === "ai"
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
      )}
    >
      {value}
    </span>
  );
}

const usd = (p: ValueFormatterParams<GridReportRow, number | null>) =>
  p.value == null ? "—" : `$${p.value.toLocaleString()}`;

const dateFmt = (p: ValueFormatterParams<GridReportRow, string>) =>
  p.value
    ? new Date(p.value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export function WorkOrderGrid({ rows }: { rows: GridReportRow[] }) {
  const { theme } = useTheme();
  const gridTheme = theme === "dark" ? gridThemeDark : gridThemeLight;

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    let out = rows;
    if (statusFilter) out = out.filter((r) => r.status === statusFilter);
    if (query) {
      const q = query.toLowerCase();
      out = out.filter((r) =>
        [r.category, r.subcategory, r.address, r.department]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q)),
      );
    }
    return out;
  }, [rows, statusFilter, query]);

  const columnDefs = useMemo<ColDef<GridReportRow>[]>(
    () => [
      {
        colId: "category",
        headerName: "Issue",
        field: "category",
        cellRenderer: CategoryCell,
        flex: 1.4,
        minWidth: 200,
      },
      {
        colId: "severity",
        headerName: "Sev",
        field: "severity",
        cellRenderer: SeverityCell,
        width: 90,
        minWidth: 80,
      },
      {
        colId: "priority",
        headerName: "Priority",
        field: "priority_score",
        cellRenderer: PriorityCell,
        // Nulls (emergencies) sort last on a desc sort.
        comparator: (a, b) => (a ?? -1) - (b ?? -1),
        sort: "desc",
        width: 150,
        minWidth: 140,
      },
      {
        colId: "est_cost",
        headerName: "Est. Cost",
        field: "est_cost",
        valueFormatter: usd,
        type: "rightAligned",
        width: 120,
        minWidth: 100,
      },
      {
        colId: "department",
        headerName: "Dept",
        field: "department",
        valueFormatter: (p) =>
          p.value ? String(p.value).replace(/_/g, " ") : "—",
        flex: 1,
        minWidth: 130,
      },
      {
        colId: "crew",
        headerName: "Crew",
        field: "crew_type",
        valueFormatter: (p) =>
          p.value ? String(p.value).replace(/_/g, " ") : "—",
        width: 130,
        minWidth: 110,
      },
      {
        colId: "est_minutes",
        headerName: "Est. Min",
        field: "est_minutes",
        valueFormatter: (p) => (p.value == null ? "—" : `${p.value}m`),
        type: "rightAligned",
        width: 110,
        minWidth: 90,
      },
      {
        colId: "source",
        headerName: "Source",
        field: "wo_source",
        cellRenderer: SourceCell,
        width: 110,
        minWidth: 90,
      },
      {
        colId: "status",
        headerName: "Status",
        field: "status",
        cellRenderer: StatusCell,
        width: 160,
        minWidth: 130,
      },
      {
        colId: "created",
        headerName: "Reported",
        field: "created_at",
        valueFormatter: dateFmt,
        width: 150,
        minWidth: 130,
      },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef<GridReportRow>>(
    () => ({ sortable: true, resizable: true, filter: true, minWidth: 80 }),
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search issue, address, department…"
          aria-label="Search work orders"
          className="min-w-[220px] flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="dispatched">Dispatched</option>
          <option value="in_progress">In progress</option>
          <option value="closed">Closed</option>
          <option value="merged">Merged</option>
          <option value="rejected">Rejected</option>
        </select>
        <span className="ml-auto text-xs text-zinc-500">
          {filtered.length} report{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <AgGridReact<GridReportRow>
          theme={gridTheme}
          rowData={filtered}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowHeight={52}
          headerHeight={44}
          getRowId={(p) => p.data.report_id}
          pagination
          paginationPageSize={25}
          paginationPageSizeSelector={[25, 50, 100]}
          overlayNoRowsTemplate={"<span>No matching reports.</span>"}
        />
      </div>
    </div>
  );
}
