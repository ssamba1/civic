"use client";

import {
  Calendar,
  Check,
  ChevronDown,
  Gauge,
  ListFilter,
  Shapes,
  Shield,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import BottomSheet from "@/components/ui/bottom-sheet";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { useFilters } from "@/lib/filters/context";
import {
  type DateRangePreset,
  DEFAULT_FILTER,
  PRESET_LABELS,
} from "@/lib/filters/types";
import { TEAM_LIST, TEAMS, type TeamId } from "@/lib/teams";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

const PRESETS: DateRangePreset[] = ["7d", "14d", "30d", "90d", "all", "custom"];

const STATUS_OPTIONS: Array<{ value: ReportStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "dispatched", label: "Dispatched" },
  { value: "in_progress", label: "In progress" },
  { value: "closed", label: "Resolved" },
  { value: "merged", label: "Merged" },
  { value: "rejected", label: "Rejected" },
];

const SEVERITIES: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];

const CATEGORIES = Object.entries(CATEGORY_META) as Array<
  [ReportCategory, { label: string; color: string; icon: string }]
>;

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

/* ------------------------------------------------------------------ */
/* Self-contained popover (click-outside + Escape). No new deps.      */
/* ------------------------------------------------------------------ */

function Popover({
  trigger,
  children,
  align = "start",
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  // `closing` keeps the panel mounted for one exit-animation frame window so the
  // popover fades/scales out instead of hard-cutting. mounted = open || closing.
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();

  const beginClose = useCallback(() => {
    setOpen(false);
    setClosing(true);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setClosing(false), 100);
  }, []);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        beginClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") beginClose();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, beginClose]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? beginClose() : setOpen(true))}
        className="contents"
      >
        {trigger(open)}
      </button>
      {(open || closing) && (
        <div
          id={panelId}
          role="dialog"
          className={cn(
            "absolute top-[calc(100%+6px)] z-50 min-w-[13rem] origin-top",
            "rounded-[14px] border border-hairline bg-surface p-1.5",
            "shadow-[var(--shadow-pop)] ring-1 ring-hairline",
            closing
              ? "animate-[popover-out_100ms_ease-in_forwards]"
              : "animate-[popover-in_120ms_ease-out]",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {children(beginClose)}
        </div>
      )}
    </div>
  );
}

/* A pill button used as a popover trigger / segment. */
function TriggerPill({
  icon,
  label,
  count,
  active,
  open,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  open?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[10px] border px-2.5 text-[12px] font-medium transition-colors",
        active || open
          ? "border-hairline-strong bg-overlay-strong text-foreground"
          : "border-hairline bg-overlay text-subtle hover:border-hairline-strong hover:text-foreground",
      )}
    >
      <span className="text-subtle">{icon}</span>
      {label}
      {count ? (
        <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold tabular-nums text-accent-contrast">
          {count}
        </span>
      ) : null}
      <ChevronDown
        className={cn(
          "h-3.5 w-3.5 text-faint transition-transform motion-reduce:transition-none",
          open && "rotate-180",
        )}
      />
    </span>
  );
}

/* A selectable row inside a popover menu. */
function MenuRow({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // min-h-11 for 44px touch targets on mobile; md:min-h-0 so desktop
        // popovers (which only render at md+) stay pixel-identical.
        "flex w-full min-h-11 md:min-h-0 items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] transition-colors",
        selected ? "text-foreground" : "text-subtle hover:bg-overlay",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
          selected
            ? "border-accent bg-accent text-accent-contrast"
            : "border-hairline-strong text-transparent",
        )}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      <span className="flex flex-1 items-center gap-2">{children}</span>
    </button>
  );
}

const SEV_COLOR: Record<number, string> = {
  1: "#34c759",
  2: "#a3e635",
  3: "#ff9f0a",
  4: "#ff6b22",
  5: "#ff453a",
};

