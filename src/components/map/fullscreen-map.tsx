"use client";

import { useState, useMemo, useCallback } from "react";
import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { ReportMap, type MapTheme } from "@/components/map/report-map";
import { LiquidGlassCard } from "@/components/ui/liquid-glass";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import {
  TEAM_LIST,
  TEAMS as TEAM_META,
  categoryToTeam,
  type TeamId,
} from "@/lib/teams";
import { useCategoryOverrides } from "@/lib/category-overrides";
import {
  Sliders,
  Clock,
  Star,
  CheckCircle2,
  Send,
  Shield,
  ChevronDown,
  X,
} from "lucide-react";

interface FullscreenMapOrchestratorProps {
  reports: DashboardReport[];
  center: [number, number];
  zoom: number;
  cityName: string;
}

// Hoisted to module scope — these were previously rebuilt inside the
// .map() callback on every render, allocating 4 strings × N reports each frame.
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  dispatched: "Dispatched",
  in_progress: "In progress",
  closed: "Resolved",
};
const STATUS_TONE: Record<string, string> = {
  open: "text-[#ff9f0a]",
  dispatched: "text-[#0a84ff]",
  in_progress: "text-[#5ac8fa]",
  closed: "text-[#30d158]",
};

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
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
  cityName,
}: FullscreenMapOrchestratorProps) {
  // Local mutable reports state (to allow dynamic routing/updating status!)
  const [reports, setReports] = useState<DashboardReport[]>(initialReports);

  // Subscribe to category-level routing overrides. `categoryToTeam` reads
  // the module-level snapshot, but the memo'd filter below needs a dep
  // that ticks when a dispatcher re-aims a category from the routing
  // matrix — that's what `categoryOverrides` provides here.
  const { overrides: categoryOverrides } = useCategoryOverrides();

  // --- Map theme (lifted from ReportMap so Dispatch panel can react) ---
  const [mapTheme, setMapTheme] = useState<MapTheme>("dark");
  const isLightBasemap = mapTheme === "light";

  // --- Active Filters State ---
  const [selectedTeam, setSelectedTeam] = useState<TeamId>("all");
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | null>(null);
  const [minSeverity, setMinSeverity] = useState<number>(1);
  const [activeStatuses, setActiveStatuses] = useState<ReportStatus[]>([
    "open",
    "dispatched",
    "in_progress",
    "closed",
  ]);
  const activeTeamMeta = TEAM_META[selectedTeam];

  // --- Interaction & Selection States ---
  const [focusedReportId, setFocusedReportId] = useState<string | null>(null);

  // Routing UI state: keeps track of which report ID has the routing dropdown active
  const [activeRouteMenuId, setActiveRouteMenuId] = useState<string | null>(null);

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

  // --- Filter Logic ---
  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (selectedTeam !== "all" && categoryToTeam(report.category) !== selectedTeam) {
        return false;
      }
      if (selectedCategory && report.category !== selectedCategory) return false;
      if (report.severity < minSeverity) return false;
      if (!activeStatuses.includes(report.status)) return false;
      return true;
    });
  }, [reports, selectedTeam, selectedCategory, minSeverity, activeStatuses, categoryOverrides]);

  // Toggle status filter helper
  const handleToggleStatus = (status: ReportStatus) => {
    if (activeStatuses.includes(status)) {
      if (activeStatuses.length > 1) {
        setActiveStatuses(activeStatuses.filter((s) => s !== status));
      }
    } else {
      setActiveStatuses([...activeStatuses, status]);
    }
  };

  // Route/Assign to team action
  const handleRouteToTeam = (reportId: string, teamId: TeamId) => {
    setReports((prevReports) =>
      prevReports.map((r) => {
        if (r.id === reportId) {
          return {
            ...r,
            status: "dispatched", // Move to dispatched status!
          };
        }
        return r;
      })
    );

    // Show beautiful HUD notification
    setRouteNotification({
      message: `Dispatched to ${TEAM_META[teamId].shortLabel}!`,
      reportId: reportId,
    });

    // Close routing menu
    setActiveRouteMenuId(null);

    // Auto clear notification after 3.5 seconds
    setTimeout(() => {
      setRouteNotification(null);
    }, 3500);
  };

  // Human-readable category list for dropdowns
  const categoriesList = useMemo(() => {
    const list: { key: ReportCategory; label: string }[] = [];
    reports.forEach((r) => {
      const meta = CATEGORY_META[r.category];
      if (meta && !list.find((item) => item.key === r.category)) {
        list.push({ key: r.category, label: meta.label });
      }
    });
    return list;
  }, [reports]);

  return (
    <div className="h-screen w-full relative overflow-hidden flex bg-black select-none">

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
        />
      </div>

      {/* Side panel — Dispatch */}
      <LiquidGlassCard
        className="absolute top-16 left-4 bottom-4 w-[280px] pointer-events-auto z-10 overflow-hidden animate-in slide-in-from-left-2 duration-300"
        contentClassName={`${
          isLightBasemap ? "bg-black/55" : "bg-black/10"
        } p-4 text-white flex flex-col overflow-hidden`}
        borderRadius="20px"
        blurIntensity="xl"
        shadowIntensity="none"
        glowIntensity="xs"
      >

        {/* Panel header */}
        <div className="flex items-center justify-between shrink-0 mb-3">
          <h2 className="text-[15px] font-semibold text-white">Dispatch</h2>
          <span className="text-[13px] text-zinc-300 tabular-nums">
            {filteredReports.length} reports
          </span>
        </div>

        {/* Active team banner */}
        {selectedTeam !== "all" && (
          <div
            className="mb-3 flex items-center gap-2 rounded-md border px-2.5 py-1.5 shrink-0"
            style={{
              borderColor: `${activeTeamMeta.color}55`,
              backgroundColor: `${activeTeamMeta.color}15`,
            }}
          >
            <Shield
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: activeTeamMeta.color }}
              strokeWidth={1.75}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-zinc-400">
                Viewing as
              </p>
              <p className="text-[12px] font-medium text-white leading-tight truncate">
                {activeTeamMeta.shortLabel}
              </p>
            </div>
            <button
              onClick={() => setSelectedTeam("all")}
              className="text-zinc-400 hover:text-white p-0.5 rounded"
              title="Switch back to All Teams"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
        )}

        {/* Route confirmation toast */}
        {routeNotification && (
          <div className="mb-3 bg-[#30d158]/10 border border-[#30d158]/20 rounded-lg p-3 flex items-center gap-2 shrink-0 animate-in fade-in slide-in-from-top-1 duration-150">
            <CheckCircle2 className="w-4 h-4 text-[#30d158] shrink-0" strokeWidth={1.75} />
            <p className="text-[13px] text-white/90 leading-tight">{routeNotification.message}</p>
          </div>
        )}

        {/* Scrollable column — filters scroll WITH the feed (not pinned) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 select-none flex flex-col gap-3">
          {/* Quick filters */}
          <div className="rounded-lg bg-white/[0.025] border border-white/[0.05] p-3 flex flex-col gap-3">
            {/* Team — primary scoping */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] text-zinc-300 flex items-center gap-1.5">
                <Shield className="w-3 h-3" strokeWidth={1.75} />
                Team view
              </label>
              <div className="relative">
                <select
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value as TeamId)}
                  className="w-full bg-black/40 border border-white/[0.08] rounded-md px-3 py-1.5 text-[13px] text-white focus:outline-none focus:border-white/20 cursor-pointer appearance-none pr-8 transition-colors"
                >
                  {TEAM_LIST.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.shortLabel}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" strokeWidth={1.75} />
              </div>
              <p className="text-[11px] text-zinc-500 leading-snug">
                {activeTeamMeta.duties}
              </p>
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-3">
              <label className="text-[12px] text-zinc-300">Category</label>
              <div className="relative">
                <select
                  value={selectedCategory || ""}
                  onChange={(e) => setSelectedCategory((e.target.value as ReportCategory) || null)}
                  className="w-full bg-black/40 border border-white/[0.08] rounded-md px-3 py-1.5 text-[13px] text-white focus:outline-none focus:border-white/20 cursor-pointer appearance-none pr-8 transition-colors"
                >
                  <option value="">All categories</option>
                  {categoriesList.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" strokeWidth={1.75} />
              </div>
            </div>

            {/* Severity */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[12px] text-zinc-300">
                <span>Min severity</span>
                <span className="text-white tabular-nums">
                  {minSeverity}+
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={minSeverity}
                onChange={(e) => setMinSeverity(parseInt(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
              />
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-3">
              <span className="text-[12px] text-zinc-300">Status</span>
              <div className="grid grid-cols-2 gap-1">
                {(["open", "dispatched", "in_progress", "closed"] as const).map((s) => {
                  const isChecked = activeStatuses.includes(s);
                  const displayNames: Record<string, string> = {
                    open: "Open",
                    dispatched: "Dispatched",
                    in_progress: "In progress",
                    closed: "Resolved",
                  };
                  return (
                    <button
                      key={s}
                      onClick={() => handleToggleStatus(s)}
                      className={`rounded px-2 py-1 text-[12px] text-left transition-colors ${
                        isChecked
                          ? "bg-white/[0.08] text-white"
                          : "bg-transparent text-zinc-400 hover:text-white hover:bg-white/[0.03]"
                      }`}
                    >
                      {displayNames[s]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Divider — flows inside scroll too */}
          <div className="border-t border-white/10" />

          {/* Incident Feed list */}
          <div className="space-y-2">
          {filteredReports.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
              <Sliders className="w-7 h-7 opacity-25 mb-3" />
              <p className="text-sm text-zinc-300">No matching reports</p>
              <p className="text-xs text-zinc-500 mt-1">Adjust filters to see more.</p>
            </div>
          ) : (
            filteredReports.map((report) => {
              const meta = CATEGORY_META[report.category];
              const isSelected = focusedReportId === report.id;
              const isMenuOpen = activeRouteMenuId === report.id;
              const ownerTeamId = categoryToTeam(report.category);
              const ownerTeam = TEAM_META[ownerTeamId];

              return (
                <div
                  key={report.id}
                  onClick={() => setFocusedReportId(isSelected ? null : report.id)}
                  className={`p-3 rounded-lg transition-colors cursor-pointer flex flex-col gap-1.5 ${
                    isSelected
                      ? "bg-white/[0.08]"
                      : "bg-transparent hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-white leading-tight">
                      {meta.label}
                    </span>
                    <span
                      className={`text-[12px] ${STATUS_TONE[report.status] ?? "text-zinc-400"}`}
                    >
                      {STATUS_LABEL[report.status] ?? report.status}
                    </span>
                  </div>

                  <p className="text-[12px] text-zinc-300 leading-tight line-clamp-1">
                    {report.address}
                  </p>

                  {/* Auto-assigned team chip */}
                  <div
                    className="inline-flex self-start items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      borderColor: `${ownerTeam.color}66`,
                      backgroundColor: `${ownerTeam.color}1f`,
                      color: ownerTeam.color,
                    }}
                  >
                    {ownerTeam.shortLabel}
                  </div>

                  <div className="flex items-center justify-between text-[12px] text-zinc-400">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" strokeWidth={1.75} />
                      {formatTimeAgo(report.created_at)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Star className="w-3 h-3" strokeWidth={1.75} />
                      {report.severity}/5
                    </span>
                  </div>

                  {/* Route action */}
                  {isSelected && (
                    <div className="mt-2 pt-2.5 border-t border-white/[0.06] flex flex-col gap-2 relative z-20 animate-in fade-in duration-150">
                      {!isMenuOpen ? (
                        <div className="flex gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRouteToTeam(report.id, ownerTeamId);
                            }}
                            disabled={report.status === "closed"}
                            className="flex-1 py-1.5 bg-[#0a84ff] hover:bg-[#0070e0] text-white rounded-md text-[12px] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Send className="w-3 h-3" strokeWidth={1.75} />
                            Auto-dispatch
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveRouteMenuId(report.id);
                            }}
                            disabled={report.status === "closed"}
                            className="px-2 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 rounded-md text-[12px] flex items-center justify-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Override target team"
                          >
                            Override
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1 bg-black/40 border border-white/[0.08] rounded-md p-2 animate-in fade-in duration-100 pointer-events-auto">
                          <div className="flex justify-between items-center pb-1 mb-1 text-[12px] text-zinc-400">
                            <span>Override target team</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveRouteMenuId(null);
                              }}
                              className="p-0.5 hover:bg-white/[0.06] rounded text-zinc-400 hover:text-white"
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
                                    key={team.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRouteToTeam(report.id, team.id);
                                    }}
                                    className="flex items-center gap-2 px-2 py-1.5 text-left text-[12px] text-zinc-300 hover:bg-white/[0.06] hover:text-white rounded transition-colors"
                                  >
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-full"
                                      style={{ backgroundColor: team.color }}
                                    />
                                    <span className="flex-1 truncate">
                                      {team.shortLabel}
                                    </span>
                                    {isOwner && (
                                      <span className="text-[10px] text-[#0a84ff] uppercase tracking-wide">
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
              );
            })
          )}
          </div>
        </div>

      </LiquidGlassCard>

    </div>
  );
}
