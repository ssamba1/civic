"use client";

import {
  AllCommunityModule,
  type CellClickedEvent,
  type CellValueChangedEvent,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
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
  Maximize2,
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
import { createPortal } from "react-dom";
import { fetchCategoryCostStats } from "@/app/staff/actions";
import { WorkOrderExplorer } from "@/components/city/work-order-explorer";
import { teamIcon } from "@/components/teams/team-icon";
import {
  type CrewTypeDef,
  crewTypeLabel,
  DEFAULT_CREW_TYPES,
  DEFAULT_CREW_TYPE_KEYS,
} from "@/lib/crew-types";
import { type CurrencyConfig, formatCost } from "@/lib/currency";
import { CATEGORY_META, CATEGORY_SLA_TARGETS } from "@/lib/dashboard-data";
import type { GridCrewOption, GridReportRow } from "@/lib/dashboard-grid-data";
import { categoryToTeam, TEAMS } from "@/lib/teams";
import { useTheme } from "@/lib/theme";
import type {
  CategoryCostStats,
  Department,
  ReportCategory,
} from "@/lib/types";
import { useCurrency } from "@/lib/use-currency";
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
// Baseline crew-type keys; buildOptions folds in whatever keys the live rows
// carry, so per-city catalog types (031) appear once any row uses them.
const CREWS: string[] = DEFAULT_CREW_TYPE_KEYS;
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

// Severity 1→5 runs a green→red traffic-light ramp so the level reads at a
// glance, not just from the digit. Built by color-mixing the three AA-tuned
// `--status-*-fg` tokens (not the saturated `--color-*` — those have no dark
// override, so text on them fails contrast in dark mode): success → warning →
// danger, with mixed midpoints for levels 2 and 4. One hue drives all three of
// a chip's surfaces — colored digit, 14% tint fill, 42% ring — so the same
// value is used as text (AA-safe) and as low-opacity tint.
const SEVERITY_HUE: Record<number, string> = {
  1: "var(--status-success-fg)",
  2: "color-mix(in srgb, var(--status-success-fg) 55%, var(--status-warning-fg))",
  3: "var(--status-warning-fg)",
  4: "color-mix(in srgb, var(--status-warning-fg) 50%, var(--status-danger-fg))",
  5: "var(--status-danger-fg)",
};

function severityChipStyle(value: number): React.CSSProperties {
  const hue = SEVERITY_HUE[value] ?? SEVERITY_HUE[3];
  return {
    color: hue,
    backgroundColor: `color-mix(in srgb, ${hue} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${hue} 42%, transparent)`,
    borderWidth: 1,
    borderStyle: "solid",
  };
}

// Priority score → the same green→red ramp, banded across the practical
// non-emergency range (~3.5–15, bar domain clamped to 20). Colors the number
// and the proportional bar together so length and hue reinforce each other.
function priorityHue(score: number): string {
  if (score < 4) return SEVERITY_HUE[1];
  if (score < 7) return SEVERITY_HUE[2];
  if (score < 9) return SEVERITY_HUE[3];
  if (score < 12) return SEVERITY_HUE[4];
  return SEVERITY_HUE[5];
}

// Status → semantic vocabulary. open/rejected are the two states that need
// attention (unclaimed backlog, needs a manual look) so they carry warning;
// dispatched/in_progress are active work in flight (info); closed is the
// success terminal state; merged is an administrative/neutral terminal state
// with no dot. Same mapping drives the dropdown dot, the StatusCell pill, and
// the toolbar filter chips so the vocabulary reads identically everywhere.
const STATUS_TEXT: Record<string, string> = {
  open: "text-[var(--status-warning-fg)]",
  dispatched: "text-[var(--status-info-fg)]",
  in_progress: "text-[var(--status-info-fg)]",
  closed: "text-[var(--status-success-fg)]",
  merged: "text-subtle",
  rejected: "text-[var(--status-danger-fg)]",
};

// Solid dot per status — used by the dropdown menu options and StatusCell.
const STATUS_DOT: Record<string, string> = {
  open: "bg-[var(--color-warning)]",
  dispatched: "bg-[#5b6b8c]",
  in_progress: "bg-[#5b6b8c]",
  closed: "bg-[var(--color-success)]",
  merged: "bg-faint",
  rejected: "bg-[var(--color-danger)]",
};

// Outline+tint chip for the toolbar status filter buttons — mirrors
// STATUS_TEXT/STATUS_DOT so the active filter reads the same vocabulary,
// via the color-mix idiom already used for EditPill's hover border.
const STATUS_CHIP_ACTIVE: Record<string, string> = {
  open: "border-[color-mix(in_srgb,var(--color-warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] text-[var(--status-warning-fg)]",
  dispatched:
    "border-[color-mix(in_srgb,#5b6b8c_45%,transparent)] bg-[color-mix(in_srgb,#5b6b8c_12%,transparent)] text-[var(--status-info-fg)]",
  in_progress:
    "border-[color-mix(in_srgb,#5b6b8c_45%,transparent)] bg-[color-mix(in_srgb,#5b6b8c_12%,transparent)] text-[var(--status-info-fg)]",
  closed:
    "border-[color-mix(in_srgb,var(--color-success)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--status-success-fg)]",
  merged: "border-hairline-strong bg-overlay-strong text-foreground",
  rejected:
    "border-[color-mix(in_srgb,var(--color-danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--status-danger-fg)]",
};

// ── AG-Grid theme ───────────────────────────────────────────────────────────
// AG Grid's theming API takes literal color strings (no CSS custom properties),
// so these are hardcoded to match globals.css's token values exactly rather
// than referencing var(--token) — accent is the ink token (was the Apple-blue
// #0a84ff brand primary), hover/selection tints are neutral (was light-blue
// tints). No zebra — the hover tint + accent bar (globals.css .wo-grid) is the
// row signal.
const gridThemeLight = themeQuartz.withParams({
  accentColor: "#18181b", // --accent (light)
  backgroundColor: "#ffffff", // --surface (light)
  headerBackgroundColor: "#ededf0", // --elevated (light)
  headerTextColor: "#6f6f76", // --faint (light)
  headerFontWeight: 600,
  foregroundColor: "#141415", // --foreground (light)
  fontFamily: "inherit",
  fontSize: 13,
  cellHorizontalPadding: 14,
  rowHoverColor: "rgba(0, 0, 0, 0.04)", // --overlay (light)
  selectedRowBackgroundColor: "rgba(24, 24, 27, 0.07)", // --accent-soft (light)
  borderColor: "rgba(0, 0, 0, 0.08)", // --hairline (light)
  wrapperBorderRadius: "0px", // full-bleed — grid runs edge-to-edge
  wrapperBorder: false, // no outer frame; grid fills the content area
});
const gridThemeDark = themeQuartz.withParams({
  accentColor: "#f4f4f5", // --accent (dark)
  backgroundColor: "#161619", // --surface (dark)
  headerBackgroundColor: "#26262a", // --elevated (dark)
  headerTextColor: "#85858c", // --faint (dark)
  headerFontWeight: 600,
  foregroundColor: "#f5f5f6", // --foreground (dark)
  fontFamily: "inherit",
  fontSize: 13,
  cellHorizontalPadding: 14,
  rowHoverColor: "rgba(255, 255, 255, 0.04)", // --overlay (dark)
  selectedRowBackgroundColor: "rgba(255, 255, 255, 0.09)", // --accent-soft (dark)
  borderColor: "rgba(255, 255, 255, 0.09)", // --hairline (dark)
  wrapperBorderRadius: "0px", // full-bleed — grid runs edge-to-edge
  wrapperBorder: false, // no outer frame; grid fills the content area
});

// Neutral icon tile for category glyphs — category color stays off chrome
// here (only map data layers and chart series carry category hue).
const ICON_TILE = "bg-elevated text-subtle";

// Team icon tile — a soft alpha-tinted tile in the team's own color (the
// "filled" icon read; lucide ships outline-only glyphs, so the fill lives on
// the tile, not the icon color).
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
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
          ICON_TILE,
        )}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
    );
  }
  if (kind === "status") {
    return (
      <span
        role="img"
        aria-label={`status: ${String(value).replace(/_/g, " ")}`}
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
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
        style={severityChipStyle(value as number)}
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
      className="max-h-80 overflow-y-auto rounded-[var(--radius-md)] border border-hairline-strong bg-surface p-1.5 shadow-[var(--shadow-pop)] outline-none"
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
              "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[13px] text-foreground",
              i === active && "bg-overlay",
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
        "inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-hairline-strong bg-surface py-1 pl-2 pr-1.5 shadow-[var(--shadow-card)] transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_60%,transparent)]",
        className,
      )}
    >
      {children}
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />
    </span>
  );
}

