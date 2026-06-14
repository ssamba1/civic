"use client";

import {
  Activity,
  Bell,
  CheckCircle2,
  Clock,
  Loader2,
  type LucideIcon,
  MapPin,
  Megaphone,
  MessageSquare,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PillGroup } from "@/components/analytics/bento-primitives";
import BottomSheet from "@/components/ui/bottom-sheet";
import { fetchResidentNotifications } from "@/lib/notifications-actions";
import type { NotificationItem } from "@/lib/resident-data";
import { cn } from "@/lib/utils/cn";
import { lockBodyScroll } from "@/lib/utils/scroll-lock";
import { timeAgo } from "@/lib/utils/time-ago";

type FeedFilter = "all" | "unread";

const FILTER_OPTIONS: { value: FeedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
];

const TYPE_META: Record<
  NotificationItem["type"],
  { icon: LucideIcon; color: string; label: string }
> = {
  resolved: { icon: CheckCircle2, color: "#30d158", label: "Resolved" },
  status: { icon: Activity, color: "#0a84ff", label: "Status update" },
  announcement: { icon: Megaphone, color: "#ff9f0a", label: "Announcement" },
  comment: { icon: MessageSquare, color: "#5ac8fa", label: "Comment" },
};

const STATUS_TONE: Record<string, string> = {
  open: "text-[#ff9f0a] bg-[#ff9f0a]/10",
  dispatched: "text-[#0a84ff] bg-[#0a84ff]/10",
  in_progress: "text-[#5ac8fa] bg-[#5ac8fa]/10",
  closed: "text-[#30d158] bg-[#30d158]/10",
  merged: "text-zinc-400 bg-white/[0.06]",
  rejected: "text-[#ff453a] bg-[#ff453a]/10",
};

// Exit-animation duration (ms) — kept in sync with the `duration-150` enter so
// the close mirrors the open. Used to defer unmount until the CSS animate-out
// finishes (no framer-motion / AnimatePresence available — no new deps).
const EXIT_MS = 150;

