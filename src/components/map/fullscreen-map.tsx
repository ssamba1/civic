"use client";

import {
  CheckCircle2,
  ChevronDown,
  Clock,
  ListFilter,
  Send,
  Shield,
  Sliders,
  Star,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dispatchWorkOrderForReport } from "@/app/staff/actions";
import { DemoInject } from "@/components/map/demo-inject";
import type { MarkerColorMode } from "@/components/map/pin-icons";
import type { MapTheme } from "@/components/map/report-map";
import { ReportMapLazy as ReportMap } from "@/components/map/report-map-lazy";
import { UpvoteButton } from "@/components/resident/upvote-button";
import BottomSheet from "@/components/ui/bottom-sheet";
import {
  glassChrome,
  glassSheen,
  LiquidGlassCard,
} from "@/components/ui/liquid-glass";
import { useCategoryOverrides } from "@/lib/category-overrides";
import type { DashboardReport } from "@/lib/dashboard-data";
import { categoryMeta } from "@/lib/dashboard-data";
import { useDemoReports } from "@/lib/demo-reports";
import { STATUS_LABEL } from "@/lib/status";
import {
  categoryToTeam,
  TEAM_LIST,
  TEAMS as TEAM_META,
  type TeamId,
} from "@/lib/teams";
import { useTheme } from "@/lib/theme";
import type { ReportCategory, ReportStatus } from "@/lib/types";

interface FullscreenMapOrchestratorProps {
  reports: DashboardReport[];
  center: [number, number];
  zoom: number;
  cityName: string;
  // Team view: scope + lock the map to this team. Hides the team switcher and
  // the cross-team dispatch/override actions ("no other team things"), while
  // keeping the identical fullscreen chrome + filter panel as the city map.
  lockedTeam?: TeamId;
  // Resident community view: same map + side list, but no gov affordances —
  // hides the team scoping, the per-team chip, and all dispatch/route actions,
  // and shows an optimistic upvote on each list row instead. Default false, so
  // every existing (gov) call site is byte-identical.
  readOnly?: boolean;
}

// Text color for the incident-feed status label. This panel (dispatch
// sidebar/sheet) is structurally forced-dark regardless of the app's
// light/dark theme setting (bg-black/* scrim, text-white siblings), so it
// intentionally stays off the canonical --status-*-fg tokens — those are
// tuned per-theme (dark-on-white in light mode) and would go near-invisible
// on this always-dark surface. Kept local on purpose.
//
// Hue mapping mirrors report-map.tsx's statusColor() (the marker/legend
// vocabulary): closed=success, dispatched/in_progress=info slate (same tone
// per lib/status.ts STATUS_TONE — both read as "routed/active", distinct
// from open), open=warning. The muted FILL tokens themselves
// (#3d9a63/#c08a1d/#5b6b8c) sit
// under 4.5:1 as 12px text on this panel's worst case (selected row
// #3c3c42: 3.13/3.60/2.05), so these are lightness-lifted text variants of
// the same hues — the dark-panel analog of the .dark --status-*-fg lift:
// success #55c081 (4.82:1), warning #d9a83c (5.02:1), slate #9db0d3
// (5.00:1), all vs #3c3c42; ≥7.5:1 vs the base #1c1c1e panel chrome.
const STATUS_TEXT_COLOR: Record<string, string> = {
  open: "text-[#d9a83c]",
  dispatched: "text-[#9db0d3]",
  in_progress: "text-[#9db0d3]",
  closed: "text-[#55c081]",
};