function CategoryCell({ data }: ICellRendererParams<GridReportRow>) {
  if (!data) return null;
  const cat = (data.category ?? "other") as ReportCategory;
  const meta = CATEGORY_META[cat] ?? CATEGORY_META.other;
  const Icon = CATEGORY_ICON[meta.icon] ?? HelpCircle;
  return (
    <EditPill className="h-11 rounded-[var(--radius-lg)] pl-1.5">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)]",
          ICON_TILE,
        )}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[13px] font-medium text-foreground">
          {data.category ? meta.label : "Unclassified"}
        </span>
        {data.subcategory && (
          <span className="truncate text-[11px] text-subtle">
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
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
        style={iconTileStyle(team.color)}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
      <span className="truncate text-[13px] text-subtle">
        {team.shortLabel}
      </span>
    </span>
  );
}

function SeverityCell({ value }: ICellRendererParams<GridReportRow, number>) {
  if (value == null) return <span className="text-faint">—</span>;
  return (
    <EditPill className="h-8">
      <span
        className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-semibold"
        style={severityChipStyle(value)}
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
      // Safety-critical emergency flag — the one place danger red stays a
      // solid fill rather than the outline+dot chip, since it must read
      // instantly against a grid full of neutral cells.
      <span className="inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--color-danger)] px-2 py-0.5 text-xs font-bold text-white">
        EMERGENCY
      </span>
    ) : (
      <span className="text-faint">—</span>
    );
  }
  const score = data.priority_score;
  // Practical non-emergency priorities sit ~3.5–15; clamp the bar domain to 20.
  const pct = Math.max(4, Math.min(100, (score / 20) * 100));
  const hue = priorityHue(score);
  return (
    <span className="flex items-center gap-2">
      <span
        className="tabular-nums text-[13px] font-semibold"
        style={{ color: hue }}
      >
        {score.toFixed(1)}
      </span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-elevated">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: hue }}
        />
      </span>
    </span>
  );
}