function TeamRow({
  teamId,
  selected,
  onClick,
}: {
  teamId: TeamId;
  selected: boolean;
  onClick: () => void;
}) {
  const team = TEAMS[teamId];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2 rounded-[8px] px-2 py-2 text-left transition-colors",
        selected ? "bg-overlay-strong" : "hover:bg-overlay",
      )}
    >
      <span
        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-hairline-strong"
        style={{ backgroundColor: team.color }}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "text-[13px] font-medium",
            selected ? "text-foreground" : "text-foreground",
          )}
        >
          {team.shortLabel}
        </span>
        <span className="line-clamp-2 text-[11px] leading-snug text-faint">
          {team.duties}
        </span>
      </span>
      {selected && (
        <Check
          className="mt-1 h-3.5 w-3.5 shrink-0 text-accent-text"
          strokeWidth={3}
        />
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile sheet section header                                         */
/* ------------------------------------------------------------------ */

function SheetSection({
  icon,
  title,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
          {icon}
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function FilterBar() {
  const { filter, patch, reset, isDefault } = useFilters();
  const [sheetOpen, setSheetOpen] = useState(false);

  const statusCount = filter.statuses.length;
  const categoryCount = filter.categories.length;
  const sevActive = filter.minSeverity > 1;
  const activeTeam = TEAMS[filter.team];
  const teamScoped = filter.team !== "all";

  const rangeLabel = PRESET_LABELS[filter.preset];

  // Total active-filter count for the mobile badge.
  // Preset contributes only when it differs from the default ("30d"), so
  // an untouched filter always shows 0 — matching isDefault semantics.
  const activeCount =
    statusCount +
    categoryCount +
    (sevActive ? 1 : 0) +
    (teamScoped ? 1 : 0) +
    (filter.preset !== DEFAULT_FILTER.preset ? 1 : 0);

  return (
    <>
      {/* ============================================================
          DESKTOP (md+): unchanged inline bar
          ============================================================ */}
      <div className="hidden md:block rounded-[14px] border border-hairline bg-surface px-3 py-2.5">
        <style>{`@media (prefers-reduced-motion:no-preference){@keyframes popover-in{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}@keyframes popover-out{from{opacity:1;transform:none}to{opacity:0;transform:scale(.98)}}}`}</style>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <span className="inline-flex items-center gap-1.5 pr-1 text-[11px] font-medium uppercase tracking-wide text-faint">
            <ListFilter className="h-3.5 w-3.5" />
            Filters
          </span>

          {/* ---- Team selector: primary scoping decision ---- */}
          <Popover
            align="start"
            trigger={(open) => (
              <span
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-[10px] border px-2.5 text-[12px] font-medium transition-colors",
                  teamScoped
                    ? "border-hairline-strong text-white"
                    : "border-hairline bg-overlay text-subtle hover:border-hairline-strong hover:text-foreground",
                  open && "border-hairline-strong",
                )}
                style={
                  teamScoped
                    ? {
                        backgroundColor: `${activeTeam.color}1f`,
                        borderColor: `${activeTeam.color}66`,
                      }
                    : undefined
                }
              >
                {teamScoped ? (
                  <Shield
                    className="h-3.5 w-3.5"
                    style={{ color: activeTeam.color }}
                  />
                ) : (
                  <Users className="h-3.5 w-3.5 text-subtle" />
                )}
                <span className="text-subtle">Team:</span>
                <span className="text-foreground">{activeTeam.shortLabel}</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-faint transition-transform motion-reduce:transition-none",
                    open && "rotate-180",
                  )}
                />
              </span>
            )}
          >
            {(close) => (
              <div className="w-[20rem] p-0.5">
                <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
                  <span className="text-[11px] uppercase tracking-wide text-faint">
                    Switch team view
                  </span>
                  {teamScoped && (
                    <button
                      type="button"
                      onClick={() => {
                        patch({ team: "all" });
                        close();
                      }}
                      className="text-[11px] font-medium text-subtle hover:text-foreground hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="max-h-[24rem] overflow-y-auto">
                  {TEAM_LIST.map((team) => (
                    <TeamRow
                      key={team.id}
                      teamId={team.id}
                      selected={filter.team === team.id}
                      onClick={() => {
                        patch({ team: team.id });
                        close();
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </Popover>

          {/* ---- Date range: segmented control + custom popover ---- */}
          <div className="relative inline-flex items-center rounded-[10px] border border-hairline bg-overlay p-0.5">
            {PRESETS.filter((p) => p !== "custom").map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => patch({ preset: p })}
                className={cn(
                  "relative z-10 rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors",
                  filter.preset === p
                    ? "bg-foreground text-background"
                    : "text-subtle hover:text-foreground",
                )}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
            <Popover
              trigger={(open) => (
                <span
                  className={cn(
                    "relative z-10 inline-flex items-center gap-1 rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors",
                    filter.preset === "custom"
                      ? "bg-foreground text-background shadow-[var(--shadow-card)]"
                      : "text-subtle hover:text-foreground",
                    open && filter.preset !== "custom" && "text-foreground",
                  )}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Custom
                </span>
              )}
            >
              {() => (
                <div className="w-[15rem] p-1.5">
                  <p className="px-1 pb-2 text-[11px] uppercase tracking-wide text-faint">
                    Custom range
                  </p>
                  <label className="mb-1.5 block">
                    <span className="mb-1 block text-[11px] text-subtle">
                      From
                    </span>
                    <input
                      type="date"
                      value={filter.from ?? ""}
                      onChange={(e) =>
                        patch({
                          preset: "custom",
                          from: e.target.value || null,
                        })
                      }
                      className="w-full rounded-[8px] border border-hairline bg-overlay px-2 py-1.5 text-[12px] text-foreground outline-none focus:border-hairline-strong"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-subtle">
                      To
                    </span>
                    <input
                      type="date"
                      value={filter.to ?? ""}
                      onChange={(e) =>
                        patch({ preset: "custom", to: e.target.value || null })
                      }
                      className="w-full rounded-[8px] border border-hairline bg-overlay px-2 py-1.5 text-[12px] text-foreground outline-none focus:border-hairline-strong"
                    />
                  </label>
                </div>
              )}
            </Popover>
          </div>

          {/* ---- Min severity popover ---- */}
          <Popover
            trigger={(open) => (
              <TriggerPill
                icon={<Gauge className="h-3.5 w-3.5" />}
                label={sevActive ? `Sev ${filter.minSeverity}+` : "Severity"}
                active={sevActive}
                open={open}
              />
            )}
          >
            {() => (
              <div className="w-[12rem] p-0.5">
                <p className="px-2 pb-1.5 pt-1 text-[11px] uppercase tracking-wide text-faint">
                  Minimum severity
                </p>
                {SEVERITIES.map((s) => (
                  <MenuRow
                    key={s}
                    selected={filter.minSeverity === s}
                    onClick={() => patch({ minSeverity: s })}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: SEV_COLOR[s] }}
                    />
                    <span className="flex-1">
                      {s}+{" "}
                      <span className="text-faint">
                        {s === 1 ? "(all)" : `& above`}
                      </span>
                    </span>
                  </MenuRow>
                ))}
              </div>
            )}
          </Popover>

          {/* ---- Status multi-select popover ---- */}
          <Popover
            trigger={(open) => (
              <TriggerPill
                icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
                label="Status"
                count={statusCount}
                active={statusCount > 0}
                open={open}
              />
            )}
          >
            {() => (
              <div className="w-[13rem] p-0.5">
                <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
                  <span className="text-[11px] uppercase tracking-wide text-faint">
                    Status
                  </span>
                  {statusCount > 0 && (
                    <button
                      type="button"
                      onClick={() => patch({ statuses: [] })}
                      className="text-[11px] font-medium text-subtle hover:text-foreground hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {STATUS_OPTIONS.map(({ value, label }) => (
                  <MenuRow
                    key={value}
                    selected={filter.statuses.includes(value)}
                    onClick={() =>
                      patch({ statuses: toggle(filter.statuses, value) })
                    }
                  >
                    {label}
                  </MenuRow>
                ))}
              </div>
            )}
          </Popover>

          {/* ---- Category multi-select popover (with category colors) ---- */}
          <Popover
            trigger={(open) => (
              <TriggerPill
                icon={<Shapes className="h-3.5 w-3.5" />}
                label="Category"
                count={categoryCount}
                active={categoryCount > 0}
                open={open}
              />
            )}
          >
            {() => (
              <div className="w-[15rem] p-0.5">
                <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
                  <span className="text-[11px] uppercase tracking-wide text-faint">
                    Category
                  </span>
                  {categoryCount > 0 && (
                    <button
                      type="button"
                      onClick={() => patch({ categories: [] })}
                      className="text-[11px] font-medium text-subtle hover:text-foreground hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="max-h-[15rem] overflow-y-auto">
                  {CATEGORIES.map(([cat, meta]) => (
                    <MenuRow
                      key={cat}
                      selected={filter.categories.includes(cat)}
                      onClick={() =>
                        patch({ categories: toggle(filter.categories, cat) })
                      }
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-hairline-strong"
                        style={{ backgroundColor: meta.color }}
                      />
                      {meta.label}
                    </MenuRow>
                  ))}
                </div>
              </div>
            )}
          </Popover>

          {/* ---- Active category chips (colored) + reset ---- */}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {filter.categories.map((cat) => {
              const meta = CATEGORY_META[cat];
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() =>
                    patch({ categories: toggle(filter.categories, cat) })
                  }
                  className="group inline-flex h-7 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium text-white transition-[colors,transform] active:scale-95 active:opacity-70 motion-reduce:active:scale-100"
                  style={{
                    borderColor: `${meta.color}66`,
                    backgroundColor: `${meta.color}1f`,
                  }}
                  title={`Remove ${meta.label}`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                  {meta.label}
                  <X className="h-3 w-3 text-white/60 group-hover:text-white" />
                </button>
              );
            })}

            {!isDefault && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-hairline bg-overlay px-2.5 text-[11px] font-medium text-subtle transition-colors hover:border-[#ff9f0a]/40 hover:text-[#ff9f0a]"
              >
                <X className="h-3 w-3" />
                Reset
                <span className="text-faint">·</span>
                <span className="text-faint">{rangeLabel}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================
          MOBILE (<md): single trigger button + BottomSheet
          ============================================================ */}
      <div className="md:hidden">
        <button
          type="button"
          aria-label="Open filters"
          onClick={() => setSheetOpen(true)}
          className={cn(
            "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] border px-4 py-2.5 text-[14px] font-medium transition-colors",
            activeCount > 0
              ? "border-hairline-strong bg-overlay-strong text-foreground"
              : "border-hairline bg-surface text-subtle active:bg-overlay",
          )}
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold tabular-nums text-accent-contrast">
              {activeCount}
            </span>
          )}
        </button>

        <BottomSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Filters"
        >
          {/* --- Team section --- */}
          <SheetSection
            icon={<Users className="h-3.5 w-3.5" />}
            title="Team"
            action={
              teamScoped ? (
                <button
                  type="button"
                  onClick={() => patch({ team: "all" })}
                  className="min-h-11 px-2 py-1.5 text-[12px] font-medium text-foreground"
                >
                  Clear
                </button>
              ) : undefined
            }
          >
            <div className="space-y-0.5">
              {TEAM_LIST.map((team) => (
                <TeamRow
                  key={team.id}
                  teamId={team.id}
                  selected={filter.team === team.id}
                  onClick={() => patch({ team: team.id })}
                />
              ))}
            </div>
          </SheetSection>

          {/* --- Date range section --- */}
          <SheetSection
            icon={<Calendar className="h-3.5 w-3.5" />}
            title="Date range"
          >
            {/* Preset buttons — 2-per-row grid so they're finger-friendly */}
            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {PRESETS.filter((p) => p !== "custom").map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => patch({ preset: p })}
                  className={cn(
                    "min-h-11 rounded-[10px] px-2 py-2 text-[13px] font-medium transition-colors",
                    filter.preset === p
                      ? "bg-foreground text-background"
                      : "border border-hairline bg-overlay text-subtle",
                  )}
                >
                  {PRESET_LABELS[p]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => patch({ preset: "custom" })}
                className={cn(
                  "col-span-3 min-h-11 rounded-[10px] px-2 py-2 text-[13px] font-medium transition-colors",
                  filter.preset === "custom"
                    ? "bg-foreground text-background"
                    : "border border-hairline bg-overlay text-subtle",
                )}
              >
                Custom range
              </button>
            </div>
            {filter.preset === "custom" && (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] text-subtle">
                    From
                  </span>
                  <input
                    type="date"
                    value={filter.from ?? ""}
                    onChange={(e) =>
                      patch({ preset: "custom", from: e.target.value || null })
                    }
                    className="w-full rounded-[10px] border border-hairline bg-overlay px-3 py-2.5 text-base text-foreground outline-none focus:border-hairline-strong"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] text-subtle">
                    To
                  </span>
                  <input
                    type="date"
                    value={filter.to ?? ""}
                    onChange={(e) =>
                      patch({ preset: "custom", to: e.target.value || null })
                    }
                    className="w-full rounded-[10px] border border-hairline bg-overlay px-3 py-2.5 text-base text-foreground outline-none focus:border-hairline-strong"
                  />
                </label>
              </div>
            )}
          </SheetSection>

          {/* --- Severity section --- */}
          <SheetSection
            icon={<Gauge className="h-3.5 w-3.5" />}
            title="Minimum severity"
            action={
              sevActive ? (
                <button
                  type="button"
                  onClick={() => patch({ minSeverity: 1 })}
                  className="min-h-11 px-2 py-1.5 text-[12px] font-medium text-foreground"
                >
                  Clear
                </button>
              ) : undefined
            }
          >
            <div className="grid grid-cols-5 gap-1.5">
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => patch({ minSeverity: s })}
                  className={cn(
                    "flex min-h-11 flex-col items-center justify-center gap-1 rounded-[10px] border py-2 text-[13px] font-medium transition-colors",
                    filter.minSeverity === s
                      ? "border-transparent text-white"
                      : "border-hairline bg-overlay text-subtle",
                  )}
                  style={
                    filter.minSeverity === s
                      ? {
                          backgroundColor: `${SEV_COLOR[s]}30`,
                          borderColor: `${SEV_COLOR[s]}60`,
                          color: SEV_COLOR[s],
                        }
                      : undefined
                  }
                  aria-label={`Severity ${s}${s === 1 ? " (all)" : " and above"}`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: SEV_COLOR[s] }}
                    aria-hidden
                  />
                  {s}+
                </button>
              ))}
            </div>
          </SheetSection>

          {/* --- Status section --- */}
          <SheetSection
            icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
            title="Status"
            action={
              statusCount > 0 ? (
                <button
                  type="button"
                  onClick={() => patch({ statuses: [] })}
                  className="min-h-11 px-2 py-1.5 text-[12px] font-medium text-foreground"
                >
                  Clear
                </button>
              ) : undefined
            }
          >
            <div className="space-y-0.5">
              {STATUS_OPTIONS.map(({ value, label }) => (
                <MenuRow
                  key={value}
                  selected={filter.statuses.includes(value)}
                  onClick={() =>
                    patch({ statuses: toggle(filter.statuses, value) })
                  }
                >
                  {label}
                </MenuRow>
              ))}
            </div>
          </SheetSection>

          {/* --- Category section --- */}
          <SheetSection
            icon={<Shapes className="h-3.5 w-3.5" />}
            title="Category"
            action={
              categoryCount > 0 ? (
                <button
                  type="button"
                  onClick={() => patch({ categories: [] })}
                  className="min-h-11 px-2 py-1.5 text-[12px] font-medium text-foreground"
                >
                  Clear
                </button>
              ) : undefined
            }
          >
            <div className="space-y-0.5">
              {CATEGORIES.map(([cat, meta]) => (
                <MenuRow
                  key={cat}
                  selected={filter.categories.includes(cat)}
                  onClick={() =>
                    patch({ categories: toggle(filter.categories, cat) })
                  }
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-hairline-strong"
                    style={{ backgroundColor: meta.color }}
                    aria-hidden
                  />
                  {meta.label}
                </MenuRow>
              ))}
            </div>
          </SheetSection>

          {/* --- Pinned footer: Apply + Reset ---
              sticky bottom-0 sits above the sheet's own pb-safe — no double-adding */}
          <div className="sticky bottom-0 flex gap-3 border-t border-hairline bg-[var(--color-surface)] pt-3">
            {!isDefault && (
              <button
                type="button"
                onClick={() => {
                  reset();
                  setSheetOpen(false);
                }}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-hairline bg-overlay text-[14px] font-medium text-subtle transition-colors active:bg-overlay-strong"
              >
                <X className="h-4 w-4" aria-hidden />
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[14px] bg-accent text-[14px] font-semibold text-accent-contrast transition-opacity active:opacity-80"
            >
              Show results
            </button>
          </div>
        </BottomSheet>
      </div>
    </>
  );
}
