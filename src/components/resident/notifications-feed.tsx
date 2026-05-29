"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CheckCircle2,
  Megaphone,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";

import type { NotificationItem } from "@/lib/resident-data";
import { timeAgo } from "@/lib/utils/time-ago";
import { cn } from "@/lib/utils/cn";
import { PillGroup, EmptyState } from "@/components/analytics/bento-primitives";

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

export function NotificationsFeed({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<FeedFilter>("all");
  // Track ids the resident has read this session, layered over the
  // server-provided `read` flag.
  const [readIds, setReadIds] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.read).map((i) => i.id)),
  );

  const isRead = (i: NotificationItem) => readIds.has(i.id);

  const unreadCount = useMemo(
    () => items.filter((i) => !readIds.has(i.id)).length,
    [items, readIds],
  );

  const visible = useMemo(
    () => (filter === "unread" ? items.filter((i) => !readIds.has(i.id)) : items),
    [items, filter, readIds],
  );

  const markRead = (id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const markAllRead = () => setReadIds(new Set(items.map((i) => i.id)));

  const handleClick = (item: NotificationItem) => {
    markRead(item.id);
    if (item.reportId) {
      router.push(`/user/my-reports/${item.reportId}`);
    }
  };

  return (
    <section className="rounded-[14px] border border-white/[0.06] bg-[#1c1c1e] shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06]">
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
            "flex min-h-[44px] items-center text-[12px] transition-colors",
            unreadCount === 0
              ? "text-zinc-600 cursor-default"
              : "text-[#0a84ff] hover:text-[#3b9dff]",
          )}
        >
          Mark all read
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
        <ul className="custom-scrollbar divide-y divide-white/[0.06] md:max-h-[600px] md:overflow-y-auto">
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
                    !read && "bg-[#0a84ff]/[0.04]",
                    clickable ? "hover:bg-white/[0.03]" : "cursor-default",
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
                      <p className="truncate text-[14px] font-medium text-white">
                        {item.title}
                      </p>
                      <span className="flex-shrink-0 text-[12px] tabular-nums text-zinc-500">
                        {timeAgo(item.at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-400">
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
      )}
    </section>
  );
}