/** Status is editable — dropdown pill wrapping a solid status dot + tinted
 *  label, so the cell reads like a select control. */
function StatusCell({ data }: ICellRendererParams<GridReportRow>) {
  if (!data) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <EditPill className="h-8 pl-2.5">
        <span
          aria-hidden="true"
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
        <span className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-hairline bg-overlay px-1.5 py-0.5 text-[10px] font-bold text-[var(--status-warning-fg)]">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-[var(--color-warning)]"
          />
          Review
        </span>
      )}
    </span>
  );
}

// ── SLA column ──────────────────────────────────────────────────────────────
// Derived client-side from category + created_at (NOT the work_orders.due_at
// column) so it renders on databases that haven't applied migration 032 yet —
// same computation as deriveSlaRisk. The due_at column drives the server-side
// escalation job; this surfaces the same status to the operator in the grid.
const SLA_BACKLOG_STATUSES = new Set(["open", "dispatched", "in_progress"]);
const SLA_AT_RISK_FRACTION = 0.2; // within the last 20% of the window

interface SlaState {
  /** Hours remaining to the deadline; negative = overdue. null = not applicable. */
  remaining: number | null;
  tier: "overdue" | "due_soon" | "on_track" | "na";
  label: string;
}

function computeSla(row: GridReportRow): SlaState {
  if (!row.category || !SLA_BACKLOG_STATUSES.has(row.status)) {
    return { remaining: null, tier: "na", label: "—" };
  }
  const target = CATEGORY_SLA_TARGETS[row.category as ReportCategory];
  if (!target) return { remaining: null, tier: "na", label: "—" };
  const ageH = Math.max(
    0,
    (Date.now() - Date.parse(row.created_at)) / 3_600_000,
  );
  const remaining = target - ageH;
  if (remaining <= 0) {
    const overdueH = Math.round(-remaining);
    const disp =
      overdueH >= 48 ? `${Math.round(overdueH / 24)}d` : `${overdueH}h`;
    return { remaining, tier: "overdue", label: `${disp} over` };
  }
  const leftH = Math.round(remaining);
  const disp = leftH >= 48 ? `${Math.round(leftH / 24)}d` : `${leftH}h`;
  if (remaining <= target * SLA_AT_RISK_FRACTION) {
    return { remaining, tier: "due_soon", label: `${disp} left` };
  }
  return { remaining, tier: "on_track", label: `${disp} left` };
}

