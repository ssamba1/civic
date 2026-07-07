"use client";

import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { MemberRow } from "@/lib/db/members";
import { TEAMS, type TeamId } from "@/lib/teams";

interface MembersTableProps {
  members: MemberRow[];
}

type RoleFilter = "all" | MemberRow["role"];

const FILTERS: ReadonlyArray<{ key: RoleFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "admin", label: "Admins" },
  { key: "staff_supervisor", label: "Supervisors" },
  { key: "staff_dispatcher", label: "Dispatchers" },
  { key: "resident", label: "Residents" },
];

// Grayscale role badges — differentiation is carried by fill weight and outline,
// never hue, so the enterprise register stays monochrome.
const ROLE_META: Record<MemberRow["role"], { label: string; badge: string }> = {
  admin: {
    label: "Admin",
    badge: "border-transparent bg-accent text-accent-contrast",
  },
  staff_supervisor: {
    label: "Supervisor",
    badge: "border-hairline-strong bg-overlay-strong text-foreground",
  },
  staff_dispatcher: {
    label: "Dispatcher",
    badge: "border-hairline bg-overlay text-subtle",
  },
  resident: {
    label: "Resident",
    badge: "border-transparent bg-transparent text-faint",
  },
};

function teamLabel(key: string | null): string {
  if (!key) return "—";
  const meta = TEAMS[key as TeamId];
  return meta ? meta.shortLabel : key;
}

// Coarse relative time — "just now" / "3d ago" / "2mo ago". Small enough to keep
// local; no date library dependency.
function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function MembersTable({ members }: MembersTableProps) {
  const [role, setRole] = useState<RoleFilter>("all");
  const [query, setQuery] = useState("");
  const searchId = useId();

  const counts = useMemo(() => {
    const map: Record<RoleFilter, number> = {
      all: members.length,
      admin: 0,
      staff_supervisor: 0,
      staff_dispatcher: 0,
      resident: 0,
    };
    for (const m of members) map[m.role] += 1;
    return map;
  }, [members]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return members.filter((m) => {
      if (role !== "all" && m.role !== role) return false;
      if (!needle) return true;
      return (
        (m.displayName ?? "").toLowerCase().includes(needle) ||
        (m.email ?? "").toLowerCase().includes(needle)
      );
    });
  }, [members, role, query]);

  return (
    <div className="flex flex-col gap-4">
      {/* Controls — role chips + text search. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="toolbar"
          aria-label="Filter members by role"
          aria-orientation="horizontal"
        >
          {FILTERS.map(({ key, label }) => {
            const active = role === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setRole(key)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 h-8 text-[13px] font-medium",
                  "transition-colors duration-150 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  active
                    ? "border-transparent bg-accent-soft text-accent-text"
                    : "border-hairline bg-overlay text-subtle hover:bg-overlay-strong hover:text-foreground",
                ].join(" ")}
              >
                {label}
                <span
                  className={[
                    "tabular-nums text-[11px]",
                    active ? "text-accent-text/70" : "text-faint",
                  ].join(" ")}
                >
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative sm:w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
            strokeWidth={2}
            aria-hidden="true"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email"
            aria-label="Search members by name or email"
            className={[
              "h-8 w-full rounded-[var(--radius-md)] border border-hairline bg-surface pl-8 pr-2.5 text-[13px] text-foreground",
              "placeholder:text-faint outline-none transition-colors duration-150",
              "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            ].join(" ")}
          />
        </div>
      </div>

      {/* Roster table. */}
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-hairline text-[11px] uppercase tracking-wide text-faint">
              <th scope="col" className="px-4 py-3 font-medium">
                Member
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Role
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Team
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Reports
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Last active
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Last sign-in
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <p className="text-sm font-medium text-foreground">
                    No members match
                  </p>
                  <p className="mt-1 text-[13px] text-faint">
                    Try a different role filter or clear the search.
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((m) => {
                const meta = ROLE_META[m.role];
                return (
                  <tr
                    key={m.id}
                    className="border-b border-hairline last:border-b-0 transition-colors duration-150 hover:bg-overlay"
                  >
                    <td className="px-4 py-3 align-middle">
                      <div className="font-medium text-foreground">
                        {m.displayName ?? "Unnamed"}
                      </div>
                      <div className="text-[12px] text-faint">
                        {m.email ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span
                        className={[
                          "inline-flex items-center rounded-[var(--radius-md)] border px-2 py-0.5 text-[11px] font-medium",
                          meta.badge,
                        ].join(" ")}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="text-subtle">{teamLabel(m.teamKey)}</div>
                      {m.isShared && (
                        <div className="text-[11px] text-faint">
                          Shared login
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle text-right tabular-nums text-foreground">
                      {m.reportCount}
                    </td>
                    <td className="px-4 py-3 align-middle text-subtle">
                      {relativeTime(m.lastActiveAt)}
                    </td>
                    <td className="px-4 py-3 align-middle text-subtle">
                      {relativeTime(m.lastSignInAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
