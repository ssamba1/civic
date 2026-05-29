"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Search, SlidersHorizontal, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { WorkOrderWithDetails } from "@/lib/types";
import type {
  Report,
  Classification,
  WorkOrder,
  ReportStatus,
} from "@/lib/types";
import { WorkOrderRowControlled } from "./work-order-row";
import { KeyboardNav } from "./keyboard-nav";
import {
  dispatchWorkOrder,
  closeWorkOrder,
  rejectReport,
  fetchQueuedWorkOrders,
} from "@/app/staff/actions";

/** How often (ms) the inbox polls for queued items in the background. */
const POLL_INTERVAL_MS = 30_000;

type FilterTab = "all" | "open" | "dispatched" | "in_progress";

const TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "dispatched", label: "Dispatched" },
  { value: "in_progress", label: "In Progress" },
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

  // --- Queue state ---
  const [displayedOrders, setDisplayedOrders] = useState<WorkOrderWithDetails[]>(workOrders);
  const [pendingQueue, setPendingQueue] = useState<WorkOrderWithDetails[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastFetchedAtRef = useRef<string>(initialFetchedAt ?? new Date().toISOString());

  // Background poll: every POLL_INTERVAL_MS, check for new work orders
  useEffect(() => {
    const poll = async () => {
      const result = await fetchQueuedWorkOrders(lastFetchedAtRef.current);
      if (!result.ok || result.data.length === 0) return;
      // Deduplicate against already-displayed and already-queued items
      const existingIds = new Set([
        ...displayedOrders.map((o) => o.id),
        ...pendingQueue.map((o) => o.id),
      ]);
      const fresh = result.data.filter((o) => !existingIds.has(o.id));
      if (fresh.length > 0) {
        setPendingQueue((prev) => [...fresh, ...prev]);
        lastFetchedAtRef.current = new Date().toISOString();
      }
    };

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Merge queued items into the displayed list
  const handleRefresh = useCallback(() => {
    if (pendingQueue.length === 0) return;
    setIsRefreshing(true);
    setDisplayedOrders((prev) => [...pendingQueue, ...prev]);
    setPendingQueue([]);
    setSelectedIndex(0);
    // Brief spinner flash
    setTimeout(() => setIsRefreshing(false), 600);
  }, [pendingQueue]);

  const filtered = useMemo(() => {
    let result = displayedOrders;

    // Filter by status tab
    if (activeTab !== "all") {
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
    const c = { all: displayedOrders.length, open: 0, dispatched: 0, in_progress: 0 };
    for (const wo of displayedOrders) {
      const st = wo.report?.status;
      if (st === "open") c.open++;
      else if (st === "dispatched") c.dispatched++;
      else if (st === "in_progress") c.in_progress++;
    }
    return c;
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
    await rejectReport(wo.report.id, "Rejected via keyboard shortcut");
    setDetailOpenIndex(null);
  }, [filtered, selectedIndex]);

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
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

          {/* Refresh button – flushes queued incoming reports into the list */}
          <button
            onClick={handleRefresh}
            disabled={pendingQueue.length === 0 && !isRefreshing}
            className={cn(
              "relative flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all",
              pendingQueue.length > 0
                ? "border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-500 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                : "border-zinc-200 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800"
            )}
            title={pendingQueue.length > 0 ? `Load ${pendingQueue.length} new report${pendingQueue.length !== 1 ? "s" : ""}` : "No new reports"}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                isRefreshing && "animate-spin"
              )}
            />
            <span>Refresh</span>
            {pendingQueue.length > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white shadow">
                {pendingQueue.length}
              </span>
            )}
          </button>
        </div>

        {/* Tabs + search */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Filter tabs */}
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setActiveTab(tab.value);
                  setSelectedIndex(0);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  activeTab === tab.value
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    activeTab === tab.value
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                      : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
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
              className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 sm:w-72"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
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
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Keyboard nav footer */}
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