const SLA_TIER_STYLE: Record<SlaState["tier"], string> = {
  overdue: "text-[var(--status-danger-fg)]",
  due_soon: "text-[var(--status-warning-fg)]",
  on_track: "text-muted",
  na: "text-faint",
};
const SLA_TIER_DOT: Record<SlaState["tier"], string> = {
  overdue: "bg-[var(--color-danger)]",
  due_soon: "bg-[var(--color-warning)]",
  on_track: "bg-[var(--color-success)]",
  na: "bg-transparent",
};

function SlaCell({ data }: ICellRendererParams<GridReportRow>) {
  if (!data) return null;
  const sla = computeSla(data);
  if (sla.tier === "na") {
    return <span className="text-[13px] text-faint">—</span>;
  }
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn("h-2 w-2 shrink-0 rounded-full", SLA_TIER_DOT[sla.tier])}
      />
      <span className={cn("text-[13px] font-medium", SLA_TIER_STYLE[sla.tier])}>
        {sla.tier === "overdue" ? "Overdue " : ""}
        {sla.label}
      </span>
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
          value ? "text-foreground" : "text-faint",
        )}
      >
        {value ? titleize(value) : "—"}
      </span>
    </EditPill>
  );
}

function SourceCell({ value }: ICellRendererParams<GridReportRow, string>) {
  if (!value) return <span className="text-faint">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-0.5 text-[11px] font-medium uppercase",
        value === "ai"
          ? "border-hairline-strong bg-overlay-strong text-foreground"
          : "border-hairline bg-overlay text-subtle",
      )}
    >
      {value}
    </span>
  );
}

/* ── Predicted cost (category_cost_stats RPC) ──
   Cold-start rule from the cost-prediction design: a category needs 5+
   accepted actuals before a prediction shows; below that the cell reads as an
   intentional unknown, not a low-confidence guess. Prediction mirrors the
   RPC's contract: base mean × severity ratio clamped to [0.6, 1.8]. Stats
   arrive async after mount, so the column's cells are refreshed once the
   fetch resolves (see the cityId effect in WorkOrderGrid). */
function predictFromStats(
  row: GridReportRow | undefined,
  stats: Map<string, CategoryCostStats>,
): number | null {
  const s = row?.category ? stats.get(row.category) : undefined;
  if (!s || s.n < 5) return null;
  const ratio =
    s.avg_severity > 0 && row?.severity != null
      ? row.severity / s.avg_severity
      : 1;
  const mult = Math.min(Math.max(ratio, 0.6), 1.8);
  return Math.round(s.base * mult);
}

// Reliability tier as quiet colored TEXT (AA -fg tokens), not a filled pill —
// hue-as-text matches the grid's status cells; low confidence stays gray.
const TIER_TEXT: Record<CategoryCostStats["tier"], string> = {
  high: "text-[var(--status-success-fg)]",
  medium: "text-[var(--status-warning-fg)]",
  low: "text-faint",
};

