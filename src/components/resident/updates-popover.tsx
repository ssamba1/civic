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
  RotateCw,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PillGroup } from "@/components/analytics/bento-primitives";
import BottomSheet from "@/components/ui/bottom-sheet";
import { fetchResidentNotifications } from "@/lib/notifications-actions";
import type { NotificationItem } from "@/lib/resident-data";
import { statusChipClass } from "@/lib/status";
import { cn } from "@/lib/utils/cn";
import { lockBodyScroll } from "@/lib/utils/scroll-lock";
import { timeAgo } from "@/lib/utils/time-ago";

type FeedFilter = "all" | "unread";

const FILTER_OPTIONS: { value: FeedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
];

// color is set only when the notification type IS a status (resolved/status
// update) — that's the one place hue is warranted here (state, not
// decoration). Announcement/comment stay grayscale, rendered via swatchClass
// below instead of an inline tint.
const TYPE_META: Record<
  NotificationItem["type"],
  { icon: LucideIcon; color?: string; label: string }
> = {
  resolved: { icon: CheckCircle2, color: "#3d9a63", label: "Resolved" },
  status: { icon: Activity, color: "#5b6b8c", label: "Status update" },
  announcement: { icon: Megaphone, label: "Announcement" },
  comment: { icon: MessageSquare, label: "Comment" },
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

  // Fetch the feed. Shared by the lazy first-open effect and the error-state
  // Retry button. `loadTick` bumps to force a re-fetch after a failure (the
  // open-effect alone won't re-fire — its deps don't change on retry).
  const [loadTick, setLoadTick] = useState(0);
  const retry = useCallback(() => {
    setError(null);
    setItems(null);
    setLoadTick((t) => t + 1);
  }, []);

  // Lazy-fetch on first open (and on each retry). `loading` is intentionally
  // omitted from deps: including it re-runs the effect when setLoading(true)
  // fires, cancelling the in-flight fetch before it resolves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: loading is a re-entrancy guard; loadTick forces an intentional re-fetch on retry
  useEffect(() => {
    if (!open || items !== null || loading) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
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
  }, [open, items, loadTick]);

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
  }, [open, detail, closeDetail]);

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
          "focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] focus-visible:ring-offset-0",
          active || open
            ? "bg-overlay-strong text-foreground shadow-[inset_0_0_0_1px_var(--hairline)]"
            : "text-subtle hover:bg-overlay hover:text-foreground",
        )}
      >
        <span className="relative inline-flex">
          <Bell
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-colors duration-150",
              active || open
                ? "text-[var(--color-primary)]"
                : "text-faint group-hover:text-subtle",
            )}
            strokeWidth={2}
            aria-hidden="true"
          />
          {unreadCount > 0 && (
            <span
              className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]"
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
        onRetry={retry}
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
            "rounded-[var(--radius-lg)] border border-hairline bg-glass backdrop-blur-xl",
            "shadow-[var(--shadow-pop)]",
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
            onRetry={retry}
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
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="flex items-center gap-2.5">
          <p className="text-[14px] font-semibold tracking-tight text-foreground">
            Updates
          </p>
          {unreadCount > 0 && (
            <span className="rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-primary)]">
              {unreadCount} new
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close updates"
          className="rounded-md p-1 text-faint transition-colors hover:bg-overlay hover:text-foreground"
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
              ? "cursor-default text-faint"
              : "text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]",
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
  onRetry,
}: {
  loading: boolean;
  items: NotificationItem[] | null;
  error: string | null;
  filter: FeedFilter;
  visible: NotificationItem[];
  readIds: Set<string>;
  openDetail: (item: NotificationItem) => void;
  onRetry: () => void;
}) {
  if (loading && items === null) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] text-faint">
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
      <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
        <p className="text-[13px] text-subtle">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--radius-md)] border border-hairline bg-overlay px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-overlay-strong"
        >
          <RotateCw
            className="h-3.5 w-3.5"
            strokeWidth={2}
            aria-hidden="true"
          />
          Retry
        </button>
      </div>
    );
  }
  if (visible.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-[13px] text-faint">
        {filter === "unread"
          ? "You're all caught up."
          : "No updates yet — file a report to start tracking it here."}
      </div>
    );
  }
  return (
    <ul className="custom-scrollbar max-h-[60vh] overflow-y-auto divide-y divide-hairline">
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
                !read && "bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)]",
                "hover:bg-overlay",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg",
                  !meta.color && "bg-elevated",
                )}
                style={meta.color ? { background: `${meta.color}1f` } : undefined}
              >
                <Icon
                  className={cn("h-4 w-4", !meta.color && "text-subtle")}
                  strokeWidth={2}
                  style={meta.color ? { color: meta.color } : undefined}
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-[14px] font-medium text-foreground">
                    {item.title}
                  </p>
                  <span className="flex-shrink-0 text-[12px] tabular-nums text-faint">
                    {timeAgo(item.at)}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-subtle">
                  {item.body}
                </p>
              </div>
              {!read && (
                <span
                  role="img"
                  className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-[var(--color-primary)]"
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
  onRetry,
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
  onRetry: () => void;
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
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-hairline">
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
                ? "cursor-default text-faint"
                : "text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]",
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
          onRetry={onRetry}
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
          "rounded-t-[var(--radius-lg)] sm:rounded-[var(--radius-lg)]",
          "border border-hairline-strong bg-surface shadow-[0_30px_80px_rgba(0,0,0,0.65)]",
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
          className="absolute right-3 top-3 z-10 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-subtle transition-colors hover:bg-overlay-strong hover:text-foreground"
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
          </div>
        ) : null}

        <div className="px-5 pb-5 pt-5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-md",
                !meta.color && "bg-elevated",
              )}
              style={meta.color ? { background: `${meta.color}1f` } : undefined}
            >
              <Icon
                className={cn("h-3.5 w-3.5", !meta.color && "text-subtle")}
                strokeWidth={2}
                style={meta.color ? { color: meta.color } : undefined}
                aria-hidden="true"
              />
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
              {meta.label}
            </span>
            <span className="ml-auto text-[12px] tabular-nums text-faint">
              {timeAgo(item.at)}
            </span>
          </div>

          <h2 className="mt-3 text-[20px] font-semibold tracking-tight text-foreground leading-snug">
            {item.title}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-subtle">
            {item.body}
          </p>

          {snap && (
            <div className="mt-4 rounded-[var(--radius-lg)] border border-hairline bg-overlay p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: snap.categoryColor }}
                    aria-hidden="true"
                  />
                  <p className="truncate text-[14px] font-medium text-foreground">
                    {snap.categoryLabel}
                  </p>
                </div>
                <span
                  className={cn(
                    "flex-shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium",
                    statusChipClass(snap.status),
                  )}
                >
                  {snap.statusLabel}
                </span>
              </div>
              <dl className="mt-3 space-y-1.5 text-[12.5px] text-subtle">
                <div className="flex items-start gap-2">
                  <MapPin
                    className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-faint"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span>{snap.address}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Clock
                    className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-faint"
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
              className="min-h-[44px] rounded-md px-3 py-1.5 text-[13px] font-medium text-subtle transition-colors hover:bg-overlay hover:text-foreground"
            >
              Close
            </button>
            {item.reportId && (
              <Link
                href={`/user/my-reports/${item.reportId}`}
                onClick={onClose}
                className={cn(
                  "inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-[13px] font-medium text-[var(--accent-contrast)]",
                  "transition-colors duration-150 hover:bg-[var(--color-primary-hover)]",
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
