"use client";

import {
  AllCommunityModule,
  type CellValueChangedEvent,
  type ColDef,
  type ICellRendererParams,
  ModuleRegistry,
  themeQuartz,
  type ValueFormatterParams,
  type ValueGetterParams,
} from "ag-grid-community";
import { AgGridReact, type CustomCellEditorProps } from "ag-grid-react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  Construction,
  Droplets,
  Footprints,
  HelpCircle,
  Lightbulb,
  type LucideIcon,
  Search,
  Signpost,
  SprayCan,
  Trash2,
  TreePine,
  Waves,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { teamIcon } from "@/components/teams/team-icon";
import { CATEGORY_META } from "@/lib/dashboard-data";
import type { GridReportRow } from "@/lib/dashboard-grid-data";
import { categoryToTeam, TEAMS } from "@/lib/teams";
import { useTheme } from "@/lib/theme";
import type { CrewType, Department, ReportCategory } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

ModuleRegistry.registerModules([AllCommunityModule]);

// ── Canonical category glyphs ───────────────────────────────────────────────
// Keyed by the kebab `icon` field on CATEGORY_META (@/lib/dashboard-data) — the
// SAME source the map, analytics, dashboard, and community-pulse surfaces read,
// so every surface's glyph, label, and color stay identical by construction.
const CATEGORY_ICON: Record<string, LucideIcon> = {
  "circle-alert": CircleAlert,
  lightbulb: Lightbulb,
  "sign-post": Signpost,
  "spray-can": SprayCan,
  "trash-2": Trash2,
  droplets: Droplets,
  footprints: Footprints,
  "tree-pine": TreePine,
  construction: Construction,
  waves: Waves,
  "help-circle": HelpCircle,
};

// Editable-column value lists (session-only edits — see WorkOrderGrid note).
const CATEGORIES: ReportCategory[] = [
  "pothole",
  "streetlight",
  "downed_sign",
  "graffiti",
  "illegal_dump",
  "water_leak",
  "sidewalk_damage",
  "tree_down",
  "debris",
  "drainage",
  "faded_signage",
  "other",
];
const DEPARTMENTS: Department[] = [
  "public_works",
  "utilities",
  "parks",
  "code_enforcement",
  "sanitation",
  "other",
];
const CREWS: CrewType[] = [
  "paving",
  "line_crew",
  "sign_crew",
  "cleanup",
  "concrete",
  "arborist",
  "drain_crew",
];
const STATUSES = [
  "open",
  "dispatched",
  "in_progress",
  "closed",
  "merged",
  "rejected",
];

const titleize = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const SEVERITY_LABELS: Record<number, string> = {
  1: "Minor",
  2: "Low",
  3: "Moderate",
  4: "High",
  5: "Critical",
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

// Solid dot per status — used by the dropdown menu options.
const STATUS_DOT: Record<string, string> = {
  open: "bg-blue-500",
  dispatched: "bg-purple-500",
  in_progress: "bg-amber-500",
  closed: "bg-green-500",
  merged: "bg-zinc-400",
  rejected: "bg-red-500",
};

// ── AG-Grid theme ───────────────────────────────────────────────────────────
// Palette-aligned with the app tokens (globals.css): dark grid sits on the
// --surface tone (#1c1c1e) with hairline borders so it reads as a card on the
// black page instead of dissolving into it; accent is the app primary #0a84ff.
// No zebra — the hover tint + accent bar (globals.css .wo-grid) is the row
// signal.
const gridThemeLight = themeQuartz.withParams({
  accentColor: "#0a84ff",
  backgroundColor: "#ffffff",
  headerBackgroundColor: "#f5f5f7",
  headerTextColor: "#6e6e73",
  headerFontWeight: 600,
  foregroundColor: "#1d1d1f",
  fontFamily: "inherit",
  fontSize: 13,
  cellHorizontalPadding: 14,
  rowHoverColor: "#f2f7ff",
  selectedRowBackgroundColor: "#e5f1ff",
  borderColor: "rgba(0, 0, 0, 0.07)",
  wrapperBorderRadius: "14px",
});
const gridThemeDark = themeQuartz.withParams({
  accentColor: "#0a84ff",
  backgroundColor: "#1c1c1e",
  headerBackgroundColor: "#232326",
  headerTextColor: "#98989f",
  headerFontWeight: 600,
  foregroundColor: "#f5f5f7",
  fontFamily: "inherit",
  fontSize: 13,
  cellHorizontalPadding: 14,
  rowHoverColor: "#232a35",
  selectedRowBackgroundColor: "rgba(10, 132, 255, 0.16)",
  borderColor: "rgba(255, 255, 255, 0.08)",
  wrapperBorderRadius: "14px",
});

// A soft alpha-tinted tile in the entity's own color — this is the "filled"
// icon read (lucide ships outline-only glyphs, so the fill lives on the tile).
function iconTileStyle(color: string): React.CSSProperties {
  return { backgroundColor: `${color}1f`, color };
}

// ── Custom dropdown editor ──────────────────────────────────────────────────
// Replaces agSelectCellEditor: the native <select> popup is OS-drawn chrome
// that can't be styled (and clashes hard with the dark theme). This renders a
// styled listbox in an AG Grid popup UNDER the cell (cellEditorPopup) with
// keyboard support: arrows move, Enter picks, Escape cancels.

interface SelectOption {
  value: string | number;
  label: string;
}
type EditorKind = "category" | "status" | "severity" | "plain";

function OptionGlyph({
  kind,
  value,
}: {
  kind: EditorKind;
  value: string | number;
}) {
  if (kind === "category") {
    const meta = CATEGORY_META[value as ReportCategory] ?? CATEGORY_META.other;
    const Icon = CATEGORY_ICON[meta.icon] ?? HelpCircle;
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        style={iconTileStyle(meta.color)}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
    );
  }
  if (kind === "status") {
    return (
      <span
        className={cn(
          "h-2.5 w-2.5 shrink-0 rounded-full",
          STATUS_DOT[value as string] ?? STATUS_DOT.open,
        )}
      />
    );
  }
  if (kind === "severity") {
    return (
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
          SEVERITY_COLORS[value as number] ?? SEVERITY_COLORS[3],
        )}
      >
        {value}
      </span>
    );
  }
  return null;
}