function PredictedCostCell({
  data,
  context,
}: ICellRendererParams<GridReportRow>) {
  const ctx = context as {
    costStatsRef: { current: Map<string, CategoryCostStats> };
    currency: CurrencyConfig;
  };
  const statsRef = ctx.costStatsRef;
  const s = data?.category ? statsRef.current.get(data.category) : undefined;
  const predicted = predictFromStats(data, statsRef.current);
  if (predicted == null) {
    return (
      <span
        className="text-faint"
        title={
          s
            ? `Needs 5+ closed jobs with actual cost (has ${s.n})`
            : "Needs 5+ closed jobs with actual cost"
        }
      >
        —
      </span>
    );
  }
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="tabular-nums">
        {formatCost(predicted, ctx.currency)}
      </span>
      <span
        className={cn(
          "font-mono text-[10px] uppercase tracking-[0.08em]",
          TIER_TEXT[s?.tier ?? "low"],
        )}
        title={`Prediction reliability: ${s?.tier ?? "low"} (${s?.n ?? 0} samples)`}
      >
        {s?.tier === "medium" ? "med" : (s?.tier ?? "low")}
      </span>
    </span>
  );
}

const dateFmt = (p: ValueFormatterParams<GridReportRow, string>) =>
  p.value
    ? new Date(p.value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** Trailing expand affordance — opens the full-issue explorer focused on this
 *  row. Reads openDetail off the grid `context` (same channel PredictedCostCell
 *  uses for stats) so the pinned column def never has to close over React state
 *  and trigger a columnDefs rebuild. Editable cells keep single-click-to-edit;
 *  this button (and any read-only cell — see onCellClicked) is the open path. */
function ExpandCell({ data, context }: ICellRendererParams<GridReportRow>) {
  if (!data) return null;
  const { openDetail } = context as { openDetail: (id: string) => void };
  const label =
    data.category != null
      ? (CATEGORY_META[data.category as ReportCategory]?.label ??
        titleize(data.category))
      : "unclassified issue";
  return (
    <button
      type="button"
      onClick={() => openDetail(data.report_id)}
      aria-label={`Open details for ${label}`}
      title="Open full details"
      className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-transparent text-faint outline-none transition-colors hover:border-hairline hover:bg-overlay hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <Maximize2 className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}

// ── Page-size control ────────────────────────────────────────────────────────
// Custom styled dropdown (not AG Grid's built-in number-only selector) so "All"
// is an option, and so the chrome matches the grid's other styled dropdowns
// instead of an OS-drawn <select>. "all" maps to the full filtered row count so
// pagination collapses to a single page.
type PageChoice = 25 | 50 | 100 | "all";
const PAGE_CHOICES: PageChoice[] = [25, 50, 100, "all"];
const pageChoiceLabel = (c: PageChoice) => (c === "all" ? "All" : String(c));

function PageSizeSelect({
  value,
  onChange,
}: {
  value: PageChoice;
  onChange: (c: PageChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Rows per page: ${pageChoiceLabel(value)}`}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-hairline bg-overlay px-2.5 py-1 text-xs font-medium text-subtle outline-none transition-colors hover:border-hairline-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <span className="text-faint">Rows</span>
        <span className="tabular-nums text-foreground">
          {pageChoiceLabel(value)}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 bottom-full z-30 mb-1.5 w-28 overflow-hidden rounded-[var(--radius-md)] border border-hairline bg-surface p-1 shadow-[var(--shadow-pop)]"
        >
          {PAGE_CHOICES.map((c) => {
            const selected = c === value;
            return (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-overlay",
                  selected && "font-medium",
                )}
              >
                <span className="tabular-nums">{pageChoiceLabel(c)}</span>
                {selected && (
                  <Check className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function WorkOrderGrid({
  rows,
  cityId,
  crews = [],
  crewTypes = DEFAULT_CREW_TYPES,
  canAssign = false,
}: {
  rows: GridReportRow[];
  cityId?: string;
  crews?: GridCrewOption[];
  // Per-city crew-type catalog (031) — built-ins ∪ customs — so the crew
  // filter/edit dropdown can show and select custom types with no work order.
  crewTypes?: CrewTypeDef[];
  canAssign?: boolean;
}) {
  const { theme } = useTheme();
  const gridTheme = theme === "dark" ? gridThemeDark : gridThemeLight;
  // City currency (INR for ahilyanagar, USD default). Threaded into the cost
  // column formatters + the predicted-cost cell via grid context so a non-USD
  // city renders ₹ with the right grouping instead of a hardcoded $.
  const currency = useCurrency();

  // Predicted-cost stats live in a ref (not state) so their arrival can't
  // rebuild columnDefs — AG Grid re-applies colDef sort/width on columnDefs
  // changes, clobbering user sort + resizes (see deptOptions note below).
  // Cell renderers reach the ref through the grid `context`; the effect
  // repaints just the predicted column when the fetch resolves.
  const gridApiRef = useRef<GridApi<GridReportRow> | null>(null);
  const costStatsRef = useRef<Map<string, CategoryCostStats>>(new Map());

  // AG Grid owns the pagination panel DOM and gives no slot for extra controls.
  // To sit the page-size selector INLINE between the row summary ("1 to 25 of
  // N") and the page nav ("Page 1 of 6"), splice a host node into the panel and
  // portal the React control into it — the portal keeps React in control of the
  // node. `mountPagingSlot` is idempotent and re-run on pagination changes so
  // the host re-heals if AG Grid ever rebuilds the panel.
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const [pagingSlot, setPagingSlot] = useState<HTMLElement | null>(null);
  const mountPagingSlot = useCallback(() => {
    const panel =
      gridWrapRef.current?.querySelector<HTMLElement>(".ag-paging-panel");
    if (!panel) return;
    const pageNav = panel.querySelector<HTMLElement>(
      ".ag-paging-page-summary-panel",
    );
    let host = panel.querySelector<HTMLElement>(":scope > .wo-page-size-slot");
    if (!host) {
      host = document.createElement("div");
      host.className = "wo-page-size-slot";
    }
    // Place (or re-place) it immediately before the page nav.
    if (pageNav && host.nextElementSibling !== pageNav) {
      panel.insertBefore(host, pageNav);
    }
    setPagingSlot((prev) => (prev === host ? prev : host));
  }, []);

  // Full-issue explorer (list + detail overlay), opened from a row's expand
  // button or a click on any read-only cell. Selection is held here so the
  // overlay opens pre-focused on the clicked row; detailDrawerOpen is the
  // mobile branch (detail in a Drawer instead of the side pane).
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const openDetail = useCallback((id: string) => {
    setSelectedId(id);
    setExplorerOpen(true);
  }, []);
  const closeExplorer = useCallback(() => {
    setExplorerOpen(false);
    setDetailDrawerOpen(false);
  }, []);

  const gridContext = useMemo(
    () => ({ costStatsRef, openDetail, currency }),
    [openDetail, currency],
  );
  useEffect(() => {
    if (!cityId) return;
    let cancelled = false;
    fetchCategoryCostStats(cityId).then((res) => {
      // Empty data is the normal cold-start state (RPC missing or no actuals
      // captured yet) — the column simply keeps rendering "—".
      if (cancelled || !res.ok || res.data.length === 0) return;
      costStatsRef.current = new Map(res.data.map((s) => [s.category, s]));
      gridApiRef.current?.refreshCells({
        columns: ["predicted_cost"],
        force: true,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [cityId]);

  // Editable cells mutate rows in place; hold them in local state (seeded from
  // the server rows) so in-grid edits survive the search/filter recompute.
  // Edits are SESSION-ONLY — there is no work-order update API, so a refresh
  // reverts them. See the "session-only" note in the toolbar.
  const [data, setData] = useState<GridReportRow[]>(rows);
  useEffect(() => setData(rows), [rows]);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // Page size: base 25, user-selectable 25/50/100/All. "all" resolves to the
  // current filtered row count so pagination collapses to one page.
  const [pageChoice, setPageChoice] = useState<PageChoice>(25);
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

  // "All" ⇒ one page holding every filtered row (min 1 — AG Grid rejects 0).
  const effectivePageSize =
    pageChoice === "all" ? Math.max(filtered.length, 1) : pageChoice;

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
  // Seed from the city's crew-type catalog (built-ins ∪ customs) so custom
  // types appear/select even with no work order yet; buildOptions still folds
  // in any orphan key a live row carries. Labels resolve via crewTypeLabel,
  // matching the crew dialog and the members page.
  const crewTypeKeys = useMemo(
    () => crewTypes.map((t) => t.key),
    [crewTypes],
  );
  const crewOptions = useMemo(
    () =>
      buildOptions(
        crewTypeKeys.length > 0 ? crewTypeKeys : CREWS,
        rows.map((r) => r.crew_type),
        (v) => crewTypeLabel(v, crewTypes) ?? titleize(v),
      ),
    [rows, crewTypeKeys, crewTypes],
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

  // Click-to-open on read-only cells. Editable cells (category/severity/status/
  // dept/crew) keep single-click-to-edit, and the pinned actions button opens
  // itself — so this fires only for the plain cells (Team, Priority, costs,
  // Source, Reported), making "click the row" open the full issue without
  // fighting the inline editors.
  const onCellClicked = useCallback(
    (e: CellClickedEvent<GridReportRow>) => {
      if (e.colDef.editable) return;
      if (e.column.getColId() === "actions") return;
      if (e.data) openDetail(e.data.report_id);
    },
    [openDetail],
  );

  const columnDefs = useMemo<ColDef<GridReportRow>[]>(
    () => [
      {
        colId: "created",
        headerName: "Reported",
        field: "created_at",
        valueFormatter: dateFmt,
        initialWidth: 150,
        minWidth: 130,
      },
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
        colId: "sla",
        headerName: "SLA",
        // Sort/filter on hours-remaining (overdue = most negative sorts first
        // on asc). Not editable — it's a derived read-only signal.
        valueGetter: (p: ValueGetterParams<GridReportRow>) =>
          p.data ? computeSla(p.data).remaining : null,
        cellRenderer: SlaCell,
        comparator: (a, b) =>
          (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY),
        initialWidth: 130,
        minWidth: 110,
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
          p.data?.crew_type
            ? (crewTypeLabel(p.data.crew_type, crewTypes) ??
              titleize(p.data.crew_type))
            : "",
        initialWidth: 150,
        minWidth: 130,
      },
      {
        colId: "est_cost",
        headerName: "Est. Cost",
        field: "est_cost",
        valueFormatter: (
          p: ValueFormatterParams<GridReportRow, number | null>,
        ) => (p.value == null ? "—" : formatCost(p.value, currency)),
        type: "rightAligned",
        initialWidth: 120,
        minWidth: 100,
      },
      {
        colId: "predicted_cost",
        headerName: "Predicted",
        // Sort/filter on the same number the cell shows. Reads the stats ref
        // live, so values appear once the async fetch lands (refreshCells
        // repaints; a later sort re-runs this getter against fresh stats).
        valueGetter: (p: ValueGetterParams<GridReportRow>) =>
          predictFromStats(p.data, costStatsRef.current),
        cellRenderer: PredictedCostCell,
        type: "rightAligned",
        initialWidth: 130,
        minWidth: 110,
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
        // Always-reachable open affordance: pinned right so it survives
        // horizontal scroll, and locked (no sort/filter/resize/move/edit) so it
        // reads as chrome, not data.
        colId: "actions",
        headerName: "",
        pinned: "right",
        width: 56,
        minWidth: 56,
        maxWidth: 64,
        sortable: false,
        filter: false,
        resizable: false,
        editable: false,
        suppressMovable: true,
        cellRenderer: ExpandCell,
        cellStyle: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        },
      },
    ],
    [deptOptions, crewOptions, crewTypes, currency],
  );

  const defaultColDef = useMemo<ColDef<GridReportRow>>(
    () => ({ sortable: true, resizable: true, filter: true, minWidth: 80 }),
    [],
  );

  const chipBase =
    "inline-flex items-center rounded-[var(--radius-md)] border px-2.5 py-1 text-xs font-medium transition-colors";
  const chipIdle =
    "border-hairline bg-overlay text-subtle hover:border-hairline-strong hover:text-foreground";

  return (
    // `relative` anchors the issue explorer overlay: it renders as an absolute
    // child here (not a body portal), so it fills the content column and leaves
    // the app sidebar visible — see WorkOrderExplorer.
    <div className="relative flex min-h-0 flex-1 flex-col gap-2">
      {/* Toolbar keeps horizontal padding so search + chips have breathing
          room; the grid below runs full-bleed to the viewport edges. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pt-3 sm:px-4 lg:px-6">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search issue, address, department…"
            aria-label="Search work orders"
            className="w-full rounded-[var(--radius-md)] border border-hairline bg-surface py-1.5 pl-9 pr-3 text-sm text-foreground shadow-[var(--shadow-card)] placeholder:text-faint focus:border-hairline-strong"
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
                ? "border-transparent bg-foreground text-background"
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
                statusFilter === s ? STATUS_CHIP_ACTIVE[s] : chipIdle,
              )}
            >
              {titleize(s)}
              <span className="ml-1 tabular-nums opacity-60">
                {statusCounts[s] ?? 0}
              </span>
            </button>
          ))}
        </fieldset>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Always visible — the grid is just as editable on mobile, and a
              hidden warning turns unsaved edits into silent data loss. */}
          <span
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-hairline bg-overlay px-2.5 py-1 text-[11px] font-medium text-[var(--status-warning-fg)]"
            title="Category, severity, status, department, and crew are editable — click a cell. Changes are not saved to the database."
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
            Edits not saved to database
          </span>
        </div>
      </div>

      <div ref={gridWrapRef} className="wo-grid relative min-h-0 flex-1">
        <AgGridReact<GridReportRow>
          theme={gridTheme}
          rowData={filtered}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowHeight={64}
          headerHeight={44}
          getRowId={(p) => p.data.report_id}
          context={gridContext}
          onGridReady={(e: GridReadyEvent<GridReportRow>) => {
            gridApiRef.current = e.api;
            mountPagingSlot();
          }}
          onPaginationChanged={mountPagingSlot}
          singleClickEdit
          stopEditingWhenCellsLoseFocus
          onCellValueChanged={onCellValueChanged}
          onCellClicked={onCellClicked}
          pagination
          paginationPageSize={effectivePageSize}
          // Our own PageSizeSelect (adds "All"); suppress AG Grid's built-in one.
          paginationPageSizeSelector={false}
          // Smooth row-reorder on sort/filter. Works because getRowId is stable
          // (AG Grid diffs rows by id and tweens their positions); default-true
          // in v35, set explicitly so the intent survives future upgrades.
          animateRows
          overlayNoRowsTemplate={"<span>No matching reports.</span>"}
        />
        {/* Rendered into the host spliced into AG Grid's pagination panel, so
            the selector sits inline between "1 to 25 of N" and "Page 1 of 6". */}
        {pagingSlot &&
          createPortal(
            <PageSizeSelect value={pageChoice} onChange={setPageChoice} />,
            pagingSlot,
          )}
      </div>

      <WorkOrderExplorer
        open={explorerOpen}
        onClose={closeExplorer}
        rows={filtered}
        crews={crews}
        canAssign={canAssign}
        selectedId={selectedId}
        onSelectId={setSelectedId}
        detailDrawerOpen={detailDrawerOpen}
        onDetailDrawerChange={setDetailDrawerOpen}
      />
    </div>
  );
}
