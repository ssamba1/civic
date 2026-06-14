"use client";

import { RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closeWorkOrder,
  dispatchWorkOrder,
  fetchQueuedWorkOrders,
  rejectReport,
} from "@/app/staff/actions";
import { Drawer } from "@/components/ui/drawer";
import {
  addDemoReport,
  demoWorkOrderFromReport,
  getDemoReportsSnapshot,
  isDemoId,
  resetDemoReports,
} from "@/lib/demo-reports";
import type {
  Classification,
  Report,
  WorkOrder,
  WorkOrderWithDetails,
} from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { KeyboardNav } from "./keyboard-nav";
import { WorkOrderDetail } from "./work-order-detail";
import { WorkOrderCard, WorkOrderRowControlled } from "./work-order-row";

/** How often (ms) the inbox polls for new work orders. Short interval so new
 *  reports auto-populate the inbox near-instantly (live demo). */
const POLL_INTERVAL_MS = 3_000;

// Active = still moving through the pipeline; resolved = closed.
const ACTIVE_STATUSES = new Set<string>(["open", "dispatched", "in_progress"]);

type FilterTab =
  | "all"
  | "active"
  | "open"
  | "dispatched"
  | "in_progress"
  | "resolved";

const TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "All" },
  // Grouped pills carried over from the resident "my reports" view.
  { value: "active", label: "Active" },
  { value: "open", label: "Open" },
  { value: "dispatched", label: "Dispatched" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
];

interface StaffInboxProps {
  workOrders: WorkOrderWithDetails[];
  /** ISO timestamp of when the page was server-rendered – used as the queue start point. */
  initialFetchedAt?: string;
}

