"use client";

import { CATEGORY_META } from "@/lib/dashboard-data";
import { useFilters } from "@/lib/filters/context";
import { type DateRangePreset, PRESET_LABELS } from "@/lib/filters/types";
import { TEAM_LIST, TEAMS, type TeamId } from "@/lib/teams";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
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
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

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
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="contents"
      >
        {trigger(open)}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          className={cn(
            "absolute top-[calc(100%+6px)] z-50 min-w-[13rem] origin-top",
            "rounded-[14px] border border-white/[0.08] bg-[#1c1c1e] p-1.5",
            "shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)] ring-1 ring-black/40",
            "animate-[popover-in_120ms_ease-out]",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {children(() => setOpen(false))}
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
          ? "border-[#0a84ff]/40 bg-[#0a84ff]/10 text-white"
          : "border-white/[0.08] bg-white/[0.02] text-zinc-300 hover:border-white/15 hover:text-white",
      )}
    >
      <span className="text-zinc-400">{icon}</span>
      {label}
      {count ? (
        <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0a84ff] px-1 text-[10px] font-semibold tabular-nums text-white">
          {count}
        </span>
      ) : null}
      <ChevronDown
        className={cn(
          "h-3.5 w-3.5 text-zinc-500 transition-transform",
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
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] transition-colors",
        selected ? "text-white" : "text-zinc-300 hover:bg-white/[0.04]",
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
          selected
            ? "border-[#0a84ff] bg-[#0a84ff] text-white"
            : "border-white/15 text-transparent",
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
        selected ? "bg-white/[0.06]" : "hover:bg-white/[0.04]",
      )}
    >
      <span
        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-white/10"
        style={{ backgroundColor: team.color }}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "text-[13px] font-medium",
            selected ? "text-white" : "text-zinc-200",
          )}
        >
          {team.shortLabel}
        </span>
        <span className="line-clamp-2 text-[11px] leading-snug text-zinc-500">
          {team.duties}
        </span>
      </span>
      {selected && (
        <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-[#0a84ff]" strokeWidth={3} />
      )}
    </button>
  );
}

export function FilterBar() {
  const { filter, patch, reset, isDefault } = useFilters();

  const statusCount = filter.statuses.length;
  const categoryCount = filter.categories.length;
  const sevActive = filter.minSeverity > 1;
  const activeTeam = TEAMS[filter.team];
  const teamScoped = filter.team !== "all";

  const rangeLabel = PRESET_LABELS[filter.preset];

  return (
    <div className="rounded-[14px] border border-white/[0.06] bg-[#1c1c1e] px-3 py-2.5">
      <style>{`@keyframes popover-in{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}`}</style>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span className="inline-flex items-center gap-1.5 pr-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
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
                  ? "border-white/15 text-white"
                  : "border-white/[0.08] bg-white/[0.02] text-zinc-300 hover:border-white/15 hover:text-white",
                open && "border-white/20",
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
                <Users className="h-3.5 w-3.5 text-zinc-400" />
              )}
              <span className="text-zinc-400">Team:</span>
              <span className="text-white">{activeTeam.shortLabel}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-zinc-500 transition-transform",
                  open && "rotate-180",
                )}
              />
            </span>
          )}
        >
          {(close) => (
            <div className="w-[20rem] p-0.5">
              <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Switch team view
                </span>
                {teamScoped && (
                  <button
                    type="button"
                    onClick={() => {
                      patch({ team: "all" });
                      close();
                    }}
                    className="text-[11px] text-[#0a84ff] hover:underline"
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
        <div className="inline-flex items-center rounded-[10px] border border-white/[0.08] bg-black/30 p-0.5">
          {PRESETS.filter((p) => p !== "custom").map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => patch({ preset: p })}
              className={cn(
                "rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors",
                filter.preset === p
                  ? "bg-[#0a84ff] text-white shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                  : "text-zinc-400 hover:text-white",
              )}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
          <Popover
            trigger={(open) => (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors",
                  filter.preset === "custom"
                    ? "bg-[#0a84ff] text-white shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                    : "text-zinc-400 hover:text-white",
                  open && filter.preset !== "custom" && "text-white",
                )}
              >
                <Calendar className="h-3.5 w-3.5" />
                Custom
              </span>
            )}
          >
            {() => (
              <div className="w-[15rem] p-1.5">
                <p className="px-1 pb-2 text-[11px] uppercase tracking-wide text-zinc-500">
                  Custom range
                </p>
                <label className="mb-1.5 block">
                  <span className="mb-1 block text-[11px] text-zinc-400">
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
                    className="w-full rounded-[8px] border border-white/10 bg-black/40 px-2 py-1.5 text-[12px] text-zinc-200 outline-none focus:border-[#0a84ff]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-zinc-400">To</span>
                  <input
                    type="date"
                    value={filter.to ?? ""}
                    onChange={(e) =>
                      patch({ preset: "custom", to: e.target.value || null })
                    }
                    className="w-full rounded-[8px] border border-white/10 bg-black/40 px-2 py-1.5 text-[12px] text-zinc-200 outline-none focus:border-[#0a84ff]"
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
              <p className="px-2 pb-1.5 pt-1 text-[11px] uppercase tracking-wide text-zinc-500">
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
                    <span className="text-zinc-500">
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
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Status
                </span>
                {statusCount > 0 && (
                  <button
                    type="button"
                    onClick={() => patch({ statuses: [] })}
                    className="text-[11px] text-[#0a84ff] hover:underline"
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
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Category
                </span>
                {categoryCount > 0 && (
                  <button
                    type="button"
                    onClick={() => patch({ categories: [] })}
                    className="text-[11px] text-[#0a84ff] hover:underline"
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
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-white/10"
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
                className="group inline-flex h-7 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium text-white transition-colors"
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
              className="inline-flex h-7 items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 text-[11px] font-medium text-zinc-400 transition-colors hover:border-[#ff9f0a]/40 hover:text-[#ff9f0a]"
            >
              <X className="h-3 w-3" />
              Reset
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-500">{rangeLabel}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