type SelectEditorProps = CustomCellEditorProps<
  GridReportRow,
  string | number
> & {
  options: SelectOption[];
  kind: EditorKind;
};

function SelectEditor(props: SelectEditorProps) {
  const { value, onValueChange, stopEditing, options, kind } = props;
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  );
  // Option ids + aria-activedescendant: focus stays on the listbox container,
  // so without these, arrow-key navigation is silent for screen readers.
  const listId = `wo-select-${props.column.getColId()}`;

  useEffect(() => {
    listRef.current?.focus();
  }, []);

  useEffect(() => {
    (
      listRef.current?.children[active] as HTMLElement | undefined
    )?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (v: string | number) => {
    onValueChange(v);
    stopEditing();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(options[active].value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      stopEditing();
    }
  };

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={props.colDef.headerName}
      aria-activedescendant={`${listId}-opt-${active}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ width: Math.max(props.column.getActualWidth(), 210) }}
      className="max-h-80 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl outline-none dark:border-zinc-700 dark:bg-[#232327]"
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            id={`${listId}-opt-${i}`}
            type="button"
            role="option"
            aria-selected={selected}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(o.value)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-zinc-800 dark:text-zinc-100",
              i === active && "bg-zinc-100 dark:bg-zinc-700/60",
              selected && "font-medium",
            )}
          >
            <OptionGlyph kind={kind} value={o.value} />
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {selected && (
              <Check className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// Static option lists (dept/crew are built per-render — see WorkOrderGrid —
// because live rows carry AI-written values outside the enum).
const CATEGORY_OPTIONS: SelectOption[] = CATEGORIES.map((c) => ({
  value: c,
  label: CATEGORY_META[c].label,
}));
const STATUS_OPTIONS: SelectOption[] = STATUSES.map((s) => ({
  value: s,
  label: titleize(s),
}));
const SEVERITY_OPTIONS: SelectOption[] = [1, 2, 3, 4, 5].map((n) => ({
  value: n,
  label: SEVERITY_LABELS[n],
}));

/** Enum values first (canonical order), then any extra values observed in the
 *  data (AI-written crew/department strings), so the current cell value is
 *  always present in its own dropdown. */
function buildOptions(
  enums: readonly string[],
  seen: Iterable<string | null>,
  labelFor: (v: string) => string,
): SelectOption[] {
  const known = new Set<string>(enums);
  const extras: string[] = [];
  for (const v of seen) {
    if (v && !known.has(v)) {
      known.add(v);
      extras.push(v);
    }
  }
  extras.sort();
  return [...enums, ...extras].map((v) => ({ value: v, label: labelFor(v) }));
}

// ── cell renderers ──────────────────────────────────────────────────────────

/** The select-affordance container: bordered pill + chevron, so editable cells
 *  read as dropdowns instead of static text. */
function EditPill({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white py-1 pl-2 pr-1.5 shadow-sm transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] dark:border-zinc-700 dark:bg-zinc-800/70 dark:hover:border-[color-mix(in_srgb,var(--color-primary)_70%,transparent)]",
        className,
      )}
    >
      {children}
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
    </span>
  );
}

function CategoryCell({ data }: ICellRendererParams<GridReportRow>) {
  if (!data) return null;
  const cat = (data.category ?? "other") as ReportCategory;
  const meta = CATEGORY_META[cat] ?? CATEGORY_META.other;
  const Icon = CATEGORY_ICON[meta.icon] ?? HelpCircle;
  return (
    <EditPill className="h-11 rounded-xl pl-1.5">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={iconTileStyle(meta.color)}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
          {data.category ? meta.label : "Unclassified"}
        </span>
        {data.subcategory && (
          <span className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
            {data.subcategory}
          </span>
        )}
      </span>
    </EditPill>
  );
}

/** Owning team — DERIVED from the report's category via categoryToTeam (there
 *  is no per-report team column). Read-only (no pill/chevron): change the
 *  Issue cell and the team re-derives live. */
function TeamCell({ data }: ICellRendererParams<GridReportRow>) {
  if (!data) return null;
  const team =
    TEAMS[categoryToTeam((data.category ?? "other") as ReportCategory)];
  const Icon = teamIcon(team.icon);
  return (
    <span className="flex items-center gap-2">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        style={iconTileStyle(team.color)}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
      <span className="truncate text-[13px] text-zinc-700 dark:text-zinc-300">
        {team.shortLabel}
      </span>
    </span>
  );
}

function SeverityCell({ value }: ICellRendererParams<GridReportRow, number>) {
  if (value == null) return <span className="text-zinc-400">—</span>;
  return (
    <EditPill className="h-8">
      <span
        className={cn(
          "inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-semibold",
          SEVERITY_COLORS[value] ?? SEVERITY_COLORS[3],
        )}
      >
        {value}
      </span>
    </EditPill>
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
      <span className="tabular-nums text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
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

// Colored label text per status — pairs with STATUS_DOT inside the dropdown
// pill (dot + tinted label, not a filled chip).
const STATUS_TEXT: Record<string, string> = {
  open: "text-blue-700 dark:text-blue-400",
  dispatched: "text-purple-700 dark:text-purple-400",
  in_progress: "text-amber-700 dark:text-amber-400",
  closed: "text-green-700 dark:text-green-400",
  merged: "text-zinc-500 dark:text-zinc-400",
  rejected: "text-red-700 dark:text-red-400",
};

/** Status is editable — dropdown pill wrapping a solid status dot + tinted
 *  label, so the cell reads like a select control. */
function StatusCell({ data }: ICellRendererParams<GridReportRow>) {
  if (!data) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <EditPill className="h-8 rounded-full pl-2.5">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            STATUS_DOT[data.status] ?? STATUS_DOT.open,
          )}
        />
        <span
          className={cn(
            "text-[13px] font-medium capitalize",
            STATUS_TEXT[data.status] ?? STATUS_TEXT.open,
          )}
        >
          {data.status.replace(/_/g, " ")}
        </span>
      </EditPill>
      {data.needs_manual_review && (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">
          Review
        </span>
      )}
    </span>
  );
}

/** Dept + Crew share this: label pill with chevron; null → muted em-dash pill
 *  (still editable, so it keeps the affordance). */
function LabelPillCell({
  value,
}: ICellRendererParams<GridReportRow, string | null>) {
  return (
    <EditPill className="h-8">
      <span
        className={cn(
          "truncate text-[13px]",
          value
            ? "text-zinc-800 dark:text-zinc-200"
            : "text-zinc-400 dark:text-zinc-500",
        )}
      >
        {value ? titleize(value) : "—"}
      </span>
    </EditPill>
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

  // Editable cells mutate rows in place; hold them in local state (seeded from
  // the server rows) so in-grid edits survive the search/filter recompute.
  // Edits are SESSION-ONLY — there is no work-order update API, so a refresh
  // reverts them. See the "session-only" note in the toolbar.
  const [data, setData] = useState<GridReportRow[]>(rows);
  useEffect(() => setData(rows), [rows]);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const allChipRef = useRef<HTMLButtonElement>(null);

  // Search first, then status — the chip counts read from the searched set so
  // they always describe what the current search can actually reach.
  const searched = useMemo(() => {
    if (!query) return data;
    const q = query.toLowerCase();
    // Match raw enum values AND their displayed form ("in_progress" is shown
    // as "In Progress" — a search for either must hit).
    return data.filter((r) =>
      [r.category, r.subcategory, r.address, r.department, r.crew_type]
        .filter(Boolean)
        .some((s) => {
          const str = String(s).toLowerCase();
          return str.includes(q) || str.replace(/_/g, " ").includes(q);
        }),
    );
  }, [data, query]);

  const filtered = useMemo(
    () =>
      statusFilter
        ? searched.filter((r) => r.status === statusFilter)
        : searched,
    [searched, statusFilter],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of searched) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  }, [searched]);

  // Live rows carry AI-written dept/crew strings beyond the enum — fold them
  // into the dropdowns so a cell's current value is always selectable.
  // Derived from the `rows` PROP, not `data` state: edits can only pick values
  // already in the options, so keying off `data` would rebuild these (and via
  // them columnDefs) on every edit — and AG Grid re-applies defined sort/width
  // colDef attrs on columnDefs changes, clobbering user sort + resizes.
  const deptOptions = useMemo(
    () =>
      buildOptions(
        DEPARTMENTS,
        rows.map((r) => r.department),
        titleize,
      ),
    [rows],
  );
  const crewOptions = useMemo(
    () =>
      buildOptions(
        CREWS,
        rows.map((r) => r.crew_type),
        titleize,
      ),
    [rows],
  );

  const onCellValueChanged = useCallback(
    (e: CellValueChangedEvent<GridReportRow>) => {
      const updated = e.data;
      setData((prev) =>
        prev.map((r) =>
          r.report_id === updated.report_id ? { ...updated } : r,
        ),
      );
    },
    [],
  );

  const columnDefs = useMemo<ColDef<GridReportRow>[]>(
    () => [
      {
        colId: "category",
        headerName: "Issue",
        field: "category",
        cellRenderer: CategoryCell,
        editable: true,
        cellEditor: SelectEditor,
        cellEditorPopup: true,
        cellEditorPopupPosition: "under",
        cellEditorParams: { options: CATEGORY_OPTIONS, kind: "category" },
        // Filter on the displayed label, not the raw enum ("in_progress").
        filterValueGetter: (p: ValueGetterParams<GridReportRow>) =>
          p.data?.category
            ? (CATEGORY_META[p.data.category as ReportCategory]?.label ??
              titleize(p.data.category))
            : "Unclassified",
        initialFlex: 1.4,
        minWidth: 220,
      },
      {
        colId: "team",
        headerName: "Team",
        // Derived from category — no field; sort/filter/search on the label.
        valueGetter: (p: ValueGetterParams<GridReportRow>) =>
          p.data
            ? TEAMS[
                categoryToTeam((p.data.category ?? "other") as ReportCategory)
              ].shortLabel
            : "",
        cellRenderer: TeamCell,
        initialFlex: 1.1,
        minWidth: 170,
      },
      {
        colId: "severity",
        headerName: "Sev",
        field: "severity",
        cellRenderer: SeverityCell,
        editable: true,
        cellEditor: SelectEditor,
        cellEditorPopup: true,
        cellEditorPopupPosition: "under",
        cellEditorParams: { options: SEVERITY_OPTIONS, kind: "severity" },
        initialWidth: 104,
        minWidth: 96,
      },
      {
        colId: "priority",
        headerName: "Priority",
        field: "priority_score",
        cellRenderer: PriorityCell,
        // Nulls (emergencies) sort last on a desc sort. initialSort (not sort)
        // so a columnDefs rebuild never re-imposes it over the user's sort.
        comparator: (a, b) => (a ?? -1) - (b ?? -1),
        initialSort: "desc",
        initialWidth: 150,
        minWidth: 140,
      },
      {
        colId: "status",
        headerName: "Status",
        field: "status",
        cellRenderer: StatusCell,
        editable: true,
        cellEditor: SelectEditor,
        cellEditorPopup: true,
        cellEditorPopupPosition: "under",
        cellEditorParams: { options: STATUS_OPTIONS, kind: "status" },
        filterValueGetter: (p: ValueGetterParams<GridReportRow>) =>
          p.data ? titleize(p.data.status) : "",
        initialWidth: 180,
        minWidth: 150,
      },
      {
        colId: "department",
        headerName: "Dept",
        field: "department",
        cellRenderer: LabelPillCell,
        editable: true,
        cellEditor: SelectEditor,
        cellEditorPopup: true,
        cellEditorPopupPosition: "under",
        cellEditorParams: { options: deptOptions, kind: "plain" },
        filterValueGetter: (p: ValueGetterParams<GridReportRow>) =>
          p.data?.department ? titleize(p.data.department) : "",
        initialFlex: 1,
        minWidth: 150,
      },
      {
        colId: "crew",
        headerName: "Crew",
        field: "crew_type",
        cellRenderer: LabelPillCell,
        editable: true,
        cellEditor: SelectEditor,
        cellEditorPopup: true,
        cellEditorPopupPosition: "under",
        cellEditorParams: { options: crewOptions, kind: "plain" },
        filterValueGetter: (p: ValueGetterParams<GridReportRow>) =>
          p.data?.crew_type ? titleize(p.data.crew_type) : "",
        initialWidth: 150,
        minWidth: 130,
      },
      {
        colId: "est_cost",
        headerName: "Est. Cost",
        field: "est_cost",
        valueFormatter: usd,
        type: "rightAligned",
        initialWidth: 120,
        minWidth: 100,
      },
      {
        colId: "est_minutes",
        headerName: "Est. Min",
        field: "est_minutes",
        valueFormatter: (p) => (p.value == null ? "—" : `${p.value}m`),
        type: "rightAligned",
        initialWidth: 110,
        minWidth: 90,
      },
      {
        colId: "source",
        headerName: "Source",
        field: "wo_source",
        cellRenderer: SourceCell,
        initialWidth: 110,
        minWidth: 90,
      },
      {
        colId: "created",
        headerName: "Reported",
        field: "created_at",
        valueFormatter: dateFmt,
        initialWidth: 150,
        minWidth: 130,
      },
    ],
    [deptOptions, crewOptions],
  );

  const defaultColDef = useMemo<ColDef<GridReportRow>>(
    () => ({ sortable: true, resizable: true, filter: true, minWidth: 80 }),
    [],
  );

  const chipBase =
    "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors";
  const chipIdle =
    "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search issue, address, department…"
            aria-label="Search work orders"
            className="w-full rounded-full border border-zinc-200 bg-white py-1.5 pl-9 pr-3 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-blue-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">Filter by status</legend>
          <button
            ref={allChipRef}
            type="button"
            onClick={() => setStatusFilter("")}
            aria-pressed={statusFilter === ""}
            className={cn(
              chipBase,
              statusFilter === ""
                ? "border-transparent bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : chipIdle,
            )}
          >
            All
            <span className="ml-1 tabular-nums opacity-60">
              {searched.length}
            </span>
          </button>
          {STATUSES.filter(
            (s) => (statusCounts[s] ?? 0) > 0 || statusFilter === s,
          ).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                const turningOff = statusFilter === s;
                setStatusFilter(turningOff ? "" : s);
                // A zero-count chip only stays mounted while it IS the filter;
                // toggling it off unmounts it, so park focus on "All" instead
                // of letting it fall to <body>.
                if (turningOff && (statusCounts[s] ?? 0) === 0) {
                  allChipRef.current?.focus();
                }
              }}
              aria-pressed={statusFilter === s}
              className={cn(
                chipBase,
                statusFilter === s
                  ? // border-current/30 keeps the pressed state legible even for
                    // the near-neutral "merged" chip in dark mode.
                    cn("border-current/30", STATUS_STYLES[s])
                  : chipIdle,
              )}
            >
              {titleize(s)}
              <span className="ml-1 tabular-nums opacity-60">
                {statusCounts[s] ?? 0}
              </span>
            </button>
          ))}
        </fieldset>

        {/* Always visible — the grid is just as editable on mobile, and a
            hidden warning turns unsaved edits into silent data loss. */}
        <span
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-amber-200/70 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300"
          title="Category, severity, status, department, and crew are editable — click a cell. Changes are not saved to the database."
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Edits not saved to database
        </span>
      </div>

      <div className="wo-grid min-h-0 flex-1">
        <AgGridReact<GridReportRow>
          theme={gridTheme}
          rowData={filtered}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowHeight={64}
          headerHeight={44}
          getRowId={(p) => p.data.report_id}
          singleClickEdit
          stopEditingWhenCellsLoseFocus
          onCellValueChanged={onCellValueChanged}
          pagination
          paginationAutoPageSize
          overlayNoRowsTemplate={"<span>No matching reports.</span>"}
        />
      </div>
    </div>
  );
}