export function StaffInbox({ workOrders, initialFetchedAt }: StaffInboxProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [detailOpenIndex, setDetailOpenIndex] = useState<number | null>(null);
  // Mobile drawer state — tracks which work order is open in the Drawer
  const [mobileDrawerIndex, setMobileDrawerIndex] = useState<number | null>(
    null,
  );

  // --- Queue state ---
  const [displayedOrders, setDisplayedOrders] =
    useState<WorkOrderWithDetails[]>(workOrders);
  const [pendingQueue, setPendingQueue] = useState<WorkOrderWithDetails[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastFetchedAtRef = useRef<string>(
    initialFetchedAt ?? new Date().toISOString(),
  );
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevents a slow fetch response from overlapping with the next tick.
  const fetchInFlightRef = useRef(false);

  // Background poll: every POLL_INTERVAL_MS, fetch new work orders and merge
  // them straight into the list (auto-populate — no manual refresh needed).
  useEffect(() => {
    const poll = async () => {
      if (fetchInFlightRef.current) return;
      fetchInFlightRef.current = true;
      try {
        const result = await fetchQueuedWorkOrders(lastFetchedAtRef.current);
        if (!result.ok || result.data.length === 0) return;
        // Prefer server-supplied fetchedAt (avoids client clock skew); fall back to
        // max created_at among the returned rows so the cursor stays server-anchored.
        const nextCursor =
          result.fetchedAt ??
          result.data.reduce(
            (max, o) =>
              o.report?.created_at && o.report.created_at > max
                ? o.report.created_at
                : max,
            lastFetchedAtRef.current,
          );
        setDisplayedOrders((prev) => {
          const existingIds = new Set(prev.map((o) => o.id));
          const fresh = result.data.filter((o) => !existingIds.has(o.id));
          if (fresh.length === 0) return prev;
          lastFetchedAtRef.current = nextCursor;
          return [...fresh, ...prev];
        });
        setSelectedIndex(0);
      } finally {
        fetchInFlightRef.current = false;
      }
    };

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh toggles the live demo data point (the fallen tree). First click
  // injects it — into the inbox here, and via the shared overlay store into
  // every other surface (map, delegation, analytics, dashboard) at once, also
  // flushing any queued items. A second click removes it everywhere. Same
  // button is the on/off switch — there is no separate reset control.
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    if (getDemoReportsSnapshot().length > 0) {
      resetDemoReports();
      setDisplayedOrders((prev) => prev.filter((o) => !isDemoId(o.report_id)));
    } else {
      const demoReport = addDemoReport();
      const demoOrder = demoWorkOrderFromReport(demoReport);
      setDisplayedOrders((prev) => [demoOrder, ...pendingQueue, ...prev]);
      setPendingQueue([]);
      setSelectedIndex(0);
    }
    // Brief spinner flash. Track the timer so rapid clicks don't queue
    // overlapping timers that flip the spinner off prematurely.
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => setIsRefreshing(false), 600);
  }, [pendingQueue]);

  // Cancel any pending spinner timer on unmount.
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const filtered = useMemo(() => {
    let result = displayedOrders;

    // Filter by status tab. "active" / "resolved" are the grouped pills from
    // the resident view; the rest match an exact report status.
    if (activeTab === "active") {
      result = result.filter((wo) =>
        ACTIVE_STATUSES.has(wo.report?.status ?? ""),
      );
    } else if (activeTab === "resolved") {
      result = result.filter((wo) => wo.report?.status === "closed");
    } else if (activeTab !== "all") {
      result = result.filter((wo) => wo.report?.status === activeTab);
    }

    // Search by address or category
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((wo) => {
        const addr = wo.report?.address?.toLowerCase() ?? "";
        const cat = wo.classification?.category?.toLowerCase() ?? "";
        const subcat = wo.classification?.subcategory?.toLowerCase() ?? "";
        return addr.includes(q) || cat.includes(q) || subcat.includes(q);
      });
    }

    return result;
  }, [displayedOrders, activeTab, search]);

  // Counts for tab badges
  const counts = useMemo(() => {
    const c = {
      all: displayedOrders.length,
      active: 0,
      open: 0,
      dispatched: 0,
      in_progress: 0,
      resolved: 0,
    };
    for (const wo of displayedOrders) {
      const st = wo.report?.status;
      if (st === "open") c.open++;
      else if (st === "dispatched") c.dispatched++;
      else if (st === "in_progress") c.in_progress++;
      else if (st === "closed") c.resolved++;
      if (ACTIVE_STATUSES.has(st ?? "")) c.active++;
    }
    return c;
  }, [displayedOrders]);

  // Summary tiles (folded in from the resident "my reports" surface):
  // total work orders, how many are still moving, how many are resolved,
  // and the resolution rate. Computed over the full displayed set so the
  // numbers stay stable regardless of the active tab/search.
  const summary = useMemo(() => {
    const total = displayedOrders.length;
    const resolved = displayedOrders.filter(
      (wo) => wo.report?.status === "closed",
    ).length;
    const active = displayedOrders.filter((wo) =>
      ACTIVE_STATUSES.has(wo.report?.status ?? ""),
    ).length;
    const pctResolved = total === 0 ? 0 : Math.round((resolved / total) * 100);
    return { total, active, resolved, pctResolved };
  }, [displayedOrders]);

  // Track which work-order ids were already on the board last render so newly
  // arrived rows (poll-prepended / demo-injected) can play a one-shot entrance
  // animation while existing rows stay put. First render seeds the set without
  // animating everything. Pure-CSS approach — no animation library.
  const seenIdsRef = useRef<Set<string> | null>(null);
  const newIds = useMemo(() => {
    const prev = seenIdsRef.current;
    const fresh = new Set<string>();
    if (prev) {
      for (const wo of displayedOrders) {
        if (!prev.has(wo.id)) fresh.add(wo.id);
      }
    }
    seenIdsRef.current = new Set(displayedOrders.map((o) => o.id));
    return fresh;
  }, [displayedOrders]);

  // Keep selectedIndex in bounds
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  const handleSelect = useCallback((idx: number) => {
    setSelectedIndex(idx);
  }, []);

  const handleOpenDetail = useCallback(() => {
    setDetailOpenIndex(selectedIndex);
  }, [selectedIndex]);

  const handleCloseDetail = useCallback(() => {
    setDetailOpenIndex(null);
  }, []);

  const handleDispatch = useCallback(async () => {
    const wo = filtered[selectedIndex];
    if (!wo) return;
    await dispatchWorkOrder(wo.id);
    setDetailOpenIndex(null);
  }, [filtered, selectedIndex]);

  const handleCloseOrder = useCallback(async () => {
    const wo = filtered[selectedIndex];
    if (!wo) return;
    await closeWorkOrder(wo.id);
    setDetailOpenIndex(null);
  }, [filtered, selectedIndex]);

  const handleReject = useCallback(async () => {
    const wo = filtered[selectedIndex];
    if (!wo?.report) return;
    // Route through the same prompt flow used by the detail panel so the reason
    // is never silently hardcoded — the browser prompt is intentionally minimal
    // for the keyboard shortcut path; the detail panel has a richer UI.
    const reason = window.prompt("Rejection reason:");
    if (reason === null) return; // user cancelled
    if (!reason.trim()) return; // empty — server would reject anyway
    await rejectReport(wo.report.id, reason.trim());
    setDetailOpenIndex(null);
  }, [filtered, selectedIndex]);

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="border-b border-zinc-200 bg-white px-4 py-3 md:px-6 md:py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Work Order Inbox
            </h1>
            <p className="text-sm text-zinc-500">
              {filtered.length} work order{filtered.length !== 1 ? "s" : ""}
              {activeTab !== "all" && ` (${activeTab.replace("_", " ")})`}
            </p>
          </div>

          {/* Refresh button – injects the live demo report (and flushes any
              queued incoming reports) into the inbox + every other surface. */}
          <button
            type="button"
            onClick={handleRefresh}
            className={cn(
              "relative flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all",
              "border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-500 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30",
            )}
            title="Add a live report (demo)"
          >
            <RefreshCw
              className={cn("h-4 w-4", isRefreshing && "animate-spin")}
            />
            <span>Refresh</span>
            {pendingQueue.length > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white shadow">
                {pendingQueue.length}
              </span>
            )}
          </button>
        </div>

        {/* Summary tiles — folded in from the resident "my reports" view */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Total"
            value={String(summary.total)}
            hint="Work orders on the board"
          />
          <StatTile
            label="Being worked on"
            value={String(summary.active)}
            hint={summary.active === 0 ? "Queue is clear" : "Crews are on it"}
          />
          <StatTile
            label="Resolved"
            value={String(summary.resolved)}
            hint={summary.resolved === 0 ? "None closed yet" : "Closed out"}
          />
          <StatTile
            label="% resolved"
            value={`${summary.pctResolved}%`}
            hint={
              summary.pctResolved >= 50
                ? "Strong throughput"
                : "Momentum building"
            }
          />
        </div>

        {/* Tabs + search */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Filter tabs */}
          <div className="flex gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800 scrollbar-none">
            {TABS.map((tab) => (
              <button
                type="button"
                key={tab.value}
                onClick={() => {
                  setActiveTab(tab.value);
                  setSelectedIndex(0);
                }}
                className={cn(
                  "flex min-h-11 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors md:min-h-0 md:px-3",
                  activeTab === tab.value
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    activeTab === tab.value
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                      : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
                  )}
                >
                  {counts[tab.value]}
                </span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Search address or category..."
              className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-10 pr-4 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 sm:w-72 sm:text-sm"
            />
          </div>
        </div>
      </div>

      {/* Mobile card list (<md) */}
      <div
        key={`m-${activeTab}`}
        className="flex-1 animate-in fade-in overflow-auto duration-150 md:hidden"
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <SlidersHorizontal className="mb-4 h-12 w-12 text-zinc-300 dark:text-zinc-600" />
            <p className="text-lg font-medium text-zinc-600 dark:text-zinc-400">
              No work orders found
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {search
                ? "Try a different search term"
                : "No work orders match the selected filter"}
            </p>
          </div>
        ) : (
          <div className="space-y-2 p-3">
            {filtered.map((wo, idx) => {
              if (!wo.report || !wo.classification) return null;
              return (
                <WorkOrderCard
                  key={wo.id}
                  report={wo.report as unknown as Report}
                  classification={
                    wo.classification as unknown as Classification
                  }
                  workOrder={wo as unknown as WorkOrder}
                  isSelected={selectedIndex === idx}
                  onSelect={() => setSelectedIndex(idx)}
                  onDetailOpen={() => setMobileDrawerIndex(idx)}
                  isNew={newIds.has(wo.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Mobile drawer — work order detail */}
      {(() => {
        if (mobileDrawerIndex === null) return null;
        const wo = filtered[mobileDrawerIndex];
        if (!wo?.report || !wo?.classification) return null;
        return (
          <Drawer
            open={true}
            onClose={() => setMobileDrawerIndex(null)}
            title={wo.report.address ?? "Work Order"}
            side="right"
          >
            <WorkOrderDetail
              report={wo.report as unknown as Report}
              classification={wo.classification as unknown as Classification}
              workOrder={wo as unknown as WorkOrder}
              onClose={() => setMobileDrawerIndex(null)}
              standalone={false}
            />
          </Drawer>
        );
      })()}

      {/* Desktop table (md+) */}
      <div
        key={`d-${activeTab}`}
        className="hidden flex-1 animate-in fade-in overflow-auto duration-150 md:block"
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <SlidersHorizontal className="mb-4 h-12 w-12 text-zinc-300 dark:text-zinc-600" />
            <p className="text-lg font-medium text-zinc-600 dark:text-zinc-400">
              No work orders found
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {search
                ? "Try a different search term"
                : "No work orders match the selected filter"}
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Sev</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Est</th>
                <th className="hidden px-4 py-3 xl:table-cell">Materials</th>
                <th className="px-4 py-3">Status</th>
                <th className="hidden px-4 py-3 lg:table-cell">Photo</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((wo, idx) => {
                if (!wo.report || !wo.classification) return null;
                return (
                  <WorkOrderRowControlled
                    key={wo.id}
                    report={wo.report as unknown as Report}
                    classification={
                      wo.classification as unknown as Classification
                    }
                    workOrder={wo as unknown as WorkOrder}
                    isSelected={selectedIndex === idx}
                    onSelect={() => setSelectedIndex(idx)}
                    detailOpen={detailOpenIndex === idx}
                    onDetailOpen={() => setDetailOpenIndex(idx)}
                    onDetailClose={() => setDetailOpenIndex(null)}
                    isNew={newIds.has(wo.id)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Keyboard nav footer — desktop only */}
      <KeyboardNav
        totalItems={filtered.length}
        selectedIndex={selectedIndex}
        onSelect={handleSelect}
        detailOpen={detailOpenIndex !== null}
        onOpenDetail={handleOpenDetail}
        onCloseDetail={handleCloseDetail}
        onDispatch={handleDispatch}
        onClose={handleCloseOrder}
        onReject={handleReject}
      />
    </div>
  );
}

/** Compact summary tile for the inbox header (staff zinc theme, light/dark). */
function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/40">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-zinc-400">{hint}</p>
    </div>
  );
}