export function UpdatesPopover({ active = false }: { active?: boolean }) {
  const [open, setOpen] = useState(false);
  // Mirror of `open` that stays true through the exit animation, plus a flag
  // that flips the panel into its data-[closing] exit variant for one frame
  // before unmount.
  const [dropdownMounted, setDropdownMounted] = useState(false);
  const [dropdownClosing, setDropdownClosing] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<NotificationItem | null>(null);
  const [detailClosing, setDetailClosing] = useState(false);

  // Keep the desktop dropdown mounted through its exit animation. On open it
  // mounts immediately; on close it plays animate-out then unmounts.
  useEffect(() => {
    if (open) {
      setDropdownMounted(true);
      setDropdownClosing(false);
      return;
    }
    if (!dropdownMounted) return;
    setDropdownClosing(true);
    const id = setTimeout(() => setDropdownMounted(false), EXIT_MS);
    return () => clearTimeout(id);
  }, [open, dropdownMounted]);

  // Animated dismiss for the detail modal — plays the exit variant, then clears.
  const closeDetail = useCallback(() => {
    setDetailClosing(true);
    setTimeout(() => {
      setDetail(null);
      setDetailClosing(false);
    }, EXIT_MS);
  }, []);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Lazy-fetch on first open. `loading` is intentionally omitted from deps:
  // including it re-runs the effect when setLoading(true) fires, cancelling the
  // in-flight fetch before it resolves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: loading is a re-entrancy guard; including it would cancel the in-flight fetch
  useEffect(() => {
    if (!open || items !== null || loading) return;
    let cancelled = false;
    setLoading(true);
    fetchResidentNotifications()
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        setReadIds(new Set(data.filter((i) => i.read).map((i) => i.id)));
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load updates.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, items]);

  // Click outside + Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      if (detail) return; // detail modal handles its own dismiss
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (detail) closeDetail();
      else setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, detail]);

  // Focus management for the desktop dropdown: move focus into the panel on
  // open, restore it to the trigger on close, so keyboard users aren't
  // stranded behind a closed popover. Guarded by wasOpenRef so the initial
  // mount (open=false) never steals focus. The mobile path is a BottomSheet,
  // which manages its own focus.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const raf = requestAnimationFrame(() => {
        const panel = panelRef.current;
        if (!panel) return;
        const first = panel.querySelector<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        (first ?? panel).focus();
      });
      return () => cancelAnimationFrame(raf);
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  const unreadCount = useMemo(() => {
    if (!items) return 0;
    return items.filter((i) => !readIds.has(i.id)).length;
  }, [items, readIds]);

  const visible = useMemo(() => {
    if (!items) return [];
    return filter === "unread"
      ? items.filter((i) => !readIds.has(i.id))
      : items;
  }, [items, filter, readIds]);

  const markRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    if (!items) return;
    setReadIds(new Set(items.map((i) => i.id)));
  }, [items]);

  const openDetail = useCallback(
    (item: NotificationItem) => {
      markRead(item.id);
      setDetail(item);
    },
    [markRead],
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Updates"
        title="Updates"
        className={cn(
          "group relative inline-flex h-7 items-center gap-1.5 rounded-md px-2 sm:px-2.5 text-[13px] font-medium",
          "transition-colors duration-150 outline-none",
          "focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-0",
          active || open
            ? "bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
            : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
        )}
      >
        <span className="relative inline-flex">
          <Bell
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-colors duration-150",
              active || open
                ? "text-[#0a84ff]"
                : "text-zinc-500 group-hover:text-zinc-300",
            )}
            strokeWidth={2}
            aria-hidden="true"
          />
          {unreadCount > 0 && (
            <span
              className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[#ff453a] shadow-[0_0_6px_rgba(255,69,58,0.6)]"
              aria-hidden="true"
            />
          )}
        </span>
        <span className="hidden md:inline">Updates</span>
      </button>

      {/*
       * MOBILE (< sm=640px): render as a BottomSheet that portals to body,
       *   escaping any transform/backdrop-filter containing block in the nav.
       * DESKTOP (sm+): render the original fixed dropdown panel.
       *
       * We use a single <UpdatesFeedContent> helper to avoid duplicating the
       * feed markup. The dropdown wrapper is hidden on mobile via "hidden sm:block"
       * and the BottomSheet is hidden on sm+ via the `open` prop (never opened).
       */}

      {/* Mobile bottom-sheet (hidden on sm+ by only passing open on narrow viewports) */}
      <MobileUpdatesSheet
        open={open}
        onClose={() => setOpen(false)}
        loading={loading}
        items={items}
        error={error}
        filter={filter}
        setFilter={setFilter}
        unreadCount={unreadCount}
        visible={visible}
        markAllRead={markAllRead}
        readIds={readIds}
        openDetail={openDetail}
      />

      {/* Desktop dropdown — hidden on mobile, shown on sm+. Stays mounted
          through the exit animation via dropdownMounted/dropdownClosing so
          close mirrors the open instead of snapping out. */}
      {dropdownMounted && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Updates"
          tabIndex={-1}
          data-state={dropdownClosing ? "closed" : "open"}
          className={cn(
            // hidden below sm, present on sm+
            "hidden sm:block",
            "fixed right-3 sm:right-6 top-[60px] z-50 w-[min(420px,calc(100vw-1.5rem))]",
            "rounded-[14px] border border-white/[0.06] bg-[#1c1c1e]/95 backdrop-blur-xl",
            "shadow-[0_24px_60px_rgba(0,0,0,0.55)]",
            "duration-150",
            "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-top-1",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-top-1",
          )}
        >
          <UpdatesFeedHeader
            unreadCount={unreadCount}
            onClose={() => setOpen(false)}
            filter={filter}
            setFilter={setFilter}
            markAllRead={markAllRead}
          />
          <UpdatesFeedBody
            loading={loading}
            items={items}
            error={error}
            filter={filter}
            visible={visible}
            readIds={readIds}
            openDetail={openDetail}
          />
        </div>
      )}

      {detail && (
        <DetailModal
          item={detail}
          closing={detailClosing}
          onClose={closeDetail}
        />
      )}
    </>
  );
}

// ─── Shared sub-components ──────────────────────────────────────────────────