// Lightweight prefers-reduced-motion subscription. Returns true when the OS
// requests reduced motion so stagger delays + slide-ins can be neutralized.
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function FullscreenMapOrchestrator({
  reports: initialReports,
  center,
  zoom,
  lockedTeam,
  readOnly = false,
}: FullscreenMapOrchestratorProps) {
  // Local status overrides keyed by report id (e.g. an in-session dispatch).
  // Overlaid onto the live `initialReports` prop at render time rather than
  // forking a stale copy of it — so a refreshed corpus (real-time row, a task
  // marked done → "closed") still flows through while local dispatches persist.
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, ReportStatus>
  >({});

  // Subscribe to category-level routing overrides. `categoryToTeam` reads
  // the module-level snapshot, but the memo'd filter below needs a dep
  // that ticks when a dispatcher re-aims a category from the routing
  // matrix — that's what `categoryOverrides` provides here.
  const { overrides: categoryOverrides } = useCategoryOverrides();

  // Live demo overlay — the presenter-injected report(s). Prepended (newest
  // first) so a freshly injected point lands at the very top of the Dispatch
  // list and renders on the map. This map route is server-rendered and sits
  // outside FilterProvider, so we merge the overlay here rather than relying
  // on the shared corpus that powers the Teams/analytics surfaces.
  const { demoReports } = useDemoReports();
  const allReports = useMemo(() => {
    const base = demoReports.length
      ? [...demoReports, ...initialReports]
      : initialReports;
    if (Object.keys(statusOverrides).length === 0) return base;
    return base.map((r) =>
      statusOverrides[r.id] ? { ...r, status: statusOverrides[r.id] } : r,
    );
  }, [demoReports, initialReports, statusOverrides]);

  // --- Map theme (lifted from ReportMap so Dispatch panel can react) ---
  // Basemap tracks the app's light/dark theme so the map reads as part of the
  // same surface as the sidebar/chrome. `satellite` is a deliberate override
  // (picked from the map controls), so a theme flip leaves it alone. Init to
  // "dark" to match the SSR default, then the effect reconciles to the real
  // theme on mount before the lazy map paints — no hydration mismatch.
  const { theme: appTheme } = useTheme();
  const [mapTheme, setMapTheme] = useState<MapTheme>("dark");
  useEffect(() => {
    setMapTheme((cur) => (cur === "satellite" ? cur : appTheme));
  }, [appTheme]);

  // --- Marker color mode (lifted from ReportMap so the Dispatch panel's
  // "Color by" control and the map's own gear-panel control stay in sync —
  // same lift pattern as mapTheme above). ---
  const [colorMode, setColorMode] = useState<MarkerColorMode>("progress");

  // --- Active Filters State ---
  // Team view seeds + locks the team scope; city view starts at "all".
  const [selectedTeam, setSelectedTeam] = useState<TeamId>(lockedTeam ?? "all");
  const [selectedCategory, setSelectedCategory] =
    useState<ReportCategory | null>(null);
  const [minSeverity, setMinSeverity] = useState<number>(1);
  // Default to live work only — open / dispatched / in-progress. Completed
  // (closed/resolved) is hidden by default on both the city and team maps so
  // they read as "what's active", not the full resolved archive. Users can
  // re-enable Resolved via the status filter.
  const [activeStatuses, setActiveStatuses] = useState<ReportStatus[]>([
    "open",
    "dispatched",
    "in_progress",
  ]);
  const activeTeamMeta = TEAM_META[selectedTeam];

  const reducedMotion = useReducedMotion();

  // --- Interaction & Selection States ---
  const [focusedReportId, setFocusedReportId] = useState<string | null>(null);

  // Report id whose auto-dispatch server action is in flight — drives the inline
  // button spinner + disabled state so the click registers as "working".
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  // Toast exit choreography: when the auto-dismiss timer fires we first flip
  // `toastLeaving` to play the slide-out, then null the notification.
  const [toastLeaving, setToastLeaving] = useState(false);

  // Routing UI state: keeps track of which report ID has the routing dropdown active
  const [activeRouteMenuId, setActiveRouteMenuId] = useState<string | null>(
    null,
  );

  // Stable marker-select handler so the memo'd ReportMap doesn't see a new
  // function reference each render.
  const handleSelectMarker = useCallback((id: string) => {
    setFocusedReportId(id);
  }, []);

  // Success notifications/routing notifications
  const [routeNotification, setRouteNotification] = useState<{
    message: string;
    reportId: string;
  } | null>(null);

  // Auto-dismiss timer for the route toast — held in a ref so it can be
  // cancelled on unmount (no setState on a dead component) and reset when a
  // new dispatch fires before the previous toast has cleared.
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(
    () => () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
    },
    [],
  );

  // --- Filter Logic ---
  // biome-ignore lint/correctness/useExhaustiveDependencies: categoryOverrides isn't referenced literally, but categoryToTeam() reads a snapshot it mutates — keeping it forces recompute when a dispatcher re-aims a category.
  const filteredReports = useMemo(() => {
    return allReports.filter((report) => {
      if (
        selectedTeam !== "all" &&
        categoryToTeam(report.category) !== selectedTeam
      ) {
        return false;
      }
      if (selectedCategory && report.category !== selectedCategory)
        return false;
      if (report.severity < minSeverity) return false;
      if (!activeStatuses.includes(report.status)) return false;
      return true;
    });
  }, [
    allReports,
    selectedTeam,
    selectedCategory,
    minSeverity,
    activeStatuses,
    categoryOverrides,
  ]);

  // Toggle status filter helper — useCallback so it's a stable dep for dispatchPanelContent's useMemo.
  const handleToggleStatus = useCallback((status: ReportStatus) => {
    setActiveStatuses((prev) => {
      if (prev.includes(status)) {
        return prev.length > 1 ? prev.filter((s) => s !== status) : prev;
      }
      return [...prev, status];
    });
  }, []);

  // Mobile: bottom-sheet open state for dispatch panel
  const [isDispatchSheetOpen, setIsDispatchSheetOpen] = useState(false);

  // Schedule a toast dismissal that plays the exit animation first (set leaving
  // → wait for the 200ms slide-out → null). Reused by every toast path so the
  // toast never pops off the DOM instantly. ref-held timers stay cancellable.
  const dismissToast = useCallback((delay: number) => {
    if (notificationTimerRef.current)
      clearTimeout(notificationTimerRef.current);
    notificationTimerRef.current = setTimeout(() => {
      setToastLeaving(true);
      notificationTimerRef.current = setTimeout(() => {
        setRouteNotification(null);
        setToastLeaving(false);
      }, 200);
    }, delay);
  }, []);

  // Route/Assign to team action — optimistic update + server write with rollback.
  const handleRouteToTeam = useCallback(
    async (reportId: string, teamId: TeamId) => {
      // Optimistic: overlay dispatched status immediately for snappy UI.
      setStatusOverrides((prev) => ({ ...prev, [reportId]: "dispatched" }));
      setActiveRouteMenuId(null);
      setDispatchingId(reportId);

      // Show HUD notification optimistically.
      setToastLeaving(false);
      setRouteNotification({
        message: `Dispatched to ${TEAM_META[teamId].shortLabel}!`,
        reportId,
      });
      dismissToast(3500);

      // The map surface receives reports, not work orders — dispatch via the
      // report-id variant which resolves the linked work order server-side.
      const result = await dispatchWorkOrderForReport(reportId);
      setDispatchingId((cur) => (cur === reportId ? null : cur));
      if (!result.ok) {
        // Rollback optimistic override on failure.
        setStatusOverrides((prev) => {
          const next = { ...prev };
          delete next[reportId];
          return next;
        });
        setToastLeaving(false);
        setRouteNotification({
          message: `Dispatch failed: ${result.error}`,
          reportId,
        });
        dismissToast(4000);
      }
    },
    [dismissToast],
  );

  // Human-readable category list for dropdowns
  const categoriesList = useMemo(() => {
    const list: { key: ReportCategory; label: string }[] = [];
    allReports.forEach((r) => {
      const meta = categoryMeta(r.category);
      if (meta && !list.find((item) => item.key === r.category)) {
        list.push({ key: r.category, label: meta.label });
      }
    });
    return list;
  }, [allReports]);

  // Memoized so neither the desktop sidebar nor the mobile bottom-sheet re-renders
  // when unrelated state (e.g. focusedReportId timer) changes.
  const dispatchPanelContent = useMemo(
    () => (
      <div className="flex flex-col gap-3 h-full overflow-y-auto custom-scrollbar pr-1 select-none">
        <style>{`
        @keyframes emptyBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes fmCardIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fmEmptyIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
        @keyframes fmToastIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fmToastOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-4px)}}
        @keyframes fmFadeIn{from{opacity:0}to{opacity:1}}
      `}</style>
        {/* Active team banner */}
        {selectedTeam !== "all" && (
          <div
            className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 shrink-0"
            style={{
              borderColor: `${activeTeamMeta.color}99`,
            }}
          >
            <Shield
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: activeTeamMeta.color }}
              strokeWidth={1.75}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-white/80">
                Viewing as
              </p>
              <p className="text-[12px] font-medium text-white leading-tight truncate">
                {activeTeamMeta.shortLabel}
              </p>
            </div>
            {!lockedTeam && (
              <button
                type="button"
                onClick={() => setSelectedTeam("all")}
                className="text-white/80 hover:text-white p-0.5 rounded min-h-[44px] min-w-[44px] flex items-center justify-center lg:min-h-0 lg:min-w-0"
                title="Switch back to All Teams"
                aria-label="Switch back to All Teams"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            )}
          </div>
        )}

        {/* Route confirmation toast */}
        {routeNotification && (
          <div
            className="bg-[var(--color-success)]/15 border border-[var(--color-success)]/30 rounded-lg p-3 flex items-center gap-2 shrink-0"
            style={
              reducedMotion
                ? undefined
                : {
                    animation: toastLeaving
                      ? "fmToastOut 200ms cubic-bezier(0.4,0,1,1) forwards"
                      : "fmToastIn 150ms cubic-bezier(0.16,1,0.3,1)",
                  }
            }
          >
            <CheckCircle2
              className="w-4 h-4 text-[var(--color-success)] shrink-0"
              strokeWidth={1.75}
            />
            <p className="text-[13px] text-white/90 leading-tight">
              {routeNotification.message}
            </p>
          </div>
        )}

        {/* Divider — separates the filter section from whatever renders
            above it (team banner / route toast, or the panel header when
            neither is present). Filters are a flat section now, not a
            nested card, so this hairline is the only separation. */}
        <div className="border-t border-white/10" />

        {/* Quick filters — flat section inside the panel. No inner card
            bg/border/radius: the outer LiquidGlassCard IS the panel's one
            card, nesting a second elevated surface here reads as a
            vibecoded double-card. */}
        <div className="p-3 flex flex-col gap-3">
          {/* Team — primary scoping. Hidden in the team view (locked) and the
            resident community view (no team concept). */}
          {!lockedTeam && !readOnly && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="map-team-select"
                className="text-[12px] text-white flex items-center gap-1.5"
              >
                <Shield className="w-3 h-3" strokeWidth={1.75} />
                Team view
              </label>
              <div className="relative">
                <select
                  id="map-team-select"
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value as TeamId)}
                  className="w-full bg-[#232327] rounded-md px-3 py-2 text-base text-white focus:outline-none focus:ring-2 focus:ring-white/30 cursor-pointer appearance-none pr-8 transition-shadow lg:py-1.5 lg:text-[13px]"
                >
                  {TEAM_LIST.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.shortLabel}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/60 pointer-events-none"
                  strokeWidth={1.75}
                />
              </div>
              <p className="text-[11px] text-white/60 leading-snug">
                {activeTeamMeta.duties}
              </p>
            </div>
          )}

          {/* Category */}
          <div
            className={`flex flex-col gap-1.5 ${lockedTeam || readOnly ? "" : "border-t border-white/[0.06] pt-3"}`}
          >
            <label
              htmlFor="map-category-select"
              className="text-[12px] text-white"
            >
              Category
            </label>
            <div className="relative">
              <select
                id="map-category-select"
                value={selectedCategory || ""}
                onChange={(e) =>
                  setSelectedCategory(
                    (e.target.value as ReportCategory) || null,
                  )
                }
                className="w-full bg-[#232327] rounded-md px-3 py-2 text-base text-white focus:outline-none focus:ring-2 focus:ring-white/30 cursor-pointer appearance-none pr-8 transition-shadow lg:py-1.5 lg:text-[13px]"
              >
                <option value="">All categories</option>
                {categoriesList.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/60 pointer-events-none"
                strokeWidth={1.75}
              />
            </div>
          </div>

          {/* Severity */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[12px] text-white">
              <span>Min severity</span>
              <span className="text-white tabular-nums">{minSeverity}+</span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={minSeverity}
              onChange={(e) => setMinSeverity(parseInt(e.target.value, 10))}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
            />
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-3">
            <span className="text-[12px] text-white">Status</span>
            <div className="grid grid-cols-2 gap-1">
              {(["open", "dispatched", "in_progress", "closed"] as const).map(
                (s) => {
                  const isChecked = activeStatuses.includes(s);
                  return (
                    <button
                      type="button"
                      key={s}
                      onClick={() => handleToggleStatus(s)}
                      className={`rounded px-2 py-2 text-[12px] text-left transition-colors min-h-[44px] flex items-center lg:py-1 lg:min-h-0 ${
                        isChecked
                          ? "bg-white/[0.08] text-white"
                          : "bg-transparent text-white/80 hover:text-white hover:bg-white/[0.03]"
                      }`}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {/* Color by — single-select marker color mode. Mirrors Status's
              button classes above (same rounded/px/py/min-h/lg: pattern) but
              grid-cols-3 for the 3 mutually-exclusive modes instead of
              Status's grid-cols-2 multi-toggle. Lifted state (colorMode/
              setColorMode) keeps this in sync with the map's own gear-panel
              "Marker colors" control — whichever mode is picked here or
              there paints the same pins, including when the Dispatch panel
              is team-filtered (color-by-team still applies to whatever's
              visible; no special-casing). */}
          <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-3">
            <span className="text-[12px] text-white">Color by</span>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { key: "progress", label: "Progress" },
                  { key: "urgency", label: "Urgency" },
                  { key: "team", label: "Team" },
                ] as const
              ).map(({ key, label }) => {
                const isActive = colorMode === key;
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setColorMode(key)}
                    aria-pressed={isActive}
                    className={`rounded px-2 py-2 text-[12px] text-left transition-colors min-h-[44px] flex items-center lg:py-1 lg:min-h-0 ${
                      isActive
                        ? "bg-white/[0.08] text-white"
                        : "bg-transparent text-white/80 hover:text-white hover:bg-white/[0.03]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10" />

        {/* Incident Feed list */}
        <div className="space-y-2">
          {filteredReports.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center text-center p-6 text-white/60"
              style={
                reducedMotion
                  ? undefined
                  : { animation: "fmEmptyIn 200ms cubic-bezier(0.16,1,0.3,1)" }
              }
            >
              <Sliders
                className="w-7 h-7 opacity-25 mb-3"
                style={
                  reducedMotion
                    ? undefined
                    : { animation: "emptyBob 3s ease-in-out infinite" }
                }
              />
              <p className="text-sm text-white">No matching reports</p>
              <p className="text-xs text-white/60 mt-1">
                Adjust filters to see more.
              </p>
            </div>
          ) : (
            filteredReports.map((report, index) => {
              const meta = categoryMeta(report.category);
              const isSelected = focusedReportId === report.id;
              const isMenuOpen = activeRouteMenuId === report.id;
              const ownerTeamId = categoryToTeam(report.category);
              const ownerTeam = TEAM_META[ownerTeamId];

              return (
                // biome-ignore lint/a11y/useSemanticElements: role=button on a div that contains nested buttons; native <button> can't nest buttons
                <div
                  key={report.id}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setFocusedReportId(isSelected ? null : report.id)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setFocusedReportId(isSelected ? null : report.id);
                    }
                  }}
                  style={
                    reducedMotion
                      ? undefined
                      : {
                          animation:
                            "fmCardIn 150ms cubic-bezier(0.16,1,0.3,1) both",
                          animationDelay: `${Math.min(index * 30, 300)}ms`,
                        }
                  }
                  className={`p-3 rounded-lg transition-[background-color,transform] cursor-pointer flex items-stretch gap-2 min-h-[44px] lg:min-h-0 active:scale-[0.98] ${
                    isSelected
                      ? "bg-[#3c3c42]"
                      : "bg-transparent hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-white leading-tight">
                        {meta.label}
                      </span>
                      <span
                        className={`text-[12px] ${STATUS_TEXT_COLOR[report.status] ?? "text-white/80"}`}
                      >
                        {STATUS_LABEL[report.status]}
                      </span>
                    </div>

                    <p className="text-[12px] text-white leading-tight line-clamp-1">
                      {report.address}
                    </p>

                    {/* Auto-assigned team chip — gov only; residents don't route. */}
                    {!readOnly && (
                      <div
                        className="inline-flex self-start items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          borderColor: `${ownerTeam.color}aa`,

                          color: ownerTeam.color,
                        }}
                      >
                        {ownerTeam.shortLabel}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[12px] text-white/80">
                      <span
                        className="inline-flex items-center gap-1"
                        suppressHydrationWarning
                      >
                        <Clock className="w-3 h-3" strokeWidth={1.75} />
                        {formatTimeAgo(report.created_at)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Star className="w-3 h-3" strokeWidth={1.75} />
                        {report.severity}/5
                      </span>
                    </div>

                    {/* Route action — admin dispatch only; hidden in the team view
                    and the resident community (read-only) view. */}
                    {isSelected && !lockedTeam && !readOnly && (
                      <div
                        className="mt-2 pt-2.5 border-t border-white/[0.06] flex flex-col gap-2 relative z-20"
                        style={
                          reducedMotion
                            ? undefined
                            : { animation: "fmFadeIn 150ms ease-out" }
                        }
                      >
                        {!isMenuOpen ? (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRouteToTeam(report.id, ownerTeamId);
                              }}
                              disabled={
                                report.status === "closed" ||
                                dispatchingId === report.id
                              }
                              className="flex-1 py-2.5 bg-[#f4f4f5] hover:bg-[#d4d4d8] text-[#131316] rounded-md text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] lg:py-1.5 lg:min-h-0"
                            >
                              {dispatchingId === report.id ? (
                                <>
                                  <span className="w-3 h-3 rounded-full border-2 border-[#131316]/20 border-t-[#131316] animate-spin" />
                                  Dispatching
                                </>
                              ) : (
                                <>
                                  <Send
                                    className="w-3 h-3"
                                    strokeWidth={1.75}
                                  />
                                  Auto-dispatch
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveRouteMenuId(report.id);
                              }}
                              disabled={
                                report.status === "closed" ||
                                dispatchingId === report.id
                              }
                              className="px-3 py-2.5 bg-white/[0.1] hover:bg-white/[0.18] text-white rounded-md text-[12px] flex items-center justify-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] lg:py-1.5 lg:px-2 lg:min-h-0"
                              aria-label="Override target team"
                            >
                              Override
                            </button>
                          </div>
                        ) : (
                          <div
                            className="flex flex-col gap-1 bg-[#232327] rounded-md p-2 pointer-events-auto"
                            style={
                              reducedMotion
                                ? undefined
                                : { animation: "fmFadeIn 100ms ease-out" }
                            }
                          >
                            <div className="flex justify-between items-center pb-1 mb-1 text-[12px] text-white/80">
                              <span>Override target team</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveRouteMenuId(null);
                                }}
                                className="p-2 hover:bg-white/[0.06] rounded text-white/80 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center lg:p-0.5 lg:min-h-0 lg:min-w-0"
                                aria-label="Close override menu"
                              >
                                <X className="w-3 h-3" strokeWidth={1.75} />
                              </button>
                            </div>
                            <div className="flex flex-col gap-0.5 max-h-[18rem] overflow-y-auto custom-scrollbar">
                              {TEAM_LIST.filter((t) => t.id !== "all").map(
                                (team) => {
                                  const isOwner = team.id === ownerTeamId;
                                  return (
                                    <button
                                      type="button"
                                      key={team.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRouteToTeam(report.id, team.id);
                                      }}
                                      className="flex items-center gap-2 px-2 py-3 text-left text-[12px] text-white hover:bg-white/[0.06] hover:text-white rounded transition-colors min-h-[44px] lg:py-1.5 lg:min-h-0"
                                    >
                                      <span
                                        className="h-2 w-2 shrink-0 rounded-full"
                                        style={{ backgroundColor: team.color }}
                                      />
                                      <span className="flex-1 truncate">
                                        {team.shortLabel}
                                      </span>
                                      {isOwner && (
                                        <span className="text-[10px] text-white/70 uppercase tracking-wide">
                                          Default
                                        </span>
                                      )}
                                    </button>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {readOnly && (
                    <UpvoteButton
                      reportId={report.id}
                      severity={report.severity}
                      size="sm"
                      className="self-center shrink-0"
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    ),
    [
      filteredReports,
      focusedReportId,
      activeRouteMenuId,
      routeNotification,
      toastLeaving,
      dispatchingId,
      reducedMotion,
      selectedTeam,
      selectedCategory,
      minSeverity,
      activeStatuses,
      colorMode,
      categoriesList,
      lockedTeam,
      readOnly,
      activeTeamMeta,
      handleRouteToTeam,
      handleToggleStatus,
    ],
  );

  return (
    <div className="h-full w-full flex-1 min-h-0 relative overflow-hidden flex bg-background select-none">
      <style>{`@keyframes fmPanelIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}`}</style>

      {/* Presenter control for the injected-report beat (demo mode only —
          renders nothing otherwise). Top-left, clear of the map controls on the
          right and the legend stack below. */}
      <div className="pointer-events-none absolute left-3 top-3 z-30">
        <DemoInject />
      </div>

      {/* Full-viewport map */}
      <div className="absolute inset-0 z-0 h-full w-full pointer-events-auto">
        <ReportMap
          reports={filteredReports}
          center={center}
          zoom={zoom}
          focusId={focusedReportId}
          onSelectMarker={handleSelectMarker}
          minSeverity={minSeverity}
          setMinSeverity={setMinSeverity}
          activeStatuses={activeStatuses}
          setActiveStatuses={setActiveStatuses}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          isFullscreen={true}
          mapTheme={mapTheme}
          onMapThemeChange={setMapTheme}
          colorMode={colorMode}
          onColorModeChange={setColorMode}
        />
      </div>

      {/* Mobile dispatch FAB — bottom-left, above safe area, hidden on desktop.
          Offset is +3.5rem above the HUD pill (same corner, same base offset) to
          prevent the two elements from stacking on top of each other. */}
      <button
        type="button"
        onClick={() => setIsDispatchSheetOpen(true)}
        className="lg:hidden absolute bottom-[calc(env(safe-area-inset-bottom,0px)+3.5rem)] left-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-[#2e2e33] text-white shadow-lg active:scale-95 transition-transform pointer-events-auto"
        aria-label="Open dispatch panel"
      >
        <ListFilter className="h-5 w-5" strokeWidth={1.75} />
        {filteredReports.length > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-[1rem] rounded-full bg-[#f4f4f5] text-[#131316] text-[9px] font-bold flex items-center justify-center px-0.5 tabular-nums">
            {filteredReports.length > 99 ? "99+" : filteredReports.length}
          </span>
        )}
      </button>

      {/* Mobile bottom-sheet for dispatch panel */}
      <BottomSheet
        open={isDispatchSheetOpen}
        onClose={() => setIsDispatchSheetOpen(false)}
        title={`${readOnly ? "Nearby" : lockedTeam ? "Reports" : "Dispatch"} · ${filteredReports.length} reports`}
        className="bg-[#2e2e33] text-white"
      >
        {dispatchPanelContent}
      </BottomSheet>

      {/* Desktop side panel — Dispatch (hidden on mobile). Frosted dark glass
          (`glassChrome`): one translucent tint + blur + saturation so it reads
          as glass over any basemap while white text stays legible. */}
      <LiquidGlassCard
        className={`hidden lg:flex absolute top-16 right-4 bottom-4 w-[280px] pointer-events-auto z-10 overflow-hidden ${glassChrome}`}
        style={
          reducedMotion
            ? undefined
            : { animation: "fmPanelIn 300ms cubic-bezier(0.16,1,0.3,1)" }
        }
        contentClassName={`${glassSheen} p-4 text-white flex flex-col overflow-hidden`}
        borderRadius="20px"
        blurIntensity="xl"
        shadowIntensity="lg"
        glowIntensity="none"
      >
        {/* Panel header */}
        <div className="flex items-center justify-between shrink-0 mb-3">
          <h2 className="text-[15px] font-semibold text-white">
            {readOnly ? "Nearby" : lockedTeam ? "Reports" : "Dispatch"}
          </h2>
          <span className="text-[13px] text-white tabular-nums">
            {filteredReports.length} reports
          </span>
        </div>

        {/* Shared dispatch content — same content as mobile bottom-sheet */}
        <div className="flex-1 overflow-hidden">{dispatchPanelContent}</div>
      </LiquidGlassCard>
    </div>
  );
}
