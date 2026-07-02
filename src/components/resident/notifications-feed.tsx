"use client";

import {
  Activity,
  CheckCircle2,
  type LucideIcon,
  Megaphone,
  MessageSquare,
  RotateCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, PillGroup } from "@/components/analytics/bento-primitives";
import type { NotificationItem } from "@/lib/resident-data";
import { cn } from "@/lib/utils/cn";
import { timeAgo } from "@/lib/utils/time-ago";

/* ------------------------------------------------------------------
   Resident updates feed — status changes on the resident's own
   reports plus city-wide announcements. Reuses the Apple-dark tokens
   (card #1c1c1e, white/[0.06] hairlines, status tones). Unread rows
   carry an accent dot + a subtle bg wash; tapping a report-linked row
   marks it read and routes into the report detail.
   ------------------------------------------------------------------ */

type FeedFilter = "all" | "unread";

const FILTER_OPTIONS: { value: FeedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
];

const TYPE_META: Record<
  NotificationItem["type"],
  { icon: LucideIcon; color: string }
> = {
  resolved: { icon: CheckCircle2, color: "#30d158" },
  status: { icon: Activity, color: "#0a84ff" },
  announcement: { icon: Megaphone, color: "#ff9f0a" },
  comment: { icon: MessageSquare, color: "#5ac8fa" },
};

export function NotificationsFeed({
  items,
}: {
  // `undefined` is the load-failure sentinel (the server parent passes it when
  // the feed couldn't be fetched) — distinct from `[]`, which is a legit empty
  // feed. Rendered as an error state with Retry rather than "all caught up".
  items?: NotificationItem[];
}) {
  const router = useRouter();
  const loadFailed = items === undefined;
  const safeItems = items ?? [];
  const [filter, setFilter] = useState<FeedFilter>("all");
  // Brief confirmation window after "Mark all read" — flips the label to a
  // checkmark for ~1.2s so the bulk action gets visible acknowledgement.
  const [marked, setMarked] = useState(false);
  // Track ids the resident has read this session, layered over the
  // server-provided `read` flag.
  const [readIds, setReadIds] = useState<Set<string>>(
    () => new Set(safeItems.filter((i) => i.read).map((i) => i.id)),
  );

  // Merge server-side reads from refreshed `items` while preserving reads
  // the resident made locally this session.
  useEffect(() => {
    setReadIds((prev) => {
      const serverRead = safeItems.filter((i) => i.read && !prev.has(i.id));
      if (serverRead.length === 0) return prev;
      const next = new Set(prev);
      serverRead.forEach((i) => {
        next.add(i.id);
      });
      return next;
    });
  }, [safeItems]);

  const isRead = (i: NotificationItem) => readIds.has(i.id);

  const unreadCount = useMemo(
    () => safeItems.filter((i) => !readIds.has(i.id)).length,
    [safeItems, readIds],
  );

  const visible = useMemo(
    () =>
      filter === "unread"
        ? safeItems.filter((i) => !readIds.has(i.id))
        : safeItems,
    [safeItems, filter, readIds],
  );

  const markRead = (id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const markAllRead = () => {
    setReadIds(new Set(safeItems.map((i) => i.id)));
    setMarked(true);
    setTimeout(() => setMarked(false), 1200);
  };

  const handleClick = (item: NotificationItem) => {
    markRead(item.id);
    if (item.reportId) {
      router.push(`/user/my-reports/${item.reportId}`);
    }
  };

  // Load failure (items === undefined) reads distinctly from a legit empty feed
  // so a fetch error doesn't masquerade as "all caught up". router.refresh()
  // re-runs the server parent's data fetch. NOTE: this only triggers if the
  // (non-owned) server parent actually passes `undefined` on failure — today it
  // may always pass an array, in which case this branch is dormant.
  if (loadFailed) {
    return (
      <section className="rounded-[14px] border border-hairline bg-surface shadow-[var(--shadow-card)]">
        <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <p className="text-[13px] text-subtle">Couldn&apos;t load updates.</p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-hairline bg-overlay px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-overlay-strong"
          >
            <RotateCw
              className="h-3.5 w-3.5"
              strokeWidth={2}
              aria-hidden="true"
            />
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[14px] border border-hairline bg-surface shadow-[var(--shadow-card)]">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-hairline">
        <PillGroup
          options={FILTER_OPTIONS}
          value={filter}
          onChange={setFilter}
        />
        <button
          type="button"
          onClick={markAllRead}
          disabled={unreadCount === 0 && !marked}
          className={cn(
            "flex min-h-[44px] items-center gap-1 text-[12px] transition-colors",
            marked
              ? "text-[#30d158] cursor-default"
              : unreadCount === 0
                ? "text-faint cursor-default"
                : "text-[var(--color-primary)] hover:text-[#3b9dff]",
          )}
        >
          {marked ? (
            <>
              <CheckCircle2
                className="h-3.5 w-3.5"
                strokeWidth={2}
                aria-hidden="true"
              />
              Done
            </>
          ) : (
            "Mark all read"
          )}
        </button>
      </header>

      {visible.length === 0 ? (
        <EmptyState
          message={
            filter === "unread"
              ? "You're all caught up."
              : "No updates yet — file a report to start tracking it here."
          }
        />
      ) : (
        <ul
          key={filter}
          className="custom-scrollbar divide-y divide-hairline animate-in fade-in duration-200 md:max-h-[600px] md:overflow-y-auto"
        >
          {visible.map((item) => {
            const meta = TYPE_META[item.type];
            const Icon = meta.icon;
            const read = isRead(item);
            const clickable = Boolean(item.reportId);

            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleClick(item)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors min-h-[44px]",
                    !read && "bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)]",
                    clickable ? "hover:bg-overlay" : "cursor-default",
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
                    <p className="mt-0.5 text-[13px] leading-relaxed text-subtle">
                      {item.body}
                    </p>
                  </div>

                  {!read && (
                    // role="img" so the aria-label is honored (generic role
                    // drops it), exposing this decorative dot as an "Unread"
                    // status graphic to screen readers.
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
      )}
    </section>
  );
}