function UpdatesFeedHeader({
  unreadCount,
  onClose,
  filter,
  setFilter,
  markAllRead,
}: {
  unreadCount: number;
  onClose: () => void;
  filter: FeedFilter;
  setFilter: (v: FeedFilter) => void;
  markAllRead: () => void;
}) {
  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <p className="text-[14px] font-semibold tracking-tight text-white">
            Updates
          </p>
          {unreadCount > 0 && (
            <span className="rounded-full bg-[#0a84ff]/15 px-1.5 py-0.5 text-[11px] font-medium text-[#0a84ff]">
              {unreadCount} new
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close updates"
          className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <PillGroup
          options={FILTER_OPTIONS}
          value={filter}
          onChange={setFilter}
        />
        <button
          type="button"
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className={cn(
            "text-[12px] transition-colors",
            unreadCount === 0
              ? "cursor-default text-zinc-600"
              : "text-[#0a84ff] hover:text-[#3b9dff]",
          )}
        >
          Mark all read
        </button>
      </div>
    </>
  );
}

function UpdatesFeedBody({
  loading,
  items,
  error,
  filter,
  visible,
  readIds,
  openDetail,
}: {
  loading: boolean;
  items: NotificationItem[] | null;
  error: string | null;
  filter: FeedFilter;
  visible: NotificationItem[];
  readIds: Set<string>;
  openDetail: (item: NotificationItem) => void;
}) {
  if (loading && items === null) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] text-zinc-500">
        <Loader2
          className="h-3.5 w-3.5 animate-spin"
          strokeWidth={2}
          aria-hidden="true"
        />
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-4 py-8 text-center text-[13px] text-zinc-500">
        {error}
      </div>
    );
  }
  if (visible.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-[13px] text-zinc-500">
        {filter === "unread"
          ? "You're all caught up."
          : "No updates yet — file a report to start tracking it here."}
      </div>
    );
  }
  return (
    <ul className="custom-scrollbar max-h-[60vh] overflow-y-auto divide-y divide-white/[0.06]">
      {visible.map((item) => {
        const meta = TYPE_META[item.type];
        const Icon = meta.icon;
        const read = readIds.has(item.id);

        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => openDetail(item)}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors",
                !read && "bg-[#0a84ff]/[0.04]",
                "hover:bg-white/[0.03]",
              )}
            >
              <span
                className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                style={{ background: `${meta.color}1f` }}
              >
                <Icon
                  className="h-4 w-4"
                  strokeWidth={2}
                  style={{ color: meta.color }}
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-[14px] font-medium text-white">
                    {item.title}
                  </p>
                  <span className="flex-shrink-0 text-[12px] tabular-nums text-zinc-500">
                    {timeAgo(item.at)}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-zinc-400">
                  {item.body}
                </p>
              </div>
              {!read && (
                <span
                  className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-[#0a84ff]"
                  aria-label="Unread"
                />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Mobile bottom-sheet wrapper ────────────────────────────────────────────

function MobileUpdatesSheet({
  open,
  onClose,
  loading,
  items,
  error,
  filter,
  setFilter,
  unreadCount,
  visible,
  markAllRead,
  readIds,
  openDetail,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  items: NotificationItem[] | null;
  error: string | null;
  filter: FeedFilter;
  setFilter: (v: FeedFilter) => void;
  unreadCount: number;
  visible: NotificationItem[];
  markAllRead: () => void;
  readIds: Set<string>;
  openDetail: (item: NotificationItem) => void;
}) {
  // We only render the sheet on the client (BottomSheet portals to body).
  // On sm+, the CSS on BottomSheet's outer wrapper won't matter because the
  // desktop dropdown handles its own visibility. We do want to avoid
  // double-rendering the feed on desktop, so we gate on a CSS media check
  // via a simple hook.
  // Seed from matchMedia on the first client render so we don't paint a null
  // sheet (and miss the user's tap) for one frame on mobile. SSR yields false,
  // but BottomSheet itself renders null until its own mount effect, so the
  // first client render still matches the server output — no hydration mismatch.
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 639px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Only mount the sheet when we're on mobile; desktop uses the dropdown.
  if (!isMobile) return null;

  return (
    <BottomSheet open={open} onClose={onClose} title="Updates">
      <div className="-mx-5">
        {/* Reuse the filter bar (without the close button — sheet header handles it) */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.06]">
          <PillGroup
            options={FILTER_OPTIONS}
            value={filter}
            onChange={setFilter}
          />
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className={cn(
              "min-h-[44px] px-2 text-[12px] transition-colors",
              unreadCount === 0
                ? "cursor-default text-zinc-600"
                : "text-[#0a84ff] hover:text-[#3b9dff]",
            )}
          >
            Mark all read
          </button>
        </div>
        <UpdatesFeedBody
          loading={loading}
          items={items}
          error={error}
          filter={filter}
          visible={visible}
          readIds={readIds}
          openDetail={openDetail}
        />
      </div>
    </BottomSheet>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function DetailModal({
  item,
  closing,
  onClose,
}: {
  item: NotificationItem;
  closing: boolean;
  onClose: () => void;
}) {
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;
  const snap = item.reportSnapshot;
  const filed = new Date(item.at);

  // Lock scroll while open (the modal mounts only while a detail is selected).
  useEffect(() => lockBodyScroll(), []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      data-state={closing ? "closed" : "open"}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        data-state={closing ? "closed" : "open"}
        className={cn(
          "absolute inset-0 bg-black/70 backdrop-blur-sm duration-150",
          "data-[state=open]:animate-in data-[state=open]:fade-in",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out",
        )}
      />
      <div
        data-state={closing ? "closed" : "open"}
        className={cn(
          // Mobile: full-width, rounded top corners only, slide up from bottom.
          // sm+: centered card with full rounded corners, max-w-lg.
          "relative w-full max-w-[min(100%,32rem)] overflow-hidden",
          "rounded-t-[20px] sm:rounded-[16px]",
          "border border-white/[0.08] bg-[#1c1c1e] shadow-[0_30px_80px_rgba(0,0,0,0.65)]",
          "duration-150",
          "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-bottom-4 sm:data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-bottom-4 sm:data-[state=closed]:zoom-out-95",
          // Safe-area bottom inset on mobile so content isn't under the home bar.
          "pb-safe",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>

        {snap?.photoUrl ? (
          <div className="relative h-44 w-full bg-black">
            <Image
              src={snap.photoUrl}
              alt={snap.categoryLabel}
              fill
              sizes="(min-width: 640px) 512px, 100vw"
              className="object-cover opacity-90"
              unoptimized
            />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#1c1c1e] to-transparent" />
          </div>
        ) : null}

        <div className="px-5 pb-5 pt-5">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-md"
              style={{ background: `${meta.color}1f` }}
            >
              <Icon
                className="h-3.5 w-3.5"
                strokeWidth={2}
                style={{ color: meta.color }}
                aria-hidden="true"
              />
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
              {meta.label}
            </span>
            <span className="ml-auto text-[12px] tabular-nums text-zinc-500">
              {timeAgo(item.at)}
            </span>
          </div>

          <h2 className="mt-3 text-[20px] font-semibold tracking-tight text-white leading-snug">
            {item.title}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-zinc-300">
            {item.body}
          </p>

          {snap && (
            <div className="mt-4 rounded-[12px] border border-white/[0.06] bg-black/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: snap.categoryColor }}
                    aria-hidden="true"
                  />
                  <p className="truncate text-[14px] font-medium text-white">
                    {snap.categoryLabel}
                  </p>
                </div>
                <span
                  className={cn(
                    "flex-shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium",
                    STATUS_TONE[snap.status] ?? "text-zinc-400 bg-white/[0.06]",
                  )}
                >
                  {snap.statusLabel}
                </span>
              </div>
              <dl className="mt-3 space-y-1.5 text-[12.5px] text-zinc-400">
                <div className="flex items-start gap-2">
                  <MapPin
                    className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-zinc-500"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span>{snap.address}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Clock
                    className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-zinc-500"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span>
                    Filed{" "}
                    {filed.toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </dl>
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-md px-3 py-1.5 text-[13px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
            >
              Close
            </button>
            {item.reportId && (
              <Link
                href={`/user/my-reports/${item.reportId}`}
                onClick={onClose}
                className={cn(
                  "inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-[#0a84ff] px-3 py-1.5 text-[13px] font-medium text-white",
                  "transition-colors duration-150 hover:bg-[#0070e0]",
                )}
              >
                Open full report
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
