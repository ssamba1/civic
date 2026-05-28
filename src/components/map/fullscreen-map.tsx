"use client";

import { useState, useMemo, useCallback } from "react";
import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { ReportMap } from "@/components/map/report-map";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { 
  Sliders, 
  MapPin, 
  Clock, 
  Star, 
  CheckCircle2, 
  ArrowUpRight, 
  RotateCcw,
  Truck,
  Send,
  Wrench,
  AlertTriangle,
  ChevronDown,
  X,
  Plus
} from "lucide-react";

interface FullscreenMapOrchestratorProps {
  reports: DashboardReport[];
  center: [number, number];
  zoom: number;
  cityName: string;
}

const TEAMS = [
  { name: "🚧 Paving Crew", key: "paving" },
  { name: "⚡ Electrical Grid", key: "electrical" },
  { name: "💧 Water & Sewer", key: "water" },
  { name: "🧹 Sanitation Dept", key: "sanitation" },
  { name: "🎨 Beautification Team", key: "beautification" },
  { name: "🚦 Traffic Eng.", key: "traffic" },
];

export function FullscreenMapOrchestrator({
  reports: initialReports,
  center,
  zoom,
  cityName,
}: FullscreenMapOrchestratorProps) {
  // Local mutable reports state (to allow dynamic routing/updating status!)
  const [reports, setReports] = useState<DashboardReport[]>(initialReports);

  // --- Active Filters State ---
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | null>(null);
  const [minSeverity, setMinSeverity] = useState<number>(1);
  const [activeStatuses, setActiveStatuses] = useState<ReportStatus[]>([
    "open",
    "dispatched",
    "in_progress",
    "closed",
  ]);

  // --- Interaction & Selection States ---
  const [focusedReportId, setFocusedReportId] = useState<string | null>(null);
  const [hoveredReportId, setHoveredReportId] = useState<string | null>(null);
  
  // Routing UI state: keeps track of which report ID has the routing dropdown active
  const [activeRouteMenuId, setActiveRouteMenuId] = useState<string | null>(null);
  
  // Success notifications/routing notifications
  const [routeNotification, setRouteNotification] = useState<{
    message: string;
    reportId: string;
  } | null>(null);

  // --- Filter Logic ---
  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (selectedCategory && report.category !== selectedCategory) return false;
      if (report.severity < minSeverity) return false;
      if (!activeStatuses.includes(report.status)) return false;
      return true;
    });
  }, [reports, selectedCategory, minSeverity, activeStatuses]);

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
  const handleRouteToTeam = (reportId: string, team: string) => {
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
      message: `Dispatched to ${team}!`,
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

  // Helper to format ISO to time elapsed
  const formatTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="h-[calc(100vh-56px)] w-full relative overflow-hidden flex bg-zinc-950 font-sans select-none">
      
      {/* 1. FULL VIEWPORT LIVE MAP */}
      <div className="absolute inset-0 z-0 h-full w-full pointer-events-auto">
        <ReportMap
          reports={filteredReports}
          center={center}
          zoom={zoom}
          focusId={focusedReportId}
          hoverId={hoveredReportId}
          onSelectMarker={(id) => setFocusedReportId(id)}
          minSeverity={minSeverity}
          setMinSeverity={setMinSeverity}
          activeStatuses={activeStatuses}
          setActiveStatuses={setActiveStatuses}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          isFullscreen={true}
        />
      </div>

      {/* --- Aesthetic HUD Vignette Shadow Overlay --- */}
      <div className="absolute inset-0 pointer-events-none z-5 shadow-[inset_0_0_80px_rgba(0,0,0,0.4)] rounded-none"></div>

      {/* 2. FLOATING FOGGY GLASS SIDE PANEL (Dispatch Station) */}
      <div className="absolute top-4 left-4 bottom-4 w-[380px] rounded-2xl bg-zinc-950/75 backdrop-blur-xl border border-white/10 p-5 text-white shadow-2xl flex flex-col pointer-events-auto z-10 overflow-hidden animate-in slide-in-from-left-6 duration-500">
        
        {/* Core header line */}
        <div className="absolute top-0 left-0 w-full h-[2px] bg-[#6366f1]/50" />

        {/* Panel Header */}
        <div className="flex items-center justify-between shrink-0 mt-1 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#6366f1]/15 border border-[#6366f1]/40 flex items-center justify-center backdrop-blur-md shadow-[0_0_10px_rgba(99,102,241,0.2)]">
              <Truck className="w-3.5 h-3.5 text-[#6366f1]" />
            </div>
            <div>
              <h2 className="font-bold text-sm tracking-tight text-white uppercase leading-none">Civic Dispatch HUD</h2>
              <p className="text-[9px] text-[#6366f1] font-mono uppercase tracking-widest mt-1">Live Intake Control</p>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-white/10 rounded-full text-[9px] font-mono font-bold tracking-widest border border-white/10 flex items-center gap-1.5 shadow-inner">
            <span className="w-1.5 h-1.5 rounded-full bg-[#6366f1] animate-ping" />
            {filteredReports.length} REPORTS
          </span>
        </div>

        {/* Glassmorphic Quick Filters */}
        <div className="bg-white/5 border border-white/5 rounded-xl p-4 shrink-0 flex flex-col gap-3.5 font-sans">
          
          {/* Category Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Category Filter</label>
            <div className="relative">
              <select
                value={selectedCategory || ""}
                onChange={(e) => setSelectedCategory((e.target.value as ReportCategory) || null)}
                className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/90 focus:outline-none focus:border-[#6366f1]/50 cursor-pointer appearance-none relative pr-8 hover:border-white/20 transition-all font-medium"
              >
                <option value="">All Incident Categories</option>
                {categoriesList.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Min Severity Slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-zinc-400">
              <span>Severity Threshold</span>
              <span className="font-mono text-amber-400 font-bold flex items-center gap-0.5">
                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
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
              className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white border border-white/5"
            />
          </div>

          {/* Active Status Row */}
          <div className="flex flex-col gap-1.5 border-t border-white/5 pt-3">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Active Statuses</span>
            <div className="grid grid-cols-2 gap-1">
              {(["open", "dispatched", "in_progress", "closed"] as const).map((s) => {
                const isChecked = activeStatuses.includes(s);
                const displayNames: Record<string, string> = {
                  open: "Open",
                  dispatched: "Dispatched",
                  in_progress: "In Progress",
                  closed: "Resolved",
                };
                return (
                  <button
                    key={s}
                    onClick={() => handleToggleStatus(s)}
                    className={`rounded px-2 py-1 text-[10px] text-left border flex items-center gap-1.5 transition-all font-semibold ${
                      isChecked
                        ? "bg-white/10 border-white/20 text-white shadow-inner"
                        : "bg-transparent border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10"
                    }`}
                  >
                    <span className={`w-1 h-1 rounded-full ${isChecked ? 'bg-white' : 'bg-zinc-700'}`}></span>
                    {displayNames[s]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action HUD Notification popover */}
        {routeNotification && (
          <div className="mt-3 bg-[#10b981]/15 border border-[#10b981]/40 rounded-xl p-3 flex items-center gap-3 shrink-0 animate-in fade-in slide-in-from-top-2 duration-300">
            <CheckCircle2 className="w-5 h-5 text-[#10b981] shrink-0 animate-bounce" />
            <div className="flex-grow">
              <div className="text-[10px] font-mono font-bold text-[#10b981] uppercase tracking-wider">CREW DISPATCHED</div>
              <p className="text-xs text-white/90 leading-tight mt-0.5">{routeNotification.message}</p>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-white/10 my-4 shrink-0" />

        {/* Scrollable Incident Feed */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 select-none">
          {filteredReports.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
              <Sliders className="w-8 h-8 opacity-20 mb-3" />
              <p className="text-sm font-semibold">No Incidents Matched</p>
              <p className="text-xs opacity-60 px-4 mt-1">Adjust filters above to widen telemetry range.</p>
            </div>
          ) : (
            filteredReports.map((report) => {
              const meta = CATEGORY_META[report.category];
              const isSelected = focusedReportId === report.id;
              const isHovered = hoveredReportId === report.id;
              const isMenuOpen = activeRouteMenuId === report.id;

              return (
                <div
                  key={report.id}
                  onMouseEnter={() => setHoveredReportId(report.id)}
                  onMouseLeave={() => setHoveredReportId(null)}
                  onClick={() => setFocusedReportId(isSelected ? null : report.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 relative overflow-hidden group select-none ${
                    isSelected
                      ? "bg-[#6366f1]/10 border-[#6366f1]/50 shadow-[0_0_15px_rgba(99,102,241,0.15)] scale-[0.99]"
                      : "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/8"
                  }`}
                >
                  {/* Selected indicator line */}
                  {isSelected && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#6366f1]" />
                  )}

                  {/* Top card metadata */}
                  <div className="flex items-center justify-between pl-1">
                    <div className="flex items-center gap-1.5">
                      <strong className="text-xs text-white font-bold leading-none">{meta.label}</strong>
                    </div>
                    
                    {/* Status Badge */}
                    <span 
                      className="px-2 py-0.5 rounded text-[8px] font-mono font-black uppercase tracking-wider border shrink-0"
                      style={{
                        backgroundColor: report.status === "closed" ? "#10b98122" : report.status === "dispatched" ? "#6366f122" : "#fbbf2415",
                        borderColor: report.status === "closed" ? "#10b98144" : report.status === "dispatched" ? "#6366f144" : "#fbbf2433",
                        color: report.status === "closed" ? "#10b981" : report.status === "dispatched" ? "#6366f1" : "#fbbf24",
                      }}
                    >
                      {report.status === "closed" ? "RESOLVED" : report.status === "dispatched" ? "DISPATCHED" : report.status === "in_progress" ? "IN PROGRESS" : "OPEN"}
                    </span>
                  </div>

                  {/* Body Address */}
                  <p className="text-[11px] text-zinc-300 pl-1 leading-tight line-clamp-1 group-hover:text-white transition-colors">{report.address}</p>

                  {/* Severity and Timestamp footer */}
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pl-1 pt-1 border-t border-white/5">
                    <span className="flex items-center gap-0.5 text-zinc-400">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      {formatTime(report.created_at)}
                    </span>
                    <span className="flex items-center gap-1 font-bold text-zinc-300">
                      Severity {report.severity}/5
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    </span>
                  </div>

                  {/* Dispatch Route Action Panel */}
                  {isSelected && (
                    <div className="mt-2.5 pt-2.5 border-t border-white/10 pl-1 flex flex-col gap-2 relative z-20 animate-in fade-in duration-200">
                      
                      {!isMenuOpen ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Stop parent click event from collapsing the card
                            setActiveRouteMenuId(report.id);
                          }}
                          disabled={report.status === "closed"}
                          className="w-full py-1.5 bg-[#6366f1]/15 hover:bg-[#6366f1] text-[#6366f1] hover:text-white font-bold rounded-lg border border-[#6366f1]/30 hover:border-[#6366f1] text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-inner"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {report.status === "dispatched" ? "Re-Route Incident" : "Route Incident"}
                        </button>
                      ) : (
                        <div className="flex flex-col gap-1 bg-zinc-900 border border-white/10 rounded-xl p-2 animate-in zoom-in-95 duration-200 pointer-events-auto">
                          <div className="flex justify-between items-center px-1 pb-1 border-b border-white/5 mb-1 text-[9px] uppercase tracking-widest text-zinc-500 font-mono">
                            <span>Select Target Team</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveRouteMenuId(null);
                              }}
                              className="p-0.5 hover:bg-white/10 rounded text-zinc-400 hover:text-white"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-1.5">
                            {TEAMS.map((team) => (
                              <button
                                key={team.key}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRouteToTeam(report.id, team.name);
                                }}
                                className="px-2 py-1.5 text-left text-[9px] font-bold text-white bg-white/5 border border-white/5 hover:bg-[#6366f1]/20 hover:border-[#6366f1]/40 rounded-lg transition-all flex items-center gap-1 leading-none"
                              >
                                {team.name}
                              </button>
                            ))}
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

    </div>
  );
}
